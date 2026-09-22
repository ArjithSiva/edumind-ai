/**
 * /api/quiz -- generation, the seeded bank, and server-side grading.
 * Ported from server/src/routes/quiz.js.
 *
 * SECURITY INVARIANT: answerIndex never leaves this module. quizForClient()
 * strips it from every quiz sent to the browser, and grading happens here using
 * the full row read with the service-role client.
 */
import { json } from "../shared/cors.ts";
import { db, TABLES } from "../shared/db.ts";
import { protect } from "../shared/auth.ts";
import { attemptRows } from "../shared/aggregate.ts";
import { quizForClient, serializeAttempt, serializeTask } from "../shared/serialize.ts";
import { aiConfigured, completeJSON, modelFromRequest } from "../shared/ai.ts";
import { quizPrompt, suggestTopicPrompt } from "../shared/prompts.ts";
import { body, match, type RouteCtx, type RouteHandler } from "../shared/router.ts";


function guessSubjectForQuiz(topic: unknown, subjects: string[]): string {
  const t = String(topic).toLowerCase();
  return subjects.find((s) => t.includes(s.toLowerCase())) || subjects[0] || "General";
}

/** GET /api/quiz/suggest-topic -- one AI-picked topic tied to weak areas. */
async function suggestQuizTopic(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const uid = user.id as string;
  const subjects = (user.subjects as string[]) ?? [];

  // Group by topic, keeping the first subject seen and the average -- the old
  // $group with $first on subject.
  const rows = await attemptRows(uid);
  const grouped = new Map<string, { subject: string | null; sum: number; count: number }>();
  for (const r of rows) {
    if (!r.topic) continue;
    const cur = grouped.get(r.topic) ?? { subject: r.subject, sum: 0, count: 0 };
    cur.sum += r.percentage;
    cur.count += 1;
    grouped.set(r.topic, cur);
  }
  const weak = [...grouped.entries()]
    .map(([topic, g]) => ({ topic, subject: g.subject, avg: g.sum / g.count }))
    .filter((r) => r.avg < 60)
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 3);
  const weakTopics = weak.map((r) => r.topic);

  try {
    if (!aiConfigured()) throw new Error("no key");
    const data = (await completeJSON({
      prompt: suggestTopicPrompt(user, weakTopics, "quiz"),
      model: modelFromRequest(ctx.req),
    })) as Row;
    if (!data?.topic) throw new Error("no usable topic");
    return json({
      topic: String(data.topic).slice(0, 120),
      subject: guessSubjectForQuiz(data.subject || data.topic, subjects),
      reason: String(data.reason || "").slice(0, 200),
      source: "ai",
    });
  } catch (err) {
    console.error(`[quiz] suggest-topic falling back for user ${uid}: ${(err as Error).message}`);
    const pick = weak[0];
    const topic = pick?.topic || subjects[0] || "Python fundamentals";
    return json({
      topic,
      subject: guessSubjectForQuiz(pick?.subject || topic, subjects),
      reason: pick ? `Your average here is ${Math.round(pick.avg)}%.` : "A good place to start.",
      source: "rules",
    });
  }
}

/** POST /api/quiz/generate { topic, difficulty, count } */
async function generateQuiz(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const uid = user.id as string;
  const subjects = (user.subjects as string[]) ?? [];

  const b = await body(ctx.req);
  const topic = String(b.topic ?? "").trim() || "Python fundamentals";
  const difficulty = ["Easy", "Medium", "Hard"].includes(b.difficulty as string)
    ? (b.difficulty as string)
    : "Medium";
  const count = Math.min(Math.max(parseInt(String(b.count), 10) || 5, 3), 10);
  const subject = guessSubjectForQuiz(topic, subjects);

  let questions: Row[] | null = null;
  let source = "ai";
  try {
    if (!aiConfigured()) throw new Error("no key");
    const data = (await completeJSON({
      prompt: quizPrompt(topic, difficulty, count, user),
      model: modelFromRequest(ctx.req),
    })) as Row | Row[];
    const list = (Array.isArray(data) ? data : (data.questions as Row[])) || [];
    questions = list
      .filter((q) => q?.q && Array.isArray(q.options) && (q.options as unknown[]).length >= 2)
      .map((q) => {
        const options = (q.options as unknown[]).map(String);
        return {
          q: String(q.q),
          options,
          answerIndex: Math.max(0, Math.min(Number(q.answerIndex) || 0, options.length - 1)),
          explanation: String(q.explanation || ""),
        };
      })
      .slice(0, count);
    if (!questions.length) throw new Error("no usable questions");
  } catch (err) {
    console.error(`[quiz] falling back to seeded bank for "${topic}": ${(err as Error).message}`);
    source = "bank";
    // Serve the closest seeded quiz so the demo still works without a key.
    const firstWord = topic.split(/[\s—-]+/)[0];
    const bank =
      (await db.from(TABLES.quizzes).select("*").is("user_id", null).ilike("topic", `%${firstWord}%`).limit(1)).data?.[0] ??
      (await db.from(TABLES.quizzes).select("*").is("user_id", null).eq("subject", subject).limit(1)).data?.[0] ??
      (await db.from(TABLES.quizzes).select("*").is("user_id", null).limit(1)).data?.[0];
    if (!bank) {
      return json(
        { message: "No AI key configured and the question bank is empty. Run `npm run seed`." },
        503,
      );
    }
    questions = (bank.questions as Row[]).slice(0, count);
  }

  const { data: quiz, error: insErr } = await db
    .from(TABLES.quizzes)
    .insert({ user_id: uid, topic, subject, difficulty, questions, source })
    .select("*")
    .single();
  if (insErr) {
    console.error(`[quiz] insert failed for ${uid}: ${insErr.message}`);
    return json({ message: insErr.message }, 500);
  }
  return json({ quiz: quizForClient(quiz as Row), source }, 201);
}

/** GET /api/quiz/bank -- the seeded public question bank. */
async function bank(ctx: RouteCtx): Promise<Response> {
  const { error } = await protect(ctx.req);
  if (error) return error;

  const { data, error: qErr } = await db.from(TABLES.quizzes).select("*").is("user_id", null);
  if (qErr) console.error(`[quiz] bank read failed: ${qErr.message}`);
  return json({ quizzes: ((data ?? []) as Row[]).map(quizForClient) });
}

/** GET /api/quiz/history/all -- declared before /:id so it is not shadowed. */
async function history(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const { data, error: aErr } = await db
    .from(TABLES.attempts).select("*").eq("user_id", user.id)
    .order("created_at", { ascending: false }).limit(50);
  if (aErr) console.error(`[quiz] history failed: ${aErr.message}`);
  return json({ attempts: ((data ?? []) as Row[]).map(serializeAttempt) });
}

/** GET /api/quiz/:id */
async function getQuiz(ctx: RouteCtx, params: Record<string, string>): Promise<Response> {
  const { error } = await protect(ctx.req);
  if (error) return error;

  const { data } = await db.from(TABLES.quizzes).select("*").eq("id", params.id).maybeSingle();
  if (!data) return json({ message: "Quiz not found" }, 404);
  return json({ quiz: quizForClient(data as Row) });
}

/**
 * POST /api/quiz/:id/submit { answers: number[], durationSeconds }
 * Grades server-side, then closes the loop: a weak score schedules a revision
 * task at the top of the planner.
 */
async function submitQuiz(ctx: RouteCtx, params: Record<string, string>): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const uid = user.id as string;

  const { data: quizRow } = await db.from(TABLES.quizzes).select("*").eq("id", params.id).maybeSingle();
  if (!quizRow) return json({ message: "Quiz not found" }, 404);
  const quiz = quizRow as Row;

  const b = await body(ctx.req);
  const answers = Array.isArray(b.answers) ? (b.answers as unknown[]).map(Number) : [];
  const questions = (quiz.questions ?? []) as Row[];

  const results = questions.map((q, i) => ({
    correct: answers[i] === q.answerIndex,
    answerIndex: q.answerIndex,
    explanation: q.explanation,
  }));
  const score = results.filter((r) => r.correct).length;
  const total = questions.length;
  const percentage = Math.round((score / total) * 100);

  const { data: attempt, error: aErr } = await db
    .from(TABLES.attempts)
    .insert({
      user_id: uid,
      quiz_id: quiz.id,
      topic: quiz.topic,
      subject: quiz.subject,
      answers,
      score,
      total,
      percentage,
      duration_seconds: Number(b.durationSeconds) || 0,
    })
    .select("*")
    .single();
  if (aErr) {
    console.error(`[quiz] attempt insert failed for ${uid}: ${aErr.message}`);
    return json({ message: aErr.message }, 500);
  }

  let scheduled: Row | null = null;
  if (percentage < 60) {
    const { data: existing } = await db
      .from(TABLES.tasks).select("id").eq("user_id", uid).eq("topic", quiz.topic)
      .eq("completed", false).eq("auto_scheduled", true).limit(1);
    if (!existing?.length) {
      const { data: created, error: tErr } = await db
        .from(TABLES.tasks)
        .insert({
          user_id: uid,
          title: `Revise ${quiz.topic}`,
          subject: quiz.subject,
          topic: quiz.topic,
          scheduled_for: new Date().toISOString(),
          duration_minutes: 45,
          priority: 1,
          auto_scheduled: true,
          note: `Added automatically — you scored ${percentage}% on this topic`,
        })
        .select("*")
        .single();
      if (tErr) console.error(`[quiz] scheduled task failed for ${uid}: ${tErr.message}`);
      else scheduled = created as Row;
    }
  }

  return json({
    attempt: serializeAttempt(attempt as Row),
    results,
    score,
    total,
    percentage,
    scheduledTask: scheduled ? serializeTask(scheduled) : null,
  });
}

const QUIZ_ROUTES: Record<string, [string, RouteHandler][]> = {
  GET: [
    ["suggest-topic", suggestQuizTopic],
    ["bank", bank],
    // Registered before /:id, matching Express's ordering.
    ["history/all", history],
    [":id", getQuiz],
  ],
  POST: [
    ["generate", generateQuiz],
    [":id/submit", submitQuiz],
  ],
};

export async function handleQuiz(ctx: RouteCtx): Promise<Response | null> {
  const hit = match(QUIZ_ROUTES, ctx);
  if (!hit) return null;
  return hit.handler(ctx, hit.params);
}
