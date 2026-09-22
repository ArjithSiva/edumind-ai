/**
 * /api/progress -- the dashboard payload. Ported from server/src/routes/progress.js.
 */
import { json } from "../shared/cors.ts";
import { db, TABLES } from "../shared/db.ts";
import { protect } from "../shared/auth.ts";
import { attemptRows, progressBreakdown } from "../shared/aggregate.ts";
import { serializeAttempt } from "../shared/serialize.ts";
import { match, type RouteCtx, type RouteHandler } from "../shared/router.ts";

/** GET /api/progress -- everything the dashboard needs, in one call. */
async function summary(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const uid = user.id as string;

  const [breakdown, trendRaw, attemptsRes, tasksRes, chatsRes, assignRes, doubtsRes] = await Promise.all([
    progressBreakdown(uid),
    attemptRows(uid),
    db.from(TABLES.attempts).select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(10),
    db.from(TABLES.tasks).select("*").eq("user_id", uid),
    db.from(TABLES.chatMessages).select("id", { count: "exact", head: true }).eq("user_id", uid).eq("role", "user"),
    db.from(TABLES.assignments).select("id", { count: "exact", head: true }).eq("user_id", uid),
    db.from(TABLES.doubts).select("id", { count: "exact", head: true }).eq("user_id", uid),
  ]);

  if (attemptsRes.error) console.error(`[progress] attempts failed: ${attemptsRes.error.message}`);
  if (tasksRes.error) console.error(`[progress] tasks failed: ${tasksRes.error.message}`);

  // Mongoose sorted subjects by average descending and topics by average ascending.
  const bySubject = [...breakdown.bySubject].sort((a, b) => b.average - a.average);
  const byTopic = [...breakdown.byTopic].sort((a, b) => a.average - b.average);

  const tasks = (tasksRes.data ?? []) as Record<string, unknown>[];
  const completed = tasks.filter((t) => t.completed);

  const quizAvg = trendRaw.length
    ? Math.round(trendRaw.reduce((a, b) => a + b.percentage, 0) / trendRaw.length)
    : 0;
  const taskRate = tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0;

  // Overall = 60% quiz average, 40% plan adherence. Shown on the dashboard ring.
  const overall = Math.round(quizAvg * 0.6 + taskRate * 0.4);

  const weakAreas = byTopic
    .filter((t) => t.average < 60 && t.topic)
    .slice(0, 4)
    .map((t) => ({ topic: t.topic, average: t.average, attempts: t.attempts }));

  return json({
    summary: {
      overall,
      quizAverage: quizAvg,
      quizzesCompleted: trendRaw.length,
      studyHours: Math.round(((user.study_minutes as number) / 60) * 10) / 10,
      weakAreaCount: weakAreas.length,
      tasksCompleted: completed.length,
      tasksTotal: tasks.length,
      taskCompletionRate: taskRate,
      streak: user.streak,
      questionsAsked: chatsRes.count ?? 0,
      assignments: assignRes.count ?? 0,
      doubts: doubtsRes.count ?? 0,
    },
    subjects: bySubject.map((s) => ({ subject: s.subject, average: s.average, attempts: s.attempts })),
    topics: byTopic.map((t) => ({ topic: t.topic, average: t.average, attempts: t.attempts })),
    weakAreas,
    trend: trendRaw.slice(-12).map((a) => ({
      date: new Date(a.created_at).toISOString(),
      percentage: a.percentage,
      topic: a.topic,
    })),
    recentAttempts: ((attemptsRes.data ?? []) as Record<string, unknown>[]).map(serializeAttempt),
  });
}

/** GET /api/progress/activity -- the home feed. */
async function activity(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const uid = user.id as string;

  const [attemptsRes, tasksRes, chatsRes, assignRes] = await Promise.all([
    db.from(TABLES.attempts).select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(5),
    db.from(TABLES.tasks).select("*").eq("user_id", uid).eq("completed", true).order("completed_at", { ascending: false }).limit(5),
    db.from(TABLES.chatMessages).select("*").eq("user_id", uid).eq("role", "user").order("created_at", { ascending: false }).limit(5),
    db.from(TABLES.assignments).select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(3),
  ]);

  const rows = (r: { data: unknown }) => (r.data ?? []) as Record<string, unknown>[];
  const ts = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

  const feed = [
    ...rows(attemptsRes).map((a) => ({
      type: "quiz",
      tone: (a.percentage as number) >= 60 ? "green" : "amber",
      text: `Completed a quiz on ${a.topic} — scored ${a.score}/${a.total}`,
      at: ts(a.created_at),
    })),
    ...rows(tasksRes).map((t) => ({
      type: "task",
      tone: "blue",
      text: `Finished the ${t.topic || t.title} study block`,
      at: ts(t.completed_at) || ts(t.updated_at),
    })),
    ...rows(chatsRes).map((c) => {
      const content = String(c.content ?? "");
      return {
        type: "tutor",
        tone: "purple",
        text: `Asked the tutor: ${content.length > 55 ? content.slice(0, 52) + "..." : content}`,
        at: ts(c.created_at),
      };
    }),
    ...rows(assignRes).map((a) => ({
      type: "assignment",
      tone: "amber",
      text: `Generated the assignment "${a.title}"`,
      at: ts(a.created_at),
    })),
  ]
    .filter((f) => f.at)
    .sort((a, b) => new Date(b.at as string).getTime() - new Date(a.at as string).getTime())
    .slice(0, 8);

  return json({ feed });
}

const PROGRESS_ROUTES: Record<string, [string, RouteHandler][]> = {
  GET: [["", summary], ["activity", activity]],
};

export async function handleProgress(ctx: RouteCtx): Promise<Response | null> {
  const hit = match(PROGRESS_ROUTES, ctx);
  if (!hit) return null;
  return hit.handler(ctx, hit.params);
}
