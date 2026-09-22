/**
 * /api/assignments -- generation, submission and AI grading. Ported from
 * server/src/routes/assignments.js.
 */
import { json } from "../shared/cors.ts";
import { db, TABLES } from "../shared/db.ts";
import { protect } from "../shared/auth.ts";
import { attemptRows } from "../shared/aggregate.ts";
import { serializeAssignment } from "../shared/serialize.ts";
import { aiConfigured, complete, completeJSON, modelFromRequest } from "../shared/ai.ts";
import { assignmentPrompt, gradingPrompt, suggestTopicPrompt } from "../shared/prompts.ts";
import { fallbackAssignment, fallbackGrading } from "../shared/fallbacks-assignment.ts";
import { body, match, type RouteCtx, type RouteHandler } from "../shared/router.ts";


const TYPES = ["essay", "coding", "case-study", "lab-report", "worksheet"];

function guessSubjectForAssignment(topic: unknown, subjects: string[]): string {
  const t = String(topic).toLowerCase();
  return subjects.find((s) => t.includes(s.toLowerCase())) || subjects[0] || "General";
}

/** GET /api/assignments */
async function listAssignments(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const { data, error: qErr } = await db
    .from(TABLES.assignments).select("*").eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (qErr) console.error(`[assignments] list failed: ${qErr.message}`);
  return json({ assignments: ((data ?? []) as Row[]).map(serializeAssignment) });
}

/** Grouped topic averages, weakest first -- replaces the $group/$first/$match pipeline. */
async function weak(
  uid: string,
): Promise<{ topic: string; subject: string | null; avg: number }[]> {
  const rows = await attemptRows(uid);
  const grouped = new Map<string, { subject: string | null; sum: number; count: number }>();
  for (const r of rows) {
    if (!r.topic) continue;
    const cur = grouped.get(r.topic) ?? { subject: r.subject, sum: 0, count: 0 };
    cur.sum += r.percentage;
    cur.count += 1;
    grouped.set(r.topic, cur);
  }
  return [...grouped.entries()]
    .map(([topic, g]) => ({ topic, subject: g.subject, avg: g.sum / g.count }))
    .filter((r) => r.avg < 60)
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 3);
}

/** GET /api/assignments/suggest-topic -- one AI-picked brief tied to weak areas. */
async function suggestAssignmentsTopic(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const uid = user.id as string;
  const subjects = (user.subjects as string[]) ?? [];

  const rows = await weak(uid);
  const weakTopics = rows.map((r) => r.topic);

  try {
    if (!aiConfigured()) throw new Error("no key");
    const data = (await completeJSON({
      prompt: suggestTopicPrompt(user, weakTopics, "assignment"),
      model: modelFromRequest(ctx.req),
    })) as Row;
    if (!data?.topic) throw new Error("no usable topic");
    return json({
      topic: String(data.topic).slice(0, 160),
      subject: guessSubjectForAssignment(data.subject || data.topic, subjects),
      reason: String(data.reason || "").slice(0, 200),
      source: "ai",
    });
  } catch (err) {
    console.error(`[assignments] suggest-topic falling back for user ${uid}: ${(err as Error).message}`);
    const pick = rows[0];
    const topic = pick?.topic || subjects[0] || "Fundamentals review";
    return json({
      topic,
      subject: guessSubjectForAssignment(pick?.subject || topic, subjects),
      reason: pick ? `Your average here is ${Math.round(pick.avg)}%.` : "A good place to start.",
      source: "rules",
    });
  }
}

/** GET /api/assignments/:id */
async function getAssignment(ctx: RouteCtx, params: Record<string, string>): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const { data } = await db
    .from(TABLES.assignments).select("*").eq("id", params.id).eq("user_id", user.id).maybeSingle();
  if (!data) return json({ message: "Assignment not found" }, 404);
  return json({ assignment: serializeAssignment(data as Row) });
}

/** POST /api/assignments/generate { brief, type, subject, difficulty, dueDate } */
async function generateAssignment(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const uid = user.id as string;
  const subjects = (user.subjects as string[]) ?? [];

  const b = await body(ctx.req);
  const brief = String(b.brief ?? "").trim();
  if (!brief) return json({ message: "Describe what the assignment should cover" }, 400);

  const type = TYPES.includes(b.type as string) ? (b.type as string) : "worksheet";
  const subject = b.subject ? String(b.subject) : subjects[0];
  const difficulty = ["Easy", "Medium", "Hard"].includes(b.difficulty as string)
    ? (b.difficulty as string)
    : "Medium";

  let content: string;
  let source = "ai";
  try {
    if (!aiConfigured()) throw new Error("no key");
    content = await complete({
      prompt: assignmentPrompt(brief, type, subject, difficulty, user),
      model: modelFromRequest(ctx.req),
    });
    if (!content || content.length < 120) throw new Error("too short");
  } catch (err) {
    console.error(`[assignments] falling back to template for user ${uid}: ${(err as Error).message}`);
    source = "template";
    content = fallbackAssignment(brief, type, subject, difficulty);
  }

  const { data, error: insErr } = await db
    .from(TABLES.assignments)
    .insert({
      user_id: uid,
      title: brief.length > 70 ? brief.slice(0, 67) + "..." : brief,
      subject,
      type,
      difficulty,
      brief,
      content,
      due_date: b.dueDate
        ? new Date(b.dueDate as string).toISOString()
        : new Date(Date.now() + 7 * 864e5).toISOString(),
    })
    .select("*")
    .single();
  if (insErr) {
    console.error(`[assignments] insert failed for ${uid}: ${insErr.message}`);
    return json({ message: insErr.message }, 500);
  }
  return json({ assignment: serializeAssignment(data as Row), source }, 201);
}

/** PATCH /api/assignments/:id */
async function patchAssignment(ctx: RouteCtx, params: Record<string, string>): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const { data: existing } = await db
    .from(TABLES.assignments).select("*").eq("id", params.id).eq("user_id", user.id).maybeSingle();
  if (!existing) return json({ message: "Assignment not found" }, 404);

  const b = await body(ctx.req);
  const patch: Row = {};
  if (b.title !== undefined) patch.title = b.title;
  if (b.status !== undefined) patch.status = b.status;
  if (b.dueDate !== undefined) patch.due_date = new Date(b.dueDate as string).toISOString();
  if (b.content !== undefined) patch.content = b.content;

  const { data, error: upErr } = await db
    .from(TABLES.assignments).update(patch).eq("id", params.id).eq("user_id", user.id).select("*").single();
  if (upErr) {
    console.error(`[assignments] patch failed: ${upErr.message}`);
    return json({ message: upErr.message }, 400);
  }
  return json({ assignment: serializeAssignment(data as Row) });
}

/**
 * POST /api/assignments/:id/submit { text }
 * "text" is either typed directly or read client-side from an uploaded
 * .txt/.md file -- no file ever touches the server, so there's no storage or
 * cleanup to manage, just the same JSON body as typing it.
 */
async function submitAssignment(ctx: RouteCtx, params: Record<string, string>): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const uid = user.id as string;

  const { data: existing } = await db
    .from(TABLES.assignments).select("*").eq("id", params.id).eq("user_id", uid).maybeSingle();
  if (!existing) return json({ message: "Assignment not found" }, 404);
  const assignment = existing as Row;

  const b = await body(ctx.req);
  const text = String(b.text ?? "").trim();
  if (!text) return json({ message: "Write or upload an answer first" }, 400);
  if (text.length > 20000) {
    return json({ message: "That submission is too long (20,000 character limit)" }, 400);
  }

  let graded: Row;
  let source = "ai";
  try {
    if (!aiConfigured()) throw new Error("no key");
    const data = (await completeJSON({
      prompt: gradingPrompt(assignment, text),
      model: modelFromRequest(ctx.req),
    })) as Row;
    if (typeof data?.score !== "number") throw new Error("no usable score");
    graded = {
      score: Math.max(0, Math.min(100, Math.round(data.score as number))),
      feedback: String(data.feedback || "").slice(0, 800),
      strengths: ((data.strengths as unknown[]) || []).map(String).slice(0, 5),
      improvements: ((data.improvements as unknown[]) || []).map(String).slice(0, 5),
    };
  } catch (err) {
    console.error(`[assignments] grading falling back for assignment ${assignment.id}: ${(err as Error).message}`);
    source = "rules";
    graded = fallbackGrading(text) as Row;
  }

  const submission = { text, ...graded, source, submittedAt: new Date().toISOString() };
  const { data, error: upErr } = await db
    .from(TABLES.assignments)
    .update({ submission, status: "submitted" })
    .eq("id", params.id)
    .eq("user_id", uid)
    .select("*")
    .single();
  if (upErr) {
    console.error(`[assignments] submit failed: ${upErr.message}`);
    return json({ message: upErr.message }, 500);
  }
  return json({ assignment: serializeAssignment(data as Row), source });
}

async function remove(ctx: RouteCtx, params: Record<string, string>): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const { data, error: delErr } = await db
    .from(TABLES.assignments).delete().eq("id", params.id).eq("user_id", user.id).select("id");
  if (delErr) console.error(`[assignments] delete failed: ${delErr.message}`);
  if (!data?.length) return json({ message: "Assignment not found" }, 404);
  return json({ message: "Assignment deleted" });
}

const ASSIGNMENTS_ROUTES: Record<string, [string, RouteHandler][]> = {
  GET: [["", listAssignments], ["suggest-topic", suggestAssignmentsTopic], [":id", getAssignment]],
  POST: [["generate", generateAssignment], [":id/submit", submitAssignment]],
  PATCH: [[":id", patchAssignment]],
  DELETE: [[":id", remove]],
};

export async function handleAssignments(ctx: RouteCtx): Promise<Response | null> {
  const hit = match(ASSIGNMENTS_ROUTES, ctx);
  if (!hit) return null;
  return hit.handler(ctx, hit.params);
}
