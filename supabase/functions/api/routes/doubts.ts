/**
 * /api/doubts -- the shared community forum. Ported from
 * server/src/routes/doubts.js.
 *
 * The feed is intentionally shared: every authenticated user can read every
 * doubt (that is the point of a forum), but only the author can edit, resolve
 * or delete their own. This reproduces that exactly -- no more, no less.
 */
import { json } from "../shared/cors.ts";
import { db, TABLES } from "../shared/db.ts";
import { protect } from "../shared/auth.ts";
import { serializeDoubt, serializeDoubtAnswer } from "../shared/serialize-doubts.ts";
import { aiConfigured, complete, modelFromRequest } from "../shared/ai.ts";
import { detectTopicKeyword, doubtAnswerPrompt } from "../shared/prompts.ts";
import { fallbackTutorAnswer } from "../shared/fallbacks-tutor.ts";
import { resourcesFor, sanitizeResources } from "../shared/resources.ts";
import { body, match, type RouteCtx, type RouteHandler } from "../shared/router.ts";


/** Answers for the given doubts, oldest first, grouped by doubt id. */
async function answersByDoubt(doubtIds: string[]): Promise<Map<string, Row[]>> {
  const map = new Map<string, Row[]>();
  if (!doubtIds.length) return map;

  const { data, error } = await db
    .from(TABLES.doubtAnswers)
    .select("*")
    .in("doubt_id", doubtIds)
    .order("created_at", { ascending: true });
  if (error) console.error(`[doubts] answers read failed: ${error.message}`);

  for (const a of (data ?? []) as Row[]) {
    const key = String(a.doubt_id);
    map.set(key, [...(map.get(key) ?? []), a]);
  }
  return map;
}

/** Loads one doubt with its answers nested, the shape the API always returned. */
async function doubtWithAnswers(id: string): Promise<Row | null> {
  const { data } = await db.from(TABLES.doubts).select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const grouped = await answersByDoubt([id]);
  return serializeDoubt(data as Row, grouped.get(id) ?? []);
}

/** GET /api/doubts?subject=&resolved=&q=&mine= -- the whole community feed. */
async function listDoubts(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const subject = ctx.url.searchParams.get("subject");
  const resolved = ctx.url.searchParams.get("resolved");
  const mine = ctx.url.searchParams.get("mine");
  const q = ctx.url.searchParams.get("q");

  let query = db.from(TABLES.doubts).select("*");
  if (subject && subject !== "All") query = query.eq("subject", subject);
  if (resolved === "true") query = query.eq("resolved", true);
  if (resolved === "false") query = query.eq("resolved", false);
  if (mine === "true") query = query.eq("user_id", user.id);
  if (q) {
    // Strip characters that would break the comma-separated or() grammar, then
    // match case-insensitively against title or body -- the old RegExp('i').
    const term = q.replace(/[,()%]/g, " ").trim();
    if (term) query = query.or(`title.ilike.%${term}%,body.ilike.%${term}%`);
  }

  const { data, error: qErr } = await query
    .order("resolved", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(60);
  if (qErr) {
    console.error(`[doubts] list failed: ${qErr.message}`);
    return json({ message: qErr.message }, 500);
  }

  const rows = (data ?? []) as Row[];
  const grouped = await answersByDoubt(rows.map((d) => String(d.id)));
  return json({ doubts: rows.map((d) => serializeDoubt(d, grouped.get(String(d.id)) ?? [])) });
}

/** GET /api/doubts/:id -- also counts a view. */
async function getDoubt(ctx: RouteCtx, params: Record<string, string>): Promise<Response> {
  const { error } = await protect(ctx.req);
  if (error) return error;

  const { data } = await db.from(TABLES.doubts).select("*").eq("id", params.id).maybeSingle();
  if (!data) return json({ message: "Doubt not found" }, 404);
  const doubt = data as Row;

  // Replaces findByIdAndUpdate({ $inc: { views: 1 } }, { new: true }). A plain
  // read-then-write can lose a concurrent increment, which is acceptable here.
  const { data: updated } = await db
    .from(TABLES.doubts)
    .update({ views: Number(doubt.views ?? 0) + 1 })
    .eq("id", params.id)
    .select("*")
    .single();

  const current = (updated as Row) ?? doubt;
  const grouped = await answersByDoubt([params.id]);
  return json({ doubt: serializeDoubt(current, grouped.get(params.id) ?? []) });
}

/**
 * POST /api/doubts { title, body, subject, tags, askAI }
 * Posting with askAI=true gets an immediate AI answer, so nobody stares at an
 * unanswered question -- peers can still add better answers underneath.
 */
async function createDoubt(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const uid = user.id as string;

  const b = await body(ctx.req);
  const title = String(b.title ?? "");
  const text = String(b.body ?? "");
  if (!title.trim() || !text.trim()) {
    return json({ message: "A doubt needs both a title and a description" }, 400);
  }

  const { data: created, error: insErr } = await db
    .from(TABLES.doubts)
    .insert({
      user_id: uid,
      author_name: user.name,
      title: title.trim(),
      body: text.trim(),
      subject: b.subject ? String(b.subject) : "General",
      tags: Array.isArray(b.tags) ? (b.tags as unknown[]).map(String).slice(0, 5) : [],
    })
    .select("*")
    .single();
  if (insErr) {
    console.error(`[doubts] create failed for ${uid}: ${insErr.message}`);
    return json({ message: insErr.message }, 500);
  }
  const doubt = created as Row;

  if (b.askAI !== false) {
    let answer: string;
    try {
      if (!aiConfigured()) throw new Error("no key");
      answer = await complete({
        prompt: doubtAnswerPrompt(title, text, String(doubt.subject), user),
        model: modelFromRequest(ctx.req),
      });
      if (!answer) throw new Error("empty");
    } catch (err) {
      console.error(`[doubts] falling back for doubt ${doubt.id}: ${(err as Error).message}`);
      answer = fallbackTutorAnswer(`${title} ${text}`);
    }

    const topicKeyword = detectTopicKeyword(`${title} ${text}`);
    const resources = topicKeyword ? sanitizeResources(resourcesFor(topicKeyword)) : [];
    const { error: aErr } = await db.from(TABLES.doubtAnswers).insert({
      doubt_id: doubt.id,
      author_id: null,
      author_name: "EduMind AI",
      is_ai: true,
      body: answer,
      resources,
    });
    if (aErr) console.error(`[doubts] AI answer insert failed for ${doubt.id}: ${aErr.message}`);
  }

  return json({ doubt: await doubtWithAnswers(String(doubt.id)) }, 201);
}

/** POST /api/doubts/:id/answers { body } */
async function addAnswer(ctx: RouteCtx, params: Record<string, string>): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const b = await body(ctx.req);
  const text = String(b.body ?? "");
  if (!text.trim()) return json({ message: "Write an answer first" }, 400);

  const { data: existing } = await db
    .from(TABLES.doubts).select("id").eq("id", params.id).maybeSingle();
  if (!existing) return json({ message: "Doubt not found" }, 404);

  const { error: insErr } = await db.from(TABLES.doubtAnswers).insert({
    doubt_id: params.id,
    author_id: user.id,
    author_name: user.name,
    is_ai: false,
    body: text.trim(),
  });
  if (insErr) {
    console.error(`[doubts] answer insert failed: ${insErr.message}`);
    return json({ message: insErr.message }, 500);
  }
  return json({ doubt: await doubtWithAnswers(params.id) }, 201);
}

/** POST /api/doubts/:id/answers/:answerId/upvote */
async function upvote(ctx: RouteCtx, params: Record<string, string>): Promise<Response> {
  const { error } = await protect(ctx.req);
  if (error) return error;

  const { data: existing } = await db
    .from(TABLES.doubts).select("id").eq("id", params.id).maybeSingle();
  if (!existing) return json({ message: "Doubt not found" }, 404);

  const { data: answer } = await db
    .from(TABLES.doubtAnswers)
    .select("*")
    .eq("id", params.answerId)
    .eq("doubt_id", params.id)
    .maybeSingle();
  if (!answer) return json({ message: "Answer not found" }, 404);
  const a = answer as Row;

  const { error: upErr } = await db
    .from(TABLES.doubtAnswers)
    .update({ upvotes: Number(a.upvotes ?? 0) + 1 })
    .eq("id", params.answerId);
  if (upErr) console.error(`[doubts] upvote failed: ${upErr.message}`);

  return json({ doubt: await doubtWithAnswers(params.id) });
}

/** PATCH /api/doubts/:id -- mark resolved (author only). */
async function patchDoubt(ctx: RouteCtx, params: Record<string, string>): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const { data: existing } = await db
    .from(TABLES.doubts).select("*").eq("id", params.id).eq("user_id", user.id).maybeSingle();
  if (!existing) return json({ message: "You can only edit your own doubts" }, 404);

  const b = await body(ctx.req);
  const patch: Row = {};
  if (b.resolved !== undefined) patch.resolved = Boolean(b.resolved);
  if (b.title) patch.title = b.title;
  if (b.body) patch.body = b.body;

  if (Object.keys(patch).length) {
    const { error: upErr } = await db
      .from(TABLES.doubts).update(patch).eq("id", params.id).eq("user_id", user.id);
    if (upErr) console.error(`[doubts] patch failed: ${upErr.message}`);
  }
  return json({ doubt: await doubtWithAnswers(params.id) });
}

async function deleteDoubt(ctx: RouteCtx, params: Record<string, string>): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const { data, error: delErr } = await db
    .from(TABLES.doubts).delete().eq("id", params.id).eq("user_id", user.id).select("id");
  if (delErr) console.error(`[doubts] delete failed: ${delErr.message}`);
  if (!data?.length) return json({ message: "You can only delete your own doubts" }, 404);
  return json({ message: "Doubt deleted" });
}

const DOUBTS_ROUTES: Record<string, [string, RouteHandler][]> = {
  GET: [["", listDoubts], [":id", getDoubt]],
  POST: [["", createDoubt], [":id/answers", addAnswer], [":id/answers/:answerId/upvote", upvote]],
  PATCH: [[":id", patchDoubt]],
  DELETE: [[":id", deleteDoubt]],
};

export async function handleDoubts(ctx: RouteCtx): Promise<Response | null> {
  const hit = match(DOUBTS_ROUTES, ctx);
  if (!hit) return null;
  return hit.handler(ctx, hit.params);
}
