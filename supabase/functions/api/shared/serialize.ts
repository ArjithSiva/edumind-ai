/**
 * Response serializers: Postgres rows -> the exact JSON shape the React client
 * already consumes from the old Mongoose API.
 *
 * Three transformations, applied by every serializer here:
 *   - `id` (uuid) -> `_id` (string), including nested ids
 *   - snake_case columns -> camelCase keys
 *   - timestamptz -> ISO date string (what Mongoose emitted)
 *
 * The client reads `_id` in 27 places across Progress, Planner, Assignments,
 * Doubts and Quiz; emitting it here is what keeps every page unedited.
 */

/** timestamptz -> ISO string, matching Mongoose's JSON output. */
export function iso(v: unknown): string | null {
  if (!v) return null;
  return new Date(v as string).toISOString();
}

/** Nested resources array (jsonb) is stored exactly as the API returns it. */
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/* ------------------------------------------------------------------- user */

/**
 * Mirrors routes/auth.js `shape()` exactly. Deliberately excludes
 * password_hash (never leaves the function) and `assessment` -- the original
 * shape() omits it too, and no client page reads user.assessment.
 */
export function shapeUser(u: Record<string, unknown>) {
  if (!u) return null;
  return {
    _id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    institution: u.institution,
    department: u.department,
    year: u.year,
    subjects: u.subjects,
    learningStyle: u.learning_style,
    dailyTargetMinutes: u.daily_target_minutes,
    streak: u.streak,
    studyMinutes: u.study_minutes,
  };
}

/* ------------------------------------------------------------------ quiz */

/** Strips answerIndex AND explanation. Used for every quiz/question payload sent
 *  to the browser -- matches routes/quiz.js `forClient`, which deliberately
 *  emitted only { q, options } so nothing hints at the correct answer. */
export function quizForClient(q: Record<string, unknown>) {
  const questions = Array.isArray(q.questions) ? q.questions : [];
  return {
    _id: q.id,
    topic: q.topic,
    subject: q.subject,
    difficulty: q.difficulty,
    source: q.source,
    questions: questions.map((item) => {
      const x = item as Record<string, unknown>;
      return { q: x.q, options: x.options };
    }),
  };
}

/** Full quiz incl. answer keys -- server-side grading only, never returned. */
export function quizFull(q: Record<string, unknown>) {
  return {
    _id: q.id,
    user: q.user_id ?? null,
    topic: q.topic,
    subject: q.subject,
    difficulty: q.difficulty,
    questions: Array.isArray(q.questions) ? q.questions : [],
    source: q.source,
    createdAt: iso(q.created_at),
    updatedAt: iso(q.updated_at),
  };
}

/* --------------------------------------------------------------- attempt */

export function serializeAttempt(a: Record<string, unknown>) {
  return {
    _id: a.id,
    user: a.user_id,
    quiz: a.quiz_id,
    topic: a.topic,
    subject: a.subject,
    answers: Array.isArray(a.answers) ? a.answers : [],
    score: a.score,
    total: a.total,
    percentage: a.percentage,
    durationSeconds: a.duration_seconds,
    createdAt: iso(a.created_at),
    updatedAt: iso(a.updated_at),
  };
}

/* ------------------------------------------------------------------ goal */

export function serializeGoal(g: Record<string, unknown>) {
  return {
    _id: g.id,
    user: g.user_id,
    title: g.title,
    targetDate: iso(g.target_date),
    progress: g.progress,
    status: g.status,
    createdAt: iso(g.created_at),
    updatedAt: iso(g.updated_at),
  };
}

/* ------------------------------------------------------------------ task */

export function serializeTask(t: Record<string, unknown>) {
  return {
    _id: t.id,
    user: t.user_id,
    title: t.title,
    subject: t.subject,
    topic: t.topic,
    scheduledFor: iso(t.scheduled_for),
    durationMinutes: t.duration_minutes,
    priority: t.priority,
    completed: t.completed,
    completedAt: iso(t.completed_at),
    autoScheduled: t.auto_scheduled,
    note: t.note,
    resources: asArr(t.resources),
    createdAt: iso(t.created_at),
    updatedAt: iso(t.updated_at),
  };
}

/* ------------------------------------------------------------ assignment */

export function serializeAssignment(a: Record<string, unknown>) {
  return {
    _id: a.id,
    user: a.user_id,
    title: a.title,
    subject: a.subject,
    type: a.type,
    difficulty: a.difficulty,
    brief: a.brief,
    content: a.content,
    dueDate: iso(a.due_date),
    status: a.status,
    submission: a.submission ?? undefined,
    createdAt: iso(a.created_at),
    updatedAt: iso(a.updated_at),
  };
}

/* ------------------------------------------------------------ chat tutor */

export function serializeChatMessage(m: Record<string, unknown>) {
  return {
    _id: m.id,
    user: m.user_id,
    sessionId: m.session_id,
    role: m.role,
    content: m.content,
    topic: m.topic,
    resources: asArr(m.resources),
    createdAt: iso(m.created_at),
    updatedAt: iso(m.updated_at),
  };
}

/* --------------------------------------------------------------- career */

export function serializeCareerPlan(c: Record<string, unknown>) {
  return {
    _id: c.id,
    user: c.user_id,
    interests: c.interests ?? [],
    strengths: c.strengths ?? [],
    recommendations: asArr(c.recommendations),
    createdAt: iso(c.created_at),
    updatedAt: iso(c.updated_at),
  };
}
