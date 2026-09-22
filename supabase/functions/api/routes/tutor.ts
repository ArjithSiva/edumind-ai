/**
 * /api/tutor -- chat sessions with the AI tutor. Ported from
 * server/src/routes/tutor.js.
 */
import { json } from "../shared/cors.ts";
import { db, TABLES } from "../shared/db.ts";
import { protect } from "../shared/auth.ts";
import { weakTopicsFor } from "../shared/aggregate.ts";
import { serializeChatMessage } from "../shared/serialize.ts";
import { aiConfigured, complete, modelFromRequest } from "../shared/ai.ts";
import { detectTopicKeyword, tutorSystem } from "../shared/prompts.ts";
import { fallbackTutorAnswer } from "../shared/fallbacks-tutor.ts";
import { resourcesFor, sanitizeResources } from "../shared/resources.ts";
import { body, match, type RouteCtx, type RouteHandler } from "../shared/router.ts";


/** GET /api/tutor/sessions -- list past chats. */
async function sessions(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const { data, error: qErr } = await db
    .from(TABLES.chatMessages)
    .select("session_id,content,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (qErr) console.error(`[tutor] sessions read failed: ${qErr.message}`);

  // Replaces the $group/$first/$last pipeline: title is the first message per
  // session, updatedAt the last, count the number of messages.
  const grouped = new Map<string, { title: string; updatedAt: string; count: number }>();
  for (const m of (data ?? []) as Row[]) {
    const id = String(m.session_id);
    const cur = grouped.get(id);
    if (cur) {
      cur.updatedAt = String(m.created_at);
      cur.count += 1;
    } else {
      grouped.set(id, {
        title: String(m.content ?? ""),
        updatedAt: String(m.created_at),
        count: 1,
      });
    }
  }

  const rows = [...grouped.entries()]
    .map(([sessionId, g]) => ({ sessionId, ...g }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 20);

  return json({
    sessions: rows.map((r) => ({
      sessionId: r.sessionId,
      title: r.title.length > 60 ? r.title.slice(0, 57) + "..." : r.title,
      updatedAt: new Date(r.updatedAt).toISOString(),
      count: r.count,
    })),
  });
}

/** GET /api/tutor/sessions/:id -- full transcript. */
async function transcript(ctx: RouteCtx, params: Record<string, string>): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const { data, error: qErr } = await db
    .from(TABLES.chatMessages)
    .select("*")
    .eq("user_id", user.id)
    .eq("session_id", params.id)
    .order("created_at", { ascending: true });
  if (qErr) console.error(`[tutor] transcript failed: ${qErr.message}`);
  return json({ messages: ((data ?? []) as Row[]).map(serializeChatMessage) });
}

/**
 * POST /api/tutor/ask  { question, sessionId?, subject?, topic? }
 * subject/topic are an optional explicit scope from the filter above the input
 * box -- session-default but overridable per message.
 */
async function ask(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const uid = user.id as string;

  const b = await body(ctx.req);
  const question = String(b.question ?? "");
  const subject = b.subject ? String(b.subject) : undefined;
  const topic = b.topic ? String(b.topic) : undefined;
  if (!question.trim()) return json({ message: "Type a question first" }, 400);

  const sessionId = b.sessionId ? String(b.sessionId) : crypto.randomUUID();
  const { error: uErr } = await db
    .from(TABLES.chatMessages)
    .insert({ user_id: uid, session_id: sessionId, role: "user", content: question });
  if (uErr) console.error(`[tutor] user message insert failed for ${uid}: ${uErr.message}`);

  const weakTopics = await weakTopicsFor(uid);

  const { data: historyRaw } = await db
    .from(TABLES.chatMessages)
    .select("*")
    .eq("user_id", uid)
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(6);

  // Newest first in SQL, so reverse to chronological and drop the message just
  // inserted to build the "earlier in this conversation" context.
  const history = ((historyRaw ?? []) as Row[]).reverse();
  const context = history
    .slice(0, -1)
    .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`)
    .join("\n\n");

  let answer: string;
  let source = "ai";
  try {
    if (!aiConfigured()) throw new Error("no key");
    answer = await complete({
      system: tutorSystem(user, { weakTopics, focusSubject: subject, focusTopic: topic }),
      prompt: context
        ? `Earlier in this conversation:\n${context}\n\nNow the student asks: ${question}`
        : question,
      model: modelFromRequest(ctx.req),
    });
    if (!answer) throw new Error("empty response");
  } catch (err) {
    console.error(`[tutor] falling back for user ${uid}: ${(err as Error).message}`);
    answer = fallbackTutorAnswer(question);
    source = "fallback";
  }

  // An explicit subject/topic filter is a stronger signal than guessing from
  // the question text, so it takes priority.
  const explicitTopic = (topic || "").trim();
  const topicKeyword = detectTopicKeyword(question);
  const resources = explicitTopic
    ? sanitizeResources(resourcesFor(explicitTopic, subject))
    : topicKeyword
      ? sanitizeResources(resourcesFor(topicKeyword))
      : [];

  const { error: aErr } = await db
    .from(TABLES.chatMessages)
    .insert({ user_id: uid, session_id: sessionId, role: "assistant", content: answer, resources });
  if (aErr) console.error(`[tutor] assistant message insert failed for ${uid}: ${aErr.message}`);

  return json({ sessionId, answer, source, weakTopics, resources });
}

/** DELETE /api/tutor/sessions/:id */
async function deleteSession(ctx: RouteCtx, params: Record<string, string>): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const { error: delErr } = await db
    .from(TABLES.chatMessages).delete().eq("user_id", user.id).eq("session_id", params.id);
  if (delErr) console.error(`[tutor] delete failed: ${delErr.message}`);
  return json({ message: "Chat deleted" });
}

const TUTOR_ROUTES: Record<string, [string, RouteHandler][]> = {
  GET: [["sessions", sessions], ["sessions/:id", transcript]],
  POST: [["ask", ask]],
  DELETE: [["sessions/:id", deleteSession]],
};

export async function handleTutor(ctx: RouteCtx): Promise<Response | null> {
  const hit = match(TUTOR_ROUTES, ctx);
  if (!hit) return null;
  return hit.handler(ctx, hit.params);
}
