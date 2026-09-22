/**
 * /api/assessment -- the one-time placement quiz. Ported from
 * server/src/routes/assessment.js.
 *
 * Deliberately stateless: each question is a real single-question Quiz row
 * (same grading pattern as /api/quiz), so the correct answer is never sent to
 * the browser and grading is always server-authoritative. Progress between
 * steps round-trips through the client -- the only thing a tampered tally could
 * affect is the self-reported level shown back to the same student, used to
 * seed non-binding starter tasks.
 */
import { json } from "../shared/cors.ts";
import { db, TABLES } from "../shared/db.ts";
import { protect } from "../shared/auth.ts";
import { aiConfigured, completeJSON, modelFromRequest } from "../shared/ai.ts";
import { quizPrompt } from "../shared/prompts.ts";
import { resourcesFor } from "../shared/resources.ts";
import { body, match, type RouteCtx, type RouteHandler } from "../shared/router.ts";


const TOTAL_STEPS = 5;
const LADDER = ["Easy", "Medium", "Hard"];

function nextDifficulty(current: string, wasCorrect: boolean): string {
  const i = LADDER.indexOf(current);
  if (i === -1) return "Medium";
  if (wasCorrect === true) return LADDER[Math.min(i + 1, LADDER.length - 1)];
  if (wasCorrect === false) return LADDER[Math.max(i - 1, 0)];
  return current;
}

function levelFromPercentage(pct: number): string {
  if (pct >= 75) return "Advanced";
  if (pct >= 45) return "Intermediate";
  return "Beginner";
}

/** Never includes answerIndex. */
function forClientQuestion(quiz: Row) {
  const q = ((quiz.questions as Row[]) || [])[0];
  return { q: q?.q, options: q?.options };
}

/**
 * One diagnostic question: AI first, the seeded question bank as a fallback, so
 * onboarding never dead-ends without a live key. Always materialized as its own
 * single-question Quiz row, tagged so it never shows up as a real quiz.
 */
async function makeQuestion(
  user: Row,
  subject: string,
  difficulty: string,
  model: string | undefined,
): Promise<Row | null> {
  let questions: Row[] | null = null;
  let source = "ai";
  try {
    if (!aiConfigured()) throw new Error("no key");
    const data = (await completeJSON({
      prompt: quizPrompt(subject, difficulty, 1, user),
      model,
    })) as Row | Row[];
    const list = ((Array.isArray(data) ? data : data.questions) as Row[]) || [];
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
      .slice(0, 1);
    if (!questions.length) throw new Error("no usable question");
  } catch (err) {
    console.error(`[assessment] falling back to seeded bank for "${subject}": ${(err as Error).message}`);
    source = "bank";
    const bySubject = await db.from(TABLES.quizzes).select("*").is("user_id", null).eq("subject", subject).limit(1);
    const any = await db.from(TABLES.quizzes).select("*").is("user_id", null).limit(1);
    const bank = (bySubject.data?.[0] ?? any.data?.[0]) as Row | undefined;
    const bankQuestions = (bank?.questions as Row[]) || [];
    if (!bank || !bankQuestions.length) return null;
    questions = [bankQuestions[Math.floor(Math.random() * bankQuestions.length)]];
  }

  const { data, error } = await db
    .from(TABLES.quizzes)
    .insert({
      user_id: user.id,
      topic: `Diagnostic: ${subject}`,
      subject,
      difficulty,
      questions,
      source,
    })
    .select("*")
    .single();
  if (error) {
    console.error(`[assessment] question insert failed: ${error.message}`);
    return null;
  }
  return data as Row;
}

/** POST /api/assessment/start -- first question, always Medium difficulty. */
async function start(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const subjects = (user.subjects as string[]) ?? [];
  const subject = subjects[0] || "Aptitude";
  const quiz = await makeQuestion(user, subject, "Medium", modelFromRequest(ctx.req));
  if (!quiz) {
    return json(
      {
        message:
          "No AI key configured and the question bank is empty. Skip the assessment for now — you can still use the app.",
      },
      503,
    );
  }
  return json(
    {
      quizId: quiz.id,
      question: forClientQuestion(quiz),
      subject,
      difficulty: "Medium",
      step: 1,
      totalSteps: TOTAL_STEPS,
    },
    201,
  );
}

/**
 * POST /api/assessment/answer { quizId, answerIndex, step, tally }
 * Grades the given question, decides the next difficulty, and either returns
 * the next question or -- on the last step -- finalizes the assessment and
 * seeds starter tasks for whatever came back weak.
 */
async function answer(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const uid = user.id as string;

  const b = await body(ctx.req);
  const { data: quizRow } = await db
    .from(TABLES.quizzes).select("*").eq("id", b.quizId as string).eq("user_id", uid).maybeSingle();
  if (!quizRow) {
    return json({ message: "Assessment question not found or already answered" }, 404);
  }
  const quiz = quizRow as Row;

  const q = ((quiz.questions as Row[]) || [])[0];
  const answerIndex = Number(b.answerIndex);
  const wasCorrect = answerIndex === q.answerIndex;
  const subject = String(quiz.subject);
  const step = Number(b.step) || 1;

  const tally: Record<string, { correct: number; total: number }> = {
    ...((b.tally && typeof b.tally === "object" ? b.tally : {}) as Record<string, { correct: number; total: number }>),
  };
  const prev = tally[subject] || { correct: 0, total: 0 };
  tally[subject] = { correct: prev.correct + (wasCorrect ? 1 : 0), total: prev.total + 1 };

  if (step >= TOTAL_STEPS) {
    const subjectScores = Object.entries(tally).map(([s, t]) => ({
      subject: s,
      percentage: Math.round((t.correct / t.total) * 100),
    }));
    const totalCorrect = Object.values(tally).reduce((a, t) => a + t.correct, 0);
    const totalCount = Object.values(tally).reduce((a, t) => a + t.total, 0);
    const overall = totalCount ? Math.round((totalCorrect / totalCount) * 100) : 50;
    const level = levelFromPercentage(overall);
    const strengths = subjectScores.filter((s) => s.percentage >= 70).map((s) => s.subject);
    const weaknesses = subjectScores.filter((s) => s.percentage < 50).map((s) => s.subject);

    const { error: upErr } = await db
      .from(TABLES.users)
      .update({
        assessment_level: level,
        assessment_strengths: strengths,
        assessment_weaknesses: weaknesses,
        assessment_completed_at: new Date().toISOString(),
      })
      .eq("id", uid);
    if (upErr) console.error(`[assessment] user update failed for ${uid}: ${upErr.message}`);

    // Give the study plan an immediate, visible head start on whatever this
    // just surfaced, rather than waiting for the student's first real quiz.
    for (const w of weaknesses.slice(0, 3)) {
      const { data: exists } = await db
        .from(TABLES.tasks).select("id").eq("user_id", uid).eq("topic", w)
        .eq("auto_scheduled", true).eq("completed", false).limit(1);
      if (exists?.length) continue;

      const { error: tErr } = await db.from(TABLES.tasks).insert({
        user_id: uid,
        title: `Strengthen ${w} fundamentals`,
        subject: w,
        topic: w,
        scheduled_for: new Date().toISOString(),
        duration_minutes: (user.daily_target_minutes as number) || 45,
        priority: 1,
        auto_scheduled: true,
        note: "Added from your placement assessment",
        resources: resourcesFor(w, w),
      });
      if (tErr) console.error(`[assessment] starter task failed for ${uid}: ${tErr.message}`);
    }

    return json({ done: true, wasCorrect, level, strengths, weaknesses, subjectScores, overall });
  }

  const subjects = (user.subjects as string[]) ?? [];
  const nextSubject = subjects[step % subjects.length] || subject;
  const difficulty = nextDifficulty(String(quiz.difficulty), wasCorrect);
  const nextQuiz = await makeQuestion(user, nextSubject, difficulty, modelFromRequest(ctx.req));
  if (!nextQuiz) {
    return json({
      done: true,
      wasCorrect,
      level: "Intermediate",
      strengths: [],
      weaknesses: [],
      subjectScores: [],
      overall: null,
      note: "Stopped early — no more questions were available, but nothing you've done so far is lost.",
    });
  }
  return json({
    done: false,
    wasCorrect,
    quizId: nextQuiz.id,
    question: forClientQuestion(nextQuiz),
    subject: nextSubject,
    difficulty,
    step: step + 1,
    totalSteps: TOTAL_STEPS,
    tally,
  });
}

const ASSESSMENT_ROUTES: Record<string, [string, RouteHandler][]> = {
  POST: [["start", start], ["answer", answer]],
};

export async function handleAssessment(ctx: RouteCtx): Promise<Response | null> {
  const hit = match(ASSESSMENT_ROUTES, ctx);
  if (!hit) return null;
  return hit.handler(ctx, hit.params);
}
