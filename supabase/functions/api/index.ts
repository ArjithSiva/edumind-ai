/**
 * EduMind AI api -- ONE backend function reproducing the old Express router.
 *
 * Same paths, same methods, same JSON as server/src/routes/*, mounted under
 * /api, so the React client keeps calling /api/... unchanged and no page needs
 * editing for data shape.
 *
 * verify_jwt is false for this function (supabase/config.toml) because the app
 * uses its own JWT, verified in protect() below -- the platform default would
 * reject every real request before this code ran.
 *
 * ---------------------------------------------------------------------------
 * GENERATED FILE -- DO NOT EDIT DIRECTLY.
 * Built by scripts/build-function.sh from shared/*.ts and routes/*.ts, because
 * the deploy step bundles only index.ts. Edit those modules and re-run:
 *     bash scripts/build-function.sh && redeploy the api function
 * ---------------------------------------------------------------------------
 */

import bcrypt from "https://esm.sh/bcryptjs@2.4.3";
import { SignJWT, jwtVerify } from "https://esm.sh/jose@5.9.6";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/* ===== shared/cors.ts ===================================================== */
/**
 * CORS for the api function.
 *
 * The EduMind client calls this function's own HTTPS URL directly with axios
 * (it needs a real REST router behind stable /api/... paths), not
 * supabase.functions.invoke, so the allowed header list is the app's own:
 * Authorization, Content-Type and X-AI-Model.
 *
 * Allow-Methods carries the full set the router uses, and rides on the real
 * response as well as the preflight -- answering OPTIONS correctly but
 * omitting the headers on the actual reply still gets the call blocked.
 */
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ai-model, x-seed-token",
  "Access-Control-Max-Age": "86400",
};

/** JSON response with the CORS headers attached. */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Preflight short-circuit -- must run before any other work. */
function preflight(): Response {
  return new Response("ok", { headers: corsHeaders });
}

/* ===== shared/db.ts ===================================================== */
/**
 * Service-role Supabase client for the api function.
 *
 * Every table has RLS enabled with no anon/authenticated policies, so all
 * access goes through this client. Route code is responsible for scoping each
 * query to the authenticated user's id.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TABLES = {
  users: "users",
  chatMessages: "chat_messages",
  quizzes: "quizzes",
  attempts: "attempts",
  goals: "goals",
  tasks: "tasks",
  assignments: "assignments",
  doubts: "doubts",
  doubtAnswers: "doubt_answers",
  careerPlans: "career_plans",
  rateLimitHits: "rate_limit_hits",
} as const;

/* ===== shared/serialize.ts ===================================================== */
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
function iso(v: unknown): string | null {
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
function shapeUser(u: Record<string, unknown>) {
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
function quizForClient(q: Record<string, unknown>) {
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
function quizFull(q: Record<string, unknown>) {
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

function serializeAttempt(a: Record<string, unknown>) {
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

function serializeGoal(g: Record<string, unknown>) {
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

function serializeTask(t: Record<string, unknown>) {
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

function serializeAssignment(a: Record<string, unknown>) {
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

function serializeChatMessage(m: Record<string, unknown>) {
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

function serializeCareerPlan(c: Record<string, unknown>) {
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

/* ===== shared/serialize-doubts.ts ===================================================== */
/**
 * Serializers for the doubt forum. Answers were Mongoose subdocuments inside
 * each Doubt; they now live in their own table, so the API has to nest them
 * back under `answers` with their own `_id` -- the client reads answer._id for
 * the upvote call (POST /api/doubts/:id/answers/:answerId/upvote).
 */

function serializeDoubtAnswer(a: Record<string, unknown>) {
  if (!a) return null;
  return {
    _id: a.id,
    author: a.author_id ?? undefined,
    authorName: a.author_name,
    isAI: a.is_ai,
    body: a.body,
    upvotes: a.upvotes,
    resources: Array.isArray(a.resources) ? a.resources : [],
    createdAt: iso(a.created_at),
    updatedAt: iso(a.updated_at),
  };
}

/** `answers` must already be ordered oldest-first, as the subdocs were. */
function serializeDoubt(
  d: Record<string, unknown>,
  answers: Record<string, unknown>[] = [],
) {
  if (!d) return null;
  return {
    _id: d.id,
    user: d.user_id,
    authorName: d.author_name,
    title: d.title,
    body: d.body,
    subject: d.subject,
    tags: d.tags ?? [],
    resolved: d.resolved,
    views: d.views,
    answers: answers.map(serializeDoubtAnswer),
    createdAt: iso(d.created_at),
    updatedAt: iso(d.updated_at),
  };
}

/* ===== shared/auth.ts ===================================================== */
/**
 * Custom auth, reproduced from server/src/middleware/auth.js.
 *
 * Deliberately NOT Enter Cloud's built-in auth: the app already ships email +
 * bcrypt + its own JWT, and the seeded demo passwords have to keep working with
 * zero changes to Login.jsx / Register.jsx / AuthContext.jsx.
 *
 * `verify_jwt = false` is set for this function in supabase/config.toml, so the
 * gateway does not reject the app's own tokens before this code runs.
 */
// bcryptjs is CommonJS: esm.sh exposes no named exports for it, so it must be
// imported as the default and called as bcrypt.hash / bcrypt.compare.

const JWT_SECRET = Deno.env.get("JWT_SECRET") || "";
const JWT_EXPIRES_IN = Deno.env.get("JWT_EXPIRES_IN") || "7d";
const secretKey = new TextEncoder().encode(JWT_SECRET);

/** Same token payload as jwt.sign({ id }, JWT_SECRET, { expiresIn }). */
async function signToken(id: string): Promise<string> {
  return await new SignJWT({ id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRES_IN)
    .sign(secretKey);
}

const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
const matchPassword = (plain: string, hashed: string) => bcrypt.compare(plain, hashed);

type AuthedUser = Record<string, unknown>;

type ProtectResult = { user: AuthedUser; error: null } | { user: null; error: Response };

/**
 * Reproduces `protect`: same 401 messages, same lookup order. Never returns
 * password_hash to callers unless they ask for it (login does, for the compare).
 */
async function protect(
  req: Request,
  { withPassword = false }: { withPassword?: boolean } = {},
): Promise<ProtectResult> {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return { user: null, error: json({ message: "Not authorised — no token provided" }, 401) };
  }

  let decoded: { id?: string };
  try {
    decoded = (await jwtVerify(token, secretKey)).payload as { id?: string };
  } catch (err) {
    console.error(`[auth] token verify failed: ${(err as Error).message}`);
    return { user: null, error: json({ message: "Session expired — sign in again" }, 401) };
  }

  const cols = withPassword
    ? "*"
    : "id,name,email,role,institution,department,year,subjects,learning_style,daily_target_minutes,streak,last_active_date,study_minutes,assessment_level,assessment_strengths,assessment_weaknesses,assessment_completed_at,created_at,updated_at";

  const { data, error } = await db
    .from(TABLES.users)
    .select(cols)
    .eq("id", decoded.id)
    .maybeSingle();

  if (error) {
    console.error(`[auth] user lookup failed: ${error.message}`);
    return { user: null, error: json({ message: "Session expired — sign in again" }, 401) };
  }
  if (!data) {
    return { user: null, error: json({ message: "Account no longer exists" }, 401) };
  }
  return { user: data as AuthedUser, error: null };
}

/* ===== shared/ratelimit.ts ===================================================== */
/**
 * Postgres-backed rate limiting, replacing express-rate-limit.
 *
 * express-rate-limit keeps counters in process memory, which cannot work across
 * stateless backend function invocations -- every request could land on a fresh
 * instance and see an empty counter. This counts rows in `rate_limit_hits`
 * instead, so the limit actually holds.
 *
 * Limits mirror server.js: auth 40/15min, AI routes 20/min per (IP, model),
 * ai-check 5/min. Bucketing the AI limiter by model as well as IP is deliberate
 * -- each Groq model carries its own quota, so a student who hits the cap on
 * Qwen can switch models in Settings instead of waiting it out.
 */

/** Render sat behind a proxy; take the first hop of x-forwarded-for as the client IP. */
function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const first = fwd.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

type Limit = { windowMs: number; max: number; message: string };

const LIMITS = {
  auth: {
    windowMs: 15 * 60 * 1000,
    max: 40,
    message: "Too many attempts. Wait 15 minutes and try again.",
  },
  ai: {
    windowMs: 60 * 1000,
    max: 20,
    message:
      "You're going faster than the free tier allows for this model. Switch models in Settings, or wait a minute.",
  },
  aiCheck: {
    windowMs: 60 * 1000,
    max: 5,
    message: "Too many connection tests. Wait a minute and try again.",
  },
} satisfies Record<string, Limit>;

/** AI routes get the shared limiter, keyed per (IP, model). */
const AI_ROUTE_PREFIXES = ["tutor", "quiz", "career", "assignments", "assessment"];

/** Housekeeping: keep the table from growing without bound. Cheap and best-effort. */
let sinceLastCleanup = 0;
async function maybeCleanup(cutoffIso: string) {
  sinceLastCleanup += 1;
  if (sinceLastCleanup % 25 !== 0) return;
  const { error } = await db
    .from(TABLES.rateLimitHits)
    .delete()
    .lt("created_at", cutoffIso);
  if (error) console.error(`[ratelimit] cleanup failed: ${error.message}`);
}

/**
 * Counts hits in the window and records this one.
 * Returns null when allowed, or a 429 Response when the caller is over the limit.
 */
async function checkRateLimit(
  bucketKey: string,
  limit: Limit,
): Promise<Response | null> {
  const now = Date.now();
  const windowStart = new Date(now - limit.windowMs).toISOString();

  const { count, error } = await db
    .from(TABLES.rateLimitHits)
    .select("id", { count: "exact", head: true })
    .eq("bucket_key", bucketKey)
    .gte("created_at", windowStart);

  if (error) {
    // Never fail a student's request because the limiter itself broke.
    console.error(`[ratelimit] count failed for ${bucketKey}: ${error.message}`);
    return null;
  }

  if ((count ?? 0) >= limit.max) {
    return json({ message: limit.message }, 429);
  }

  const { error: insErr } = await db
    .from(TABLES.rateLimitHits)
    .insert({ bucket_key: bucketKey });
  if (insErr) console.error(`[ratelimit] record failed for ${bucketKey}: ${insErr.message}`);

  // Drop anything older than an hour -- well past every window above.
  await maybeCleanup(new Date(now - 60 * 60 * 1000).toISOString());

  return null;
}

/* ===== shared/ai.ts ===================================================== */
/**
 * Pluggable AI provider layer, ported from server/src/services/ai.js.
 *
 * One function -- complete({ prompt, system, json, model }) -- talks to
 * whichever provider AI_PROVIDER names. If no key is configured, or the call
 * fails, it throws AIUnavailable; callers catch that and serve deterministic
 * fallback content, so the app never shows a dead screen.
 */

class AIUnavailable extends Error {
  status = 503;
  constructor(message = "AI provider unavailable") {
    super(message);
    this.name = "AIUnavailable";
  }
}

const TIMEOUT_MS = 30000;

async function postJSON(url: string, headers: Record<string, string>, body: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      // Logged here, not just thrown: every call site catches this and falls
      // back to seeded content, so without this line a dead API key, a
      // decommissioned model, and a bad request all look identical to
      // "working fine" from the outside.
      console.error(`[ai] ${url} -> ${res.status}: ${text.slice(0, 500)}`);
      throw new AIUnavailable(`${res.status} ${text.slice(0, 300)}`);
    }
    return JSON.parse(text);
  } catch (err) {
    if (err instanceof AIUnavailable) throw err;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ai] request to ${url} failed: ${message}`);
    throw new AIUnavailable((err as Error)?.name === "AbortError" ? "AI request timed out" : message);
  } finally {
    clearTimeout(timer);
  }
}

type CompleteOpts = {
  prompt: string;
  system?: string;
  json?: boolean;
  model?: string;
};

/* ------------------------------------------------------------ providers */

const providers: Record<string, (o: CompleteOpts) => Promise<string>> = {
  /** Groq -- OpenAI-compatible chat completions. Default model is qwen/qwen3.8-27b. */
  async groq({ prompt, system, json, model }) {
    const key = Deno.env.get("GROQ_API_KEY");
    if (!key) throw new AIUnavailable("GROQ_API_KEY is not set");
    const messages: { role: string; content: string }[] = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    const data = await postJSON(
      "https://api.groq.com/openai/v1/chat/completions",
      { Authorization: `Bearer ${key}` },
      {
        model: model || Deno.env.get("GROQ_MODEL") || "qwen/qwen3.8-27b",
        messages,
        temperature: json ? 0.3 : 0.6,
        max_tokens: 1400,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      },
    );
    return data.choices?.[0]?.message?.content?.trim() || "";
  },

  /** Google Gemini -- generateContent endpoint. */
  async gemini({ prompt, system, json }) {
    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) throw new AIUnavailable("GEMINI_API_KEY is not set");
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";
    const data = await postJSON(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {},
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: {
          temperature: json ? 0.3 : 0.6,
          maxOutputTokens: 1400,
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      },
    );
    return data.candidates?.[0]?.content?.parts?.map((p: { text: string }) => p.text).join("").trim() || "";
  },

  /** OpenRouter -- OpenAI-compatible, many free models behind one key. */
  async openrouter({ prompt, system, json }) {
    const key = Deno.env.get("OPENROUTER_API_KEY");
    if (!key) throw new AIUnavailable("OPENROUTER_API_KEY is not set");
    const messages: { role: string; content: string }[] = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    const data = await postJSON(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": Deno.env.get("CLIENT_URL") || "https://edumind.app",
        "X-Title": "EduMind AI",
      },
      {
        model: Deno.env.get("OPENROUTER_MODEL") || "meta-llama/llama-3.3-70b-instruct:free",
        messages,
        temperature: json ? 0.3 : 0.6,
        max_tokens: 1400,
      },
    );
    return data.choices?.[0]?.message?.content?.trim() || "";
  },
};

/* --------------------------------------------------------------- public */

function activeProvider(): string {
  return (Deno.env.get("AI_PROVIDER") || "groq").toLowerCase();
}

/**
 * Models a student can pick between in Settings. Every id was live-tested
 * against this account's real key -- deliberately not padded with anything
 * unverified. Do not add a model here on the strength of it appearing in
 * Groq's docs alone; verify with the live-connection test first.
 * qwen/qwen3.6-27b, llama-3.3-70b-versatile and llama-3.1-8b-instant are dead
 * on this account -- never use them.
 */
const AVAILABLE_MODELS = [
  { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B", note: "Qwen — default, satisfies the track requirement" },
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", note: "Strongest non-Qwen option — rate-limit escape hatch" },
  { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B", note: "Not Qwen — fastest option" },
];

function isValidModelOverride(id: unknown): boolean {
  return activeProvider() === "groq" &&
    typeof id === "string" &&
    AVAILABLE_MODELS.some((m) => m.id === id);
}

/** Reads X-AI-Model and returns it only if it is one of AVAILABLE_MODELS --
 *  never hands an arbitrary client-supplied string to the provider. */
function modelFromRequest(req: Request): string | undefined {
  const requested = req.headers.get("x-ai-model");
  return isValidModelOverride(requested) ? (requested as string) : undefined;
}

/** The actual model id in use, shown in /api/health and Settings. */
function activeModel(override?: string): string {
  const p = activeProvider();
  if (p === "groq") {
    if (override && isValidModelOverride(override)) return override;
    return Deno.env.get("GROQ_MODEL") || "qwen/qwen3.8-27b";
  }
  if (p === "gemini") return Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";
  if (p === "openrouter") return Deno.env.get("OPENROUTER_MODEL") || "meta-llama/llama-3.3-70b-instruct:free";
  return "unknown";
}

function isQwen(override?: string): boolean {
  return /qwen/i.test(activeModel(override));
}

function aiConfigured(): boolean {
  const p = activeProvider();
  if (p === "groq") return Boolean(Deno.env.get("GROQ_API_KEY"));
  if (p === "gemini") return Boolean(Deno.env.get("GEMINI_API_KEY"));
  if (p === "openrouter") return Boolean(Deno.env.get("OPENROUTER_API_KEY"));
  return false;
}

/** True when AI_PROVIDER names a provider this layer actually implements. */
function hasProvider(name: string): boolean {
  return Boolean(providers[name]);
}

/** The env var a provider's key is read from, for actionable error copy. */
function keyEnvVarFor(provider: string): string {
  if (provider === "groq") return "GROQ_API_KEY";
  if (provider === "gemini") return "GEMINI_API_KEY";
  if (provider === "openrouter") return "OPENROUTER_API_KEY";
  return "the provider's API key";
}

async function complete(opts: CompleteOpts): Promise<string> {
  const name = activeProvider();
  const fn = providers[name];
  if (!fn) throw new AIUnavailable(`Unknown AI_PROVIDER "${name}"`);
  return fn(opts);
}

/** Ask for JSON and parse it defensively; models sometimes wrap output in
 *  markdown fences or add a sentence of preamble. */
async function completeJSON(opts: CompleteOpts): Promise<unknown> {
  const raw = await complete({ ...opts, json: true });
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[[{]/);
    const openChar = cleaned[start];
    const closeChar = openChar === "[" ? "]" : "}";
    const end = cleaned.lastIndexOf(closeChar);
    if (start === -1 || end === -1) {
      console.error(`[ai] completeJSON: model did not return JSON. Raw (first 300 chars): ${cleaned.slice(0, 300)}`);
      throw new AIUnavailable("Model did not return JSON");
    }
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch (err) {
      console.error(`[ai] completeJSON: could not parse extracted JSON (${(err as Error).message}). Raw (first 300 chars): ${cleaned.slice(0, 300)}`);
      throw new AIUnavailable("Could not parse model JSON: " + (err as Error).message);
    }
  }
}

/* ===== shared/ai-ping.ts ===================================================== */
/**
 * Live provider ping, ported from server/src/services/ai.js `livePing`.
 *
 * This is the one thing aiConfigured() can never tell you: a key can be
 * present, correctly spelled, and still fail on every real request (expired,
 * wrong model, rate-limited, wrong account tier). Settings calls this via
 * /api/health/ai-check so "connected" means a request actually succeeded.
 *
 * Cached 20s in an in-memory Map. A cold instance just re-checks, which is
 * harmless -- the route's own 5/min limiter is the real quota guard.
 */

type PingResult = {
  ok: boolean;
  provider: string;
  model: string;
  sample?: string;
  error?: string;
  latencyMs: number;
  cached?: boolean;
  checkedAt?: string;
};

const PING_CACHE_MS = 20_000;
const pingCache = new Map<string, { at: number; result: PingResult }>();

async function livePing(
  { force = false, model: overrideModel }: { force?: boolean; model?: string } = {},
): Promise<PingResult> {
  const provider = activeProvider();
  const model = activeModel(overrideModel);
  const cacheKey = `${provider}:${model}`;

  const cached = pingCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.at < PING_CACHE_MS) {
    return { ...cached.result, cached: true };
  }

  const startedAt = Date.now();
  let result: PingResult;

  if (!hasProvider(provider)) {
    result = { ok: false, provider, model, error: `Unknown AI_PROVIDER "${provider}"`, latencyMs: 0 };
  } else if (!aiConfigured()) {
    result = {
      ok: false,
      provider,
      model,
      error: `${keyEnvVarFor(provider)} is not set on the server`,
      latencyMs: 0,
    };
  } else {
    try {
      const text = await complete({
        system: "You are a connectivity check. Reply with exactly one word and nothing else.",
        prompt: "Reply with the single word: pong",
        model: provider === "groq" ? model : undefined,
      });
      result = text
        ? { ok: true, provider, model, sample: text.slice(0, 80), latencyMs: Date.now() - startedAt }
        : { ok: false, provider, model, error: "Provider returned an empty response", latencyMs: Date.now() - startedAt };
    } catch (err) {
      result = {
        ok: false,
        provider,
        model,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  pingCache.set(cacheKey, { at: Date.now(), result });
  return { ...result, cached: false, checkedAt: new Date().toISOString() };
}

/* ===== shared/prompts.ts ===================================================== */
/**
 * Every prompt the app sends lives here, ported verbatim from
 * server/src/services/prompts.js so tone and behaviour are unchanged.
 *
 * `user` is the authenticated user row -- prompts are personalised with the
 * student's year, subjects and learning style, which is what makes this
 * "personalized learning" rather than a chat wrapper.
 */

function learnerContext(
  user: Record<string, unknown>,
  extra: { weakTopics?: string[]; focusSubject?: string; focusTopic?: string } = {},
): string {
  const subjects = (user.subjects as string[]) || [];
  const bits = [
    `Year ${user.year} ${user.department} student at ${user.institution}`,
    `subjects: ${subjects.join(", ")}`,
    `prefers ${user.learning_style ?? user.learningStyle} explanations`,
  ];
  if (extra.weakTopics?.length) bits.push(`currently weak at: ${extra.weakTopics.join(", ")}`);
  if (extra.focusSubject) {
    bits.push(
      `has explicitly scoped this question to subject "${extra.focusSubject}"${
        extra.focusTopic ? `, topic "${extra.focusTopic}"` : ""
      } — answer strictly within that scope`,
    );
  }
  return bits.join("; ");
}

/** Cheap keyword match against a question/title -- reused so both the AI path
 *  and the offline path attach the same safe, curated resources. Returns null
 *  when nothing matches, so irrelevant messages get no resources block. */
function detectTopicKeyword(text: unknown): string | null {
  const s = String(text || "").toLowerCase();
  if (/recurs|factorial|fibonacci|base case/.test(s)) return "recursion";
  if (/dynamic programming|\bdp\b|memoiz/.test(s)) return "dynamic programming";
  if (/\bgraph\b|\bbfs\b|\bdfs\b|dijkstra/.test(s)) return "graph";
  if (/\btree\b|binary tree|\bbst\b/.test(s)) return "tree";
  if (/stack|queue|deque/.test(s)) return "stack";
  if (/big-?o|complexity\b|asymptotic/.test(s)) return "big-o";
  if (/\bjoin\b|\bsql\b|dbms|inner join|left join|normalization/.test(s)) return "sql";
  if (/react|javascript|\bjs\b|\bhtml\b|\bcss\b|frontend|front-end|node\.?js/.test(s)) return "web development";
  if (/\bpython\b|django|flask|numpy|pandas/.test(s)) return "python";
  if (/operating system|\bos\b\W|process|thread|deadlock|scheduling algorithm|semaphore/.test(s)) return "operating systems";
  if (/network|\btcp\b|\budp\b|\bhttp\b|osi model|routing|subnet/.test(s)) return "networks";
  if (/machine learning|neural|regression|classification|\bml\b/.test(s)) return "machine learning";
  if (/aptitude|profit and loss|time and work|percentage problem/.test(s)) return "aptitude";
  if (/loop|for |while|iterat|range\(/.test(s)) return "loop";
  return null;
}

const tutorSystem = (
  user: Record<string, unknown>,
  extra: { weakTopics?: string[]; focusSubject?: string; focusTopic?: string },
) => `
You are the AI Tutor inside EduMind AI, a personalized learning platform.
The learner is a ${learnerContext(user, extra)}.

Explain the concept in this order:
1. A one-line plain-English definition.
2. How it actually works, step by step.
3. One short runnable code example in a fenced block (use Python unless the question implies another language).
4. One sentence on the mistake students most often make with this.

Rules: keep it under 250 words, use markdown (**bold**, - bullets, fenced code
blocks), never use headings, and never apologise for being an AI. If the learner
is weak at a topic you touch, connect the explanation back to it. Do not add
your own links or resource list — the app attaches verified resources
separately based on the topic.
`.trim();

const RESOURCE_RULES =
  `Only set "url" when it is a stable, canonical link you are completely certain is correct (an official docs homepage, a LeetCode tag page such as https://leetcode.com/tag/recursion/, MDN, W3Schools) — otherwise set "url" to null and rely on "searchQuery" instead. Never invent a specific course, certificate, or article URL. "kind" must be one of: docs, tutorial, course, practice, video, article.`;

const quizPrompt = (
  topic: string,
  difficulty: string,
  count: number,
  user: Record<string, unknown>,
) => `
Write ${count} multiple-choice questions on "${topic}" at ${difficulty} difficulty
for a ${learnerContext(user)}.

Return ONLY a JSON object of this exact shape, with no preamble and no markdown fences:
{"questions":[{"q":"question text","options":["a","b","c","d"],"answerIndex":0,"explanation":"one sentence on why that option is correct"}]}

Requirements:
- Exactly 4 options per question.
- answerIndex is the 0-based index of the correct option.
- Wrong options must be plausible misconceptions, not obviously silly.
- Where the topic is code, include a small snippet inside the question text.
`.trim();

const gradingPrompt = (
  assignment: Record<string, unknown>,
  submissionText: string,
) => `
Grade a student's submission against this assignment's brief and marking scheme.

--- Assignment ---
${assignment.content}

--- Student's submission ---
${submissionText}
--- end submission ---

Return ONLY this JSON, no fences or preamble:
{"score":78,"feedback":"two to three sentences of overall, specific feedback","strengths":["...","..."],"improvements":["...","..."]}

score is 0-100, weighted the way the marking scheme above weights it. Be
honest and specific — cite what the submission actually did or missed, don't
inflate the score to be encouraging, and don't give a perfect score unless
the submission genuinely earns it.
`.trim();

const suggestTopicPrompt = (
  user: Record<string, unknown>,
  weakTopics: string[],
  kind: string,
) => `
Suggest ONE specific, well-scoped ${kind} topic for a ${learnerContext(user, { weakTopics })}.

${
  weakTopics.length
    ? `They are weakest on: ${weakTopics.join(", ")}. Prefer one of these, phrased more specifically than the raw topic name — e.g. "SQL joins" becomes "SQL: writing correct multi-table JOIN queries".`
    : `No weak-topic data yet — pick something foundational and useful from their subjects: ${(user.subjects as string[]).join(", ")}.`
}

Return ONLY this JSON, no fences or preamble:
{"topic":"...","subject":"...","reason":"one short sentence on why this topic, tied to their data"}
`.trim();

const plannerPrompt = (
  user: Record<string, unknown>,
  weakTopics: string[],
  days: number,
) => `
Build a ${days}-day study plan for a ${learnerContext(user, { weakTopics })}.
They can study about ${user.daily_target_minutes ?? user.dailyTargetMinutes} minutes a day.

Weak topics, hardest first: ${weakTopics.length ? weakTopics.join(", ") : "none recorded yet"}.

Put the weakest topics earliest and give them more time. Mix in one revision
block and one mixed-practice block.

Return ONLY this JSON, no fences or preamble:
{"tasks":[{"title":"...","subject":"...","topic":"...","dayOffset":0,"durationMinutes":45,"priority":1,"note":"one line on why this is scheduled here","resources":[{"name":"...","provider":"...","kind":"tutorial","url":null,"searchQuery":"..."}]}]}

dayOffset 0 means today. priority 1 is highest, 3 lowest. Only fill "resources"
(1-2 items) for tasks built around a weak topic — leave it as an empty array
for routine practice/revision blocks, so recommendations stay tied to what the
student actually struggles with. ${RESOURCE_RULES}
`.trim();

const careerPrompt = (
  user: Record<string, unknown>,
  interests: string[],
  strengths: string[],
  perf: { subject: string; average: number }[],
) => `
Give career guidance to a ${learnerContext(user)}.
Stated interests: ${interests.join(", ") || "not specified"}.
Self-declared strengths: ${strengths.join(", ") || "not specified"}.
Measured quiz performance by subject: ${perf.map((p) => `${p.subject} ${p.average}%`).join(", ") || "no attempts yet"}.

Suggest 4 realistic roles for an Indian engineering graduate, grounded in the
performance data above rather than generic advice.

Return ONLY this JSON, no fences or preamble:
{"recommendations":[{"role":"...","match":85,"why":"two sentences tied to their actual data","skillsToLearn":["...","...","..."],"firstSteps":["...","...","..."],"resources":[{"name":"...","provider":"...","kind":"course","url":null,"searchQuery":"..."}],"certifications":[{"name":"...","provider":"Coursera|Microsoft|Meta|Google|AWS|IBM"}]}]}

match is 0-100. firstSteps must be things they can start this month. Fill
"resources" (2-3 items per role) with a mix of courses/certifications,
technologies to learn, practice-problem sets, or project ideas relevant to
that specific role. Fill "certifications" (1-2 items per role) with real,
well-known industry certifications from major platforms — Coursera, Microsoft,
Meta, Google, AWS, or IBM — naming the certification and which of those
providers it's from; never include a "url" for these, the app links to the
provider's real site itself. ${RESOURCE_RULES}
`.trim();

const assignmentPrompt = (
  brief: string,
  type: string,
  subject: string,
  difficulty: string,
  user: Record<string, unknown>,
) => `
Create a ${difficulty} ${type} assignment on "${brief}" for the subject ${subject},
aimed at a ${learnerContext(user)}.

Write it in markdown with these sections:
- A one-paragraph scenario or brief
- Learning objectives (3-4 bullets)
- Tasks, numbered, increasing in difficulty
- Deliverables
- A marking scheme table with marks adding to 100
- Two hints that guide without giving answers

Return the markdown only. No preamble, no outer code fence.
`.trim();

const doubtAnswerPrompt = (
  title: string,
  body: string,
  subject: string,
  user: Record<string, unknown>,
) => `
A student posted this doubt in the EduMind community forum.

Subject: ${subject}
Title: ${title}
Question: ${body}

Answer it directly and practically for a ${learnerContext(user)}. Under 200 words,
markdown, include a code example if it helps. If the question is ambiguous, answer
the most likely reading and say in one line what you assumed.
`.trim();

/* ===== shared/fallbacks-tutor.ts ===================================================== */
/**
 * Deterministic tutor answers, ported verbatim from the TUTOR_FALLBACK block in
 * server/src/services/prompts.js. Used whenever the AI provider is unreachable,
 * so the demo never breaks.
 */

const TUTOR_FALLBACK: Record<string, string> = {
  recursion: `**Recursion** is when a function solves a problem by calling itself on a smaller version of the same problem.

Every recursive function needs two parts:
- a **base case** — the smallest input, where it stops calling itself
- a **recursive case** — where it calls itself on something smaller

\`\`\`python
def factorial(n):
    if n <= 1:                    # base case — stop here
        return 1
    return n * factorial(n - 1)   # recursive case

print(factorial(5))               # 120
\`\`\`

Each call waits on the call stack until the base case returns, then the answers multiply back up.

The mistake students make most: forgetting the base case, or writing one the input never reaches — which gives you infinite recursion and a \`RecursionError\`.`,

  loop: `A **for loop** repeats a block of code once for every item in a sequence.

\`\`\`python
for fruit in ["apple", "banana", "cherry"]:
    print(fruit)

for i in range(3):        # 0, 1, 2
    print(i)
\`\`\`

\`range(n)\` gives numbers from 0 up to but **not including** n — that off-by-one is the single most common mistake with loops.`,

  stack: `A **stack** is last-in-first-out; a **queue** is first-in-first-out.

- **Stack** — like plates piled up. Add and remove from the same end. Used for undo, browser back, and the function call stack.
- **Queue** — like a line at a counter. Add at the back, remove from the front. Used for task scheduling and BFS.

\`\`\`python
stack = []
stack.append(1); stack.append(2)
print(stack.pop())        # 2 — last in, first out

from collections import deque
queue = deque([1, 2])
print(queue.popleft())    # 1 — first in, first out
\`\`\`

Avoid \`list.pop(0)\` as a queue — it's O(n) because every element shifts. Use \`deque\`.`,

  bigo: `**Big-O notation** describes how an algorithm's work grows as the input grows — not how many seconds it takes.

- **O(1)** — same work regardless of size (dict lookup)
- **O(log n)** — halving each step (binary search)
- **O(n)** — one pass over the input
- **O(n²)** — nested loops over the same list

\`\`\`python
def has_duplicate(nums):      # O(n) — one pass
    seen = set()
    for n in nums:
        if n in seen:
            return True
        seen.add(n)
    return False
\`\`\`

The mistake students make: quoting the best case. Big-O describes the **worst case** unless you say otherwise.`,

  join: `A **SQL join** combines rows from two tables using a matching column.

- **INNER JOIN** — only rows that match in both tables
- **LEFT JOIN** — every row from the left table, plus matches from the right (\`NULL\` where there's no match)

\`\`\`sql
SELECT s.name, m.marks
FROM students s
LEFT JOIN marks m ON s.id = m.student_id;
\`\`\`

With \`LEFT JOIN\` a student who has no marks row still appears, with \`NULL\` marks. With \`INNER JOIN\` they vanish from the result — which is exactly the bug students hit when a count comes out lower than expected.`,

  _default: `Here's the short version.

Break the idea into three questions: **what is it**, **how does it work step by step**, and **when would I actually use it**. Answering those three in order is usually enough to make a concept stick.

\`\`\`python
# Try it, don't just read it — small examples beat long notes
for i in range(3):
    print("iteration", i)
\`\`\`

This is EduMind's offline response. Add an AI provider key on the server to get a full explanation on this exact topic.`,
};

function fallbackTutorAnswer(question: unknown): string {
  const key = detectTopicKeyword(question);
  const map: Record<string, string> = {
    recursion: "recursion",
    loop: "loop",
    stack: "stack",
    "big-o": "bigo",
    sql: "join",
  };
  return TUTOR_FALLBACK[map[key as string]] || TUTOR_FALLBACK._default;
}

/* ===== shared/fallbacks-assignment.ts ===================================================== */
/**
 * Deterministic assignment fallbacks, ported verbatim from
 * server/src/routes/assignments.js so an unreachable provider degrades to the
 * same content the Express server produced.
 */

/** Deterministic template used when no AI key is configured. */
function fallbackAssignment(
  brief: string,
  type: string,
  subject: string,
  difficulty: string,
): string {
  return `## Brief

You have been asked to work on **${brief}** as part of your ${subject} coursework. Treat this as a ${difficulty.toLowerCase()}-level ${type.replace("-", " ")} and assume your reader knows the subject but not your solution.

## Learning objectives

- Explain the core ideas behind ${brief} in your own words
- Apply those ideas to a problem you have not seen worked out
- Justify the trade-offs in the approach you chose
- Communicate the result clearly enough for a peer to reproduce it

## Tasks

1. **Summarise** the key concepts in ${brief} in under 200 words, without copying a definition.
2. **Work through** one concrete example end to end, showing every intermediate step.
3. **Extend** the example to a harder case and explain what breaks and why.
4. **Compare** your approach with one alternative, and say when each is the better choice.

## Deliverables

- A written report (800-1200 words) or a documented source file
- Your worked example with all steps visible
- A short reflection on what you found hardest

## Marking scheme

| Criterion | Marks |
|---|---|
| Correctness of the core concept | 30 |
| Quality of the worked example | 25 |
| Handling of the extended case | 20 |
| Comparison and justification | 15 |
| Clarity and presentation | 10 |
| **Total** | **100** |

## Hints

- Start with the simplest case that is still interesting, then add complexity one step at a time.
- If you cannot explain a step to a classmate in one sentence, you have not understood it yet — go back to that step before moving on.

*Generated offline by EduMind. Add an AI provider key on the server for assignments written specifically to your brief.*`;
}

/** Deterministic fallback grading -- deliberately does NOT pretend to assess
 *  correctness (it can't); it's an honest effort-based estimate, clearly
 *  labelled as such, rather than a fabricated content review. */
function fallbackGrading(submissionText: string) {
  const words = submissionText.trim().split(/\s+/).filter(Boolean).length;
  const score = Math.max(40, Math.min(75, Math.round(40 + words / 15)));
  return {
    score,
    feedback: `This is a rough, length-based estimate only (${words} words) — the AI provider is unavailable right now, so this isn't a real review of what you wrote. Ask for a re-grade once an AI key is configured on the server.`,
    strengths: words > 150 ? ["Submission is a reasonable length for this brief"] : [],
    improvements: ["Get this re-graded once AI grading is available — this score doesn't reflect correctness"],
  };
}

/* ===== shared/resources.ts ===================================================== */
/**
 * Resource recommendations, ported verbatim from server/src/services/resources.js.
 *
 * Two safety rules, because a model asked for "a course link" will occasionally
 * invent one that looks plausible and doesn't exist:
 *   1. sanitizeResources only keeps a `url` when its hostname is on
 *      TRUSTED_HOSTS. Everything else keeps the resource (name + provider) but
 *      drops the url, so the frontend renders it as a search prompt.
 *   2. STATIC_RESOURCES is a curated set used when there's no AI, or when the
 *      AI returns nothing usable -- never a fabricated one.
 */

const TRUSTED_HOSTS = new Set([
  "leetcode.com",
  "developer.mozilla.org",
  "docs.python.org",
  "www.w3schools.com",
  "react.dev",
  "geeksforgeeks.org",
  "www.geeksforgeeks.org",
  "www.freecodecamp.org",
  "docs.oracle.com",
  "nodejs.org",
  "expressjs.com",
  "git-scm.com",
  "www.postgresql.org",
  "www.mongodb.com",
  "en.wikipedia.org",
  "www.w3.org",
  "www.coursera.org",
  "coursera.org",
  "learn.microsoft.com",
  "grow.google",
  "aws.amazon.com",
]);

const KINDS = new Set(["docs", "tutorial", "course", "practice", "video", "article"]);

function safeUrl(url: unknown): string | null {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    return TRUSTED_HOSTS.has(u.hostname) ? url : null;
  } catch {
    return null;
  }
}

/** Cleans a model-supplied resource list into a safe, consistent shape. */
function sanitizeResources(list: unknown, { limit = 4 } = {}): Record<string, unknown>[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((r) => r && (r as Record<string, unknown>).name)
    .slice(0, limit)
    .map((r) => {
      const x = r as Record<string, unknown>;
      return {
        name: String(x.name).slice(0, 80),
        provider: x.provider ? String(x.provider).slice(0, 60) : "",
        kind: KINDS.has(x.kind as string) ? x.kind : "article",
        url: safeUrl(x.url),
        searchQuery: x.searchQuery
          ? String(x.searchQuery).slice(0, 120)
          : `${x.name} ${x.provider || ""}`.trim(),
      };
    });
}

/** Verified, stable top-level landing pages -- never a specific course page. */
const CERT_PLATFORM_HOMEPAGE = [
  { match: /meta/i, url: "https://www.coursera.org/meta" },
  { match: /microsoft/i, url: "https://learn.microsoft.com/en-us/credentials/" },
  { match: /google/i, url: "https://grow.google/certificates/" },
  { match: /aws|amazon/i, url: "https://aws.amazon.com/certification/" },
  { match: /ibm|coursera/i, url: "https://www.coursera.org/" },
];

function certHomepage(provider: unknown): string | null {
  const hit = CERT_PLATFORM_HOMEPAGE.find((p) => p.match.test(String(provider || "")));
  return hit ? hit.url : null;
}

/** Same shape as sanitizeResources, but the url is never taken from the model. */
function sanitizeCertifications(list: unknown, { limit = 3 } = {}): Record<string, unknown>[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((r) => r && (r as Record<string, unknown>).name)
    .slice(0, limit)
    .map((r) => {
      const x = r as Record<string, unknown>;
      return {
        name: String(x.name).slice(0, 90),
        provider: x.provider ? String(x.provider).slice(0, 40) : "",
        kind: "course",
        url: certHomepage(x.provider),
        searchQuery: `${x.name} ${x.provider || ""} certification`.trim(),
      };
    });
}

/** Curated, hand-verified -- used for fallback mode and as a topic top-up. */
const STATIC_RESOURCES: Record<string, Record<string, unknown>[]> = {
  recursion: [
    { name: "Recursion", provider: "LeetCode", kind: "practice", url: "https://leetcode.com/tag/recursion/", searchQuery: "leetcode recursion problems" },
    { name: "Recursion in Python", provider: "GeeksforGeeks", kind: "tutorial", url: "https://www.geeksforgeeks.org/", searchQuery: "geeksforgeeks recursion in python" },
  ],
  sql: [
    { name: "SQL Joins", provider: "W3Schools", kind: "docs", url: "https://www.w3schools.com/sql/sql_join.asp", searchQuery: "w3schools sql joins" },
    { name: "Database", provider: "LeetCode", kind: "practice", url: "https://leetcode.com/tag/database/", searchQuery: "leetcode database problems" },
  ],
  join: [
    { name: "SQL Joins", provider: "W3Schools", kind: "docs", url: "https://www.w3schools.com/sql/sql_join.asp", searchQuery: "w3schools sql joins" },
  ],
  dbms: [
    { name: "SQL Tutorial", provider: "W3Schools", kind: "docs", url: "https://www.w3schools.com/sql/", searchQuery: "w3schools sql tutorial" },
    { name: "Database", provider: "LeetCode", kind: "practice", url: "https://leetcode.com/tag/database/", searchQuery: "leetcode database problems" },
  ],
  "data structures": [
    { name: "Data Structures", provider: "GeeksforGeeks", kind: "tutorial", url: "https://www.geeksforgeeks.org/", searchQuery: "geeksforgeeks data structures" },
    { name: "Array & Hashing", provider: "LeetCode", kind: "practice", url: "https://leetcode.com/tag/array/", searchQuery: "leetcode array problems" },
  ],
  stack: [{ name: "Stack", provider: "LeetCode", kind: "practice", url: "https://leetcode.com/tag/stack/", searchQuery: "leetcode stack problems" }],
  queue: [{ name: "Queue", provider: "LeetCode", kind: "practice", url: "https://leetcode.com/tag/queue/", searchQuery: "leetcode queue problems" }],
  tree: [{ name: "Binary Tree", provider: "LeetCode", kind: "practice", url: "https://leetcode.com/tag/binary-tree/", searchQuery: "leetcode binary tree problems" }],
  graph: [{ name: "Graph", provider: "LeetCode", kind: "practice", url: "https://leetcode.com/tag/graph/", searchQuery: "leetcode graph problems" }],
  "dynamic programming": [{ name: "Dynamic Programming", provider: "LeetCode", kind: "practice", url: "https://leetcode.com/tag/dynamic-programming/", searchQuery: "leetcode dynamic programming problems" }],
  "big-o": [{ name: "Big-O Cheat Sheet", provider: "GeeksforGeeks", kind: "article", url: "https://www.geeksforgeeks.org/", searchQuery: "geeksforgeeks big o notation" }],
  python: [
    { name: "Python Docs", provider: "python.org", kind: "docs", url: "https://docs.python.org/3/", searchQuery: "python official documentation" },
    { name: "Python Practice", provider: "LeetCode", kind: "practice", url: "https://leetcode.com/", searchQuery: "leetcode python problems" },
  ],
  "web development": [
    { name: "JavaScript", provider: "MDN", kind: "docs", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript", searchQuery: "MDN javascript guide" },
    { name: "React", provider: "react.dev", kind: "docs", url: "https://react.dev/", searchQuery: "react official docs" },
    { name: "Responsive Web Design", provider: "freeCodeCamp", kind: "course", url: "https://www.freecodecamp.org/", searchQuery: "freecodecamp responsive web design" },
  ],
  "operating systems": [{ name: "Operating Systems", provider: "GeeksforGeeks", kind: "tutorial", url: "https://www.geeksforgeeks.org/", searchQuery: "geeksforgeeks operating systems notes" }],
  networks: [{ name: "Computer Networks", provider: "GeeksforGeeks", kind: "tutorial", url: "https://www.geeksforgeeks.org/", searchQuery: "geeksforgeeks computer networks notes" }],
  "machine learning": [{ name: "Machine Learning", provider: "GeeksforGeeks", kind: "tutorial", url: "https://www.geeksforgeeks.org/", searchQuery: "geeksforgeeks machine learning basics" }],
  aptitude: [{ name: "Quantitative Aptitude", provider: "GeeksforGeeks", kind: "practice", url: "https://www.geeksforgeeks.org/", searchQuery: "geeksforgeeks quantitative aptitude" }],
};

/** Loose match: topic first, then subject, then a generic search built from
 *  whichever name is available. Always returns at least one resource. */
function resourcesFor(topic: unknown, subject?: unknown): Record<string, unknown>[] {
  const key = String(topic || "").toLowerCase();
  const subjKey = String(subject || "").toLowerCase();

  for (const [k, v] of Object.entries(STATIC_RESOURCES)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  for (const [k, v] of Object.entries(STATIC_RESOURCES)) {
    if (subjKey.includes(k) || k.includes(subjKey)) return v;
  }
  const label = topic || subject || "this topic";
  return [{
    name: label,
    provider: "GeeksforGeeks",
    kind: "tutorial",
    url: null,
    searchQuery: `geeksforgeeks ${label}`.trim(),
  }];
}

/* ===== shared/aggregate.ts ===================================================== */
/**
 * Aggregations, replacing the Mongoose `Attempt.aggregate` pipelines.
 *
 * Backend functions may not execute raw SQL, so instead of a SQL view these
 * fetch a user's attempt rows with the query builder and reduce them in
 * TypeScript. Correct at this app's scale (a few dozen attempts per user), and
 * every return shape matches what the original $group/$avg pipelines produced.
 */

type AttemptRow = {
  topic: string | null;
  subject: string | null;
  percentage: number;
  created_at: string;
};

/** Just the columns the aggregations need. */
async function attemptRows(userId: string): Promise<AttemptRow[]> {
  const { data, error } = await db
    .from(TABLES.attempts)
    .select("topic,subject,percentage,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`[aggregate] attempt fetch failed for ${userId}: ${error.message}`);
    return [];
  }
  return (data ?? []) as AttemptRow[];
}

function groupAverages(
  rows: AttemptRow[],
  key: (r: AttemptRow) => string | null,
): Map<string, { sum: number; count: number }> {
  const map = new Map<string, { sum: number; count: number }>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    const cur = map.get(k) ?? { sum: 0, count: 0 };
    cur.sum += r.percentage;
    cur.count += 1;
    map.set(k, cur);
  }
  return map;
}

/**
 * Replaces the tutor/quiz weakTopics pipeline: group by topic, keep averages
 * under the threshold, sort ascending, take the first `limit`.
 */
async function weakTopicsFor(
  userId: string,
  { threshold = 60, limit = 3 }: { threshold?: number; limit?: number } = {},
): Promise<string[]> {
  const rows = await attemptRows(userId);
  const grouped = groupAverages(rows, (r) => r.topic);

  return [...grouped.entries()]
    .map(([topic, g]) => ({ topic, avg: g.sum / g.count }))
    .filter((r) => r.avg < threshold)
    .sort((a, b) => a.avg - b.avg)
    .slice(0, limit)
    .map((r) => r.topic)
    .filter(Boolean);
}

/**
 * Replaces the planner pipeline: group by (topic, subject), sort ascending,
 * keep averages under the threshold, rounded like the original.
 */
async function weakTopicsWithSubject(
  userId: string,
  { threshold = 70, limit = 5 }: { threshold?: number; limit?: number } = {},
): Promise<{ topic: string | null; subject: string | null; avg: number }[]> {
  const rows = await attemptRows(userId);
  const map = new Map<string, { topic: string | null; subject: string | null; sum: number; count: number }>();

  for (const r of rows) {
    const k = `${r.topic}||${r.subject}`;
    const cur = map.get(k) ?? { topic: r.topic, subject: r.subject, sum: 0, count: 0 };
    cur.sum += r.percentage;
    cur.count += 1;
    map.set(k, cur);
  }

  return [...map.values()]
    .map((g) => ({ topic: g.topic, subject: g.subject, avg: g.sum / g.count }))
    .sort((a, b) => a.avg - b.avg)
    .slice(0, limit)
    .filter((r) => r.avg < threshold)
    .map((r) => ({ topic: r.topic, subject: r.subject, avg: Math.round(r.avg) }));
}

/** Replaces the career pipeline: average percentage per subject. */
async function subjectAverages(
  userId: string,
): Promise<{ subject: string | null; average: number }[]> {
  const rows = await attemptRows(userId);
  const grouped = groupAverages(rows, (r) => r.subject);
  return [...grouped.entries()].map(([subject, g]) => ({
    subject,
    average: Math.round(g.sum / g.count),
  }));
}

/**
 * Replaces the progress pipeline: per-subject and per-topic averages with
 * attempt counts, both in one pass. Sort orders differ per caller, so both
 * lists come back unsorted and the route orders them.
 */
async function progressBreakdown(userId: string): Promise<{
  bySubject: { subject: string | null; average: number; attempts: number }[];
  byTopic: { topic: string | null; average: number; attempts: number }[];
}> {
  const rows = await attemptRows(userId);

  const bySubject = groupAverages(rows, (r) => r.subject);
  const byTopic = groupAverages(rows, (r) => r.topic);

  return {
    bySubject: [...bySubject.entries()].map(([subject, g]) => ({
      subject,
      average: Math.round(g.sum / g.count),
      attempts: g.count,
    })),
    byTopic: [...byTopic.entries()].map(([topic, g]) => ({
      topic,
      average: Math.round(g.sum / g.count),
      attempts: g.count,
    })),
  };
}

/* ===== shared/router.ts ===================================================== */
/**
 * A tiny path router, so the api function can reproduce Express's mounting:
 * `/api/tutor/sessions/:id` arrives here as ctx.segments = ["sessions", "<id>"].
 */

type RouteCtx = {
  req: Request;
  method: string;
  /** Path after the module's own mount point, e.g. ["tasks", "<uuid>"]. */
  segments: string[];
  url: URL;
};

/** Handlers that don't need path params simply declare fewer arguments. */
type RouteHandler = (
  ctx: RouteCtx,
  params: Record<string, string>,
) => Promise<Response>;

/** A raw database row as PostgREST returns it. Defined once here because every
 *  route module is concatenated into a single index.ts scope, so per-module
 *  aliases would collide. */
type Row = Record<string, unknown>;

/** Parse a JSON body, tolerating an empty or malformed one. */
async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await req.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Mongoose returned a CastError for a malformed ObjectId; a bad uuid is the
 *  same "not found" case here, so callers should treat null as 404. */
function asUuid(v: unknown): string | null {
  const s = String(v ?? "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null;
}

function toInt(v: unknown, fallback = 0): number {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Reshape flat route definitions into a matcher. `:param` segments capture. */
function match(
  routes: Record<string, [string, RouteHandler][]>,
  ctx: RouteCtx,
): { params: Record<string, string>; handler: RouteHandler } | null {
  const [method, path] = [ctx.method, ctx.segments.join("/")];
  for (const [pattern, handler] of routes[method] ?? []) {
    const pParts = pattern.split("/").filter(Boolean);
    if (pParts.length !== ctx.segments.length) continue;

    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < pParts.length; i++) {
      const p = pParts[i];
      if (p.startsWith(":")) params[p.slice(1)] = ctx.segments[i];
      else if (p !== ctx.segments[i]) { ok = false; break; }
    }
    if (ok) return { params, handler };
    void path;
  }
  return null;
}

/* ===== routes/health.ts ===================================================== */
/**
 * GET /api/health           -- config only, instant
 * GET /api/health/ai-check  -- real live call to the provider, 5/min
 *
 * Deliberately separate: /api/health stays instant and free (it is what an
 * uptime monitor polls), while ai-check actually calls the provider, because
 * aiConfigured only proves a key exists in the environment -- never that a real
 * request succeeds against it, which is exactly the bug that let this app
 * report "Connected / Configured" while silently serving fallback content.
 */

async function handleHealth(ctx: RouteCtx): Promise<Response | null> {
  const [first] = ctx.segments;

  /* GET /api/health */
  if (ctx.method === "GET" && ctx.segments.length === 0) {
    return json({
      status: "ok",
      uptime: Math.round(performance.now() / 1000),
      aiProvider: activeProvider(),
      aiModel: activeModel(),
      aiEngine: isQwen() ? "Qwen" : activeModel(),
      aiConfigured: aiConfigured(),
      availableModels: activeProvider() === "groq" ? AVAILABLE_MODELS : [],
      timestamp: new Date().toISOString(),
    });
  }

  /* GET /api/health/ai-check */
  if (ctx.method === "GET" && first === "ai-check" && ctx.segments.length === 1) {
    const limited = await checkRateLimit(`aicheck:${clientIp(ctx.req)}`, LIMITS.aiCheck);
    if (limited) return limited;


    const result = await livePing({
      force: ctx.url.searchParams.get("force") === "1",
      model: modelFromRequest(ctx.req),
    });
    return json(result);
  }

  return null;
}

/* ===== routes/auth.ts ===================================================== */
/**
 * /api/auth -- register, login, me. Ported from server/src/routes/auth.js.
 *
 * Custom auth is kept deliberately: email + bcrypt + our own JWT, so the
 * existing Login.jsx / Register.jsx / AuthContext.jsx and the seeded demo
 * passwords work with zero changes.
 */
type UserRow = Record<string, unknown>;

async function register(ctx: RouteCtx): Promise<Response> {
  const b = await body(ctx.req);
  const name = String(b.name ?? "").trim();
  const email = String(b.email ?? "").toLowerCase().trim();
  const password = String(b.password ?? "");
  const department = b.department ? String(b.department) : undefined;
  const year = b.year !== undefined ? Number(b.year) : undefined;
  const subjects = Array.isArray(b.subjects) ? (b.subjects as unknown[]).map(String) : [];
  const learningStyle = b.learningStyle ? String(b.learningStyle) : undefined;

  if (!name || !email || !password) {
    return json({ message: "Name, email and password are all required" }, 400);
  }
  if (password.length < 6) {
    return json({ message: "Password must be at least 6 characters" }, 400);
  }

  const { data: existing } = await db.from(TABLES.users).select("id").eq("email", email).maybeSingle();
  if (existing) return json({ message: "That email is already registered" }, 409);

  const insert: Record<string, unknown> = { name, email, password_hash: await hashPassword(password) };
  if (department) insert.department = department;
  if (year !== undefined && Number.isFinite(year)) insert.year = year;
  if (subjects.length) insert.subjects = subjects;
  if (learningStyle) insert.learning_style = learningStyle;
  insert.last_active_date = new Date().toISOString();

  const { data: user, error } = await db.from(TABLES.users).insert(insert).select("*").single();
  if (error || !user) {
    console.error(`[auth] register insert failed: ${error?.message}`);
    // Mirrors the old duplicate-key path in middleware/error.js.
    if (error?.code === "23505") return json({ message: "That email is already registered" }, 409);
    return json({ message: error?.message || "Couldn't create your account" }, 500);
  }
  const u = user as UserRow;

  // Give every new account a starting plan so no screen is ever empty.
  const userSubjects = (u.subjects as string[]) ?? [];
  await db.from(TABLES.goals).insert({
    user_id: u.id,
    title: `Build a strong foundation in ${userSubjects[0] ?? "your subjects"}`,
    target_date: new Date(Date.now() + 60 * 864e5).toISOString(),
    progress: 5,
  });

  const starterTasks = userSubjects.slice(0, 3).map((s, i) => ({
    user_id: u.id,
    title: `Get started with ${s}`,
    subject: s,
    topic: "Fundamentals",
    scheduled_for: new Date(Date.now() + i * 864e5).toISOString(),
    duration_minutes: 45,
    priority: i + 1,
    note: "Starter task — take a quiz and EduMind will replan around your results",
  }));
  if (starterTasks.length) {
    const { error: taskErr } = await db.from(TABLES.tasks).insert(starterTasks);
    if (taskErr) console.error(`[auth] starter tasks failed for ${u.id}: ${taskErr.message}`);
  }

  return json({ token: await signToken(u.id as string), user: shapeUser(u) }, 201);
}

async function login(ctx: RouteCtx): Promise<Response> {
  const b = await body(ctx.req);
  const email = String(b.email ?? "").toLowerCase();
  const password = String(b.password ?? "");
  if (!email || !password) return json({ message: "Enter your email and password" }, 400);

  const { data } = await db.from(TABLES.users).select("*").eq("email", email).maybeSingle();
  const user = data as UserRow | null;
  if (!user || !(await matchPassword(password, String(user.password_hash)))) {
    return json({ message: "Email or password is incorrect" }, 401);
  }

  // Streak: consecutive calendar days with a login.
  const today = new Date().toDateString();
  const last = user.last_active_date ? new Date(user.last_active_date as string).toDateString() : null;
  if (last !== today) {
    const yesterday = new Date(Date.now() - 864e5).toDateString();
    const streak = last === yesterday ? Number(user.streak ?? 0) + 1 : 1;
    const { error } = await db
      .from(TABLES.users)
      .update({ streak, last_active_date: new Date().toISOString() })
      .eq("id", user.id);
    if (error) console.error(`[auth] streak update failed for ${user.id}: ${error.message}`);
    user.streak = streak;
  }

  return json({ token: await signToken(user.id as string), user: shapeUser(user) });
}

async function me(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  return json({ user: shapeUser(user) });
}

async function updateMe(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const b = await body(ctx.req);
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "department", "year", "subjects", "learningStyle", "dailyTargetMinutes"]) {
    if (b[k] === undefined) continue;
    if (k === "learningStyle") patch.learning_style = b[k];
    else if (k === "dailyTargetMinutes") patch.daily_target_minutes = Number(b[k]);
    else patch[k] = b[k];
  }

  if (Object.keys(patch).length) {
    const { data, error: upErr } = await db
      .from(TABLES.users)
      .update(patch)
      .eq("id", user.id)
      .select("*")
      .single();
    if (upErr) {
      console.error(`[auth] profile update failed for ${user.id}: ${upErr.message}`);
      return json({ message: upErr.message }, 400);
    }
    return json({ user: shapeUser(data as UserRow) });
  }
  return json({ user: shapeUser(user) });
}

const AUTH_ROUTES: Record<string, [string, RouteHandler][]> = {
  POST: [["register", register], ["login", login]],
  GET: [["me", me]],
  PUT: [["me", updateMe]],
};

async function handleAuth(ctx: RouteCtx): Promise<Response | null> {
  const hit = match(AUTH_ROUTES, ctx);
  if (!hit) return null;
  return hit.handler(ctx, hit.params);
}

/* ===== routes/progress.ts ===================================================== */
/**
 * /api/progress -- the dashboard payload. Ported from server/src/routes/progress.js.
 */

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

async function handleProgress(ctx: RouteCtx): Promise<Response | null> {
  const hit = match(PROGRESS_ROUTES, ctx);
  if (!hit) return null;
  return hit.handler(ctx, hit.params);
}

/* ===== routes/planner.ts ===================================================== */
/**
 * /api/planner -- goals, tasks, and the AI rebuild. Ported from
 * server/src/routes/planner.js.
 */


/** GET /api/planner -- goals + tasks + today's focus. */
async function getPlanner(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const uid = user.id as string;

  const [goalsRes, tasksRes] = await Promise.all([
    db.from(TABLES.goals).select("*").eq("user_id", uid).order("created_at", { ascending: true }),
    db.from(TABLES.tasks).select("*").eq("user_id", uid)
      .order("priority", { ascending: true }).order("scheduled_for", { ascending: true }),
  ]);
  if (goalsRes.error) console.error(`[planner] goals failed: ${goalsRes.error.message}`);
  if (tasksRes.error) console.error(`[planner] tasks failed: ${tasksRes.error.message}`);

  const goals = ((goalsRes.data ?? []) as Row[]).map(serializeGoal);
  const tasks = ((tasksRes.data ?? []) as Row[]).map(serializeTask);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 864e5);

  const today = tasks.filter((t) => {
    if (t.completed) return false;
    const when = new Date(t.scheduledFor as string).getTime();
    return when >= startOfDay.getTime() && when < endOfDay.getTime();
  });
  const focus = today[0] || tasks.find((t) => !t.completed) || null;

  return json({ goals, tasks, today, focus, weakTopics: await weakTopicsWithSubject(uid) });
}

/** POST /api/planner/generate { days } -- AI rebuilds the plan around weak topics. */
async function generatePlan(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const uid = user.id as string;

  const b = await body(ctx.req);
  const days = Math.min(Math.max(toInt(b.days, 7), 3), 14);
  const weak = await weakTopicsWithSubject(uid);
  const weakNames = weak.map((w) => `${w.topic} (${w.avg}%)`);
  const subjects = (user.subjects as string[]) ?? [];

  let tasks: Row[];
  let source = "ai";
  try {
    if (!aiConfigured()) throw new Error("no key");
    const data = (await completeJSON({
      prompt: plannerPrompt(user, weakNames, days),
      model: modelFromRequest(ctx.req),
    })) as Record<string, unknown> | Record<string, unknown>[];
    const list = (Array.isArray(data) ? data : data.tasks) as Row[] | undefined;

    tasks = (list || [])
      .filter((t) => t?.title)
      .slice(0, days * 2)
      .map((t) => {
        const label = String(t.topic || t.title);
        const isWeak = weak.some(
          (w) => w.topic && label.toLowerCase().includes(String(w.topic).toLowerCase()),
        );
        let resources = sanitizeResources(t.resources, { limit: 2 });
        // If this task is built around a weak topic but the model gave nothing
        // usable, top it up from the curated set rather than leaving it empty.
        if (isWeak && !resources.length) resources = resourcesFor(t.topic || t.title, t.subject);
        return {
          user_id: uid,
          title: String(t.title),
          subject: String(t.subject || subjects[0]),
          topic: label,
          scheduled_for: new Date(Date.now() + (Number(t.dayOffset) || 0) * 864e5).toISOString(),
          duration_minutes: Math.min(Math.max(Number(t.durationMinutes) || 45, 15), 180),
          priority: Math.min(Math.max(Number(t.priority) || 2, 1), 3),
          auto_scheduled: true,
          note: String(t.note || ""),
          resources,
        };
      });
    if (!tasks.length) throw new Error("empty plan");
  } catch (err) {
    console.error(`[planner] falling back to rules-based plan for user ${uid}: ${(err as Error).message}`);
    // Deterministic planner: weak topics first, then a pass over every subject.
    source = "rules";
    const queue = [
      ...weak.map((w) => ({
        title: `Revise ${w.topic}`, subject: w.subject, topic: w.topic, priority: 1,
        note: `Scheduled first — your average here is ${w.avg}%`,
        resources: resourcesFor(w.topic, w.subject),
      })),
      ...subjects.map((s) => ({
        title: `Practice ${s}`, subject: s, topic: s, priority: 2,
        note: "Regular practice block", resources: [] as Row[],
      })),
      {
        title: "Mixed practice: 10 MCQs across all subjects", subject: subjects[0],
        topic: "Revision", priority: 3, note: "Weekly mixed revision", resources: [] as Row[],
      },
    ].slice(0, days);

    tasks = queue.map((t, i) => ({
      ...t,
      user_id: uid,
      scheduled_for: new Date(Date.now() + i * 864e5).toISOString(),
      duration_minutes: (user.daily_target_minutes as number) || 45,
      auto_scheduled: true,
    }));
  }

  // Replace only the un-completed auto-scheduled tasks; keep manual and done ones.
  const { error: delErr } = await db
    .from(TABLES.tasks).delete()
    .eq("user_id", uid).eq("completed", false).eq("auto_scheduled", true);
  if (delErr) console.error(`[planner] replace delete failed for ${uid}: ${delErr.message}`);

  const { data: created, error: insErr } = await db.from(TABLES.tasks).insert(tasks).select("*");
  if (insErr) {
    console.error(`[planner] task insert failed for ${uid}: ${insErr.message}`);
    return json({ message: insErr.message }, 500);
  }

  return json(
    { tasks: ((created ?? []) as Row[]).map(serializeTask), source, weakTopics: weak },
    201,
  );
}

/** POST /api/planner/tasks */
async function createTask(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const b = await body(ctx.req);
  if (!b.title) return json({ message: "Give the task a title" }, 400);

  const { data, error: insErr } = await db
    .from(TABLES.tasks)
    .insert({
      user_id: user.id,
      title: b.title,
      subject: b.subject ?? null,
      topic: b.topic ?? null,
      scheduled_for: new Date((b.scheduledFor as string) || Date.now()).toISOString(),
      duration_minutes: Number(b.durationMinutes) || 45,
      priority: Number(b.priority) || 2,
    })
    .select("*")
    .single();
  if (insErr) {
    console.error(`[planner] create task failed: ${insErr.message}`);
    return json({ message: insErr.message }, 400);
  }
  return json({ task: serializeTask(data as Row) }, 201);
}

/** PATCH /api/planner/tasks/:id -- toggle done, edit fields. */
async function patchTask(ctx: RouteCtx, params: Record<string, string>): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const uid = user.id as string;

  const { data: existing } = await db
    .from(TABLES.tasks).select("*").eq("id", params.id).eq("user_id", uid).maybeSingle();
  if (!existing) return json({ message: "Task not found" }, 404);
  const task = existing as Row;

  const b = await body(ctx.req);
  const patch: Row = {};

  if (b.completed !== undefined) {
    const completed = Boolean(b.completed);
    patch.completed = completed;
    patch.completed_at = completed ? new Date().toISOString() : null;
    if (completed) {
      const { error: upErr } = await db
        .from(TABLES.users)
        .update({ study_minutes: Number(user.study_minutes ?? 0) + Number(task.duration_minutes ?? 0) })
        .eq("id", uid);
      if (upErr) console.error(`[planner] studyMinutes update failed for ${uid}: ${upErr.message}`);
    }
  }
  for (const k of ["title", "subject", "topic", "priority", "durationMinutes", "scheduledFor"]) {
    if (b[k] === undefined) continue;
    if (k === "durationMinutes") patch.duration_minutes = Number(b[k]);
    else if (k === "scheduledFor") patch.scheduled_for = new Date(b[k] as string).toISOString();
    else patch[k] = b[k];
  }

  const { data, error: upErr } = await db
    .from(TABLES.tasks).update(patch).eq("id", params.id).eq("user_id", uid).select("*").single();
  if (upErr) {
    console.error(`[planner] patch task failed: ${upErr.message}`);
    return json({ message: upErr.message }, 400);
  }
  return json({ task: serializeTask(data as Row) });
}

async function deleteTask(ctx: RouteCtx, params: Record<string, string>): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const { data, error: delErr } = await db
    .from(TABLES.tasks).delete().eq("id", params.id).eq("user_id", user.id).select("id");
  if (delErr) console.error(`[planner] delete task failed: ${delErr.message}`);
  if (!data?.length) return json({ message: "Task not found" }, 404);
  return json({ message: "Task removed" });
}

/* ------------------------------------------------------------------ goals */

async function createGoal(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const b = await body(ctx.req);
  if (!b.title) return json({ message: "Give the goal a title" }, 400);

  const { data, error: insErr } = await db
    .from(TABLES.goals)
    .insert({
      user_id: user.id,
      title: b.title,
      target_date: b.targetDate ? new Date(b.targetDate as string).toISOString() : null,
    })
    .select("*")
    .single();
  if (insErr) {
    console.error(`[planner] create goal failed: ${insErr.message}`);
    return json({ message: insErr.message }, 400);
  }
  return json({ goal: serializeGoal(data as Row) }, 201);
}

async function patchGoal(ctx: RouteCtx, params: Record<string, string>): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const { data: existing } = await db
    .from(TABLES.goals).select("id").eq("id", params.id).eq("user_id", user.id).maybeSingle();
  if (!existing) return json({ message: "Goal not found" }, 404);

  const b = await body(ctx.req);
  const patch: Row = {};
  if (b.title !== undefined) patch.title = b.title;
  if (b.targetDate !== undefined) patch.target_date = new Date(b.targetDate as string).toISOString();
  if (b.progress !== undefined) patch.progress = Number(b.progress);
  if (b.status !== undefined) patch.status = b.status;

  const { data, error: upErr } = await db
    .from(TABLES.goals).update(patch).eq("id", params.id).eq("user_id", user.id).select("*").single();
  if (upErr) {
    console.error(`[planner] patch goal failed: ${upErr.message}`);
    return json({ message: upErr.message }, 400);
  }
  return json({ goal: serializeGoal(data as Row) });
}

async function deleteGoal(ctx: RouteCtx, params: Record<string, string>): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const { error: delErr } = await db
    .from(TABLES.goals).delete().eq("id", params.id).eq("user_id", user.id);
  if (delErr) console.error(`[planner] delete goal failed: ${delErr.message}`);
  return json({ message: "Goal removed" });
}

const PLANNER_ROUTES: Record<string, [string, RouteHandler][]> = {
  GET: [["", getPlanner]],
  POST: [["generate", generatePlan], ["tasks", createTask], ["goals", createGoal]],
  PATCH: [["tasks/:id", patchTask], ["goals/:id", patchGoal]],
  DELETE: [["tasks/:id", deleteTask], ["goals/:id", deleteGoal]],
};

async function handlePlanner(ctx: RouteCtx): Promise<Response | null> {
  const hit = match(PLANNER_ROUTES, ctx);
  if (!hit) return null;
  return hit.handler(ctx, hit.params);
}

/* ===== routes/quiz.ts ===================================================== */
/**
 * /api/quiz -- generation, the seeded bank, and server-side grading.
 * Ported from server/src/routes/quiz.js.
 *
 * SECURITY INVARIANT: answerIndex never leaves this module. quizForClient()
 * strips it from every quiz sent to the browser, and grading happens here using
 * the full row read with the service-role client.
 */


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

async function handleQuiz(ctx: RouteCtx): Promise<Response | null> {
  const hit = match(QUIZ_ROUTES, ctx);
  if (!hit) return null;
  return hit.handler(ctx, hit.params);
}

/* ===== routes/tutor.ts ===================================================== */
/**
 * /api/tutor -- chat sessions with the AI tutor. Ported from
 * server/src/routes/tutor.js.
 */


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

async function handleTutor(ctx: RouteCtx): Promise<Response | null> {
  const hit = match(TUTOR_ROUTES, ctx);
  if (!hit) return null;
  return hit.handler(ctx, hit.params);
}

/* ===== routes/doubts.ts ===================================================== */
/**
 * /api/doubts -- the shared community forum. Ported from
 * server/src/routes/doubts.js.
 *
 * The feed is intentionally shared: every authenticated user can read every
 * doubt (that is the point of a forum), but only the author can edit, resolve
 * or delete their own. This reproduces that exactly -- no more, no less.
 */


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

async function handleDoubts(ctx: RouteCtx): Promise<Response | null> {
  const hit = match(DOUBTS_ROUTES, ctx);
  if (!hit) return null;
  return hit.handler(ctx, hit.params);
}

/* ===== routes/assignments.ts ===================================================== */
/**
 * /api/assignments -- generation, submission and AI grading. Ported from
 * server/src/routes/assignments.js.
 */


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

async function handleAssignments(ctx: RouteCtx): Promise<Response | null> {
  const hit = match(ASSIGNMENTS_ROUTES, ctx);
  if (!hit) return null;
  return hit.handler(ctx, hit.params);
}

/* ===== routes/career.ts ===================================================== */
/**
 * /api/career -- role recommendations. Ported from server/src/routes/career.js.
 */


/** Seeded role library -- used when no AI key is configured. */
const ROLE_LIBRARY = [
  {
    role: "Backend Engineer",
    drivers: ["Python", "DBMS", "Data Structures"],
    why: "Your strongest measured subjects are the ones backend interviews test hardest: language fundamentals, data structures and database querying.",
    skillsToLearn: ["Node.js or Django REST APIs", "SQL query optimisation", "Docker basics", "System design fundamentals"],
    firstSteps: ["Build one CRUD API with auth and deploy it", "Solve 20 array and hashmap problems", "Write a README that explains your schema choices"],
    certifications: [
      { name: "AWS Certified Cloud Practitioner", provider: "AWS" },
      { name: "Meta Back-End Developer Professional Certificate", provider: "Meta" },
    ],
  },
  {
    role: "Full-Stack Developer",
    drivers: ["Web Development", "Python", "DBMS"],
    why: "You already ship working interfaces alongside server logic, which is the exact combination product teams hire for at entry level.",
    skillsToLearn: ["React state management", "REST and JWT auth patterns", "CI/CD with GitHub Actions", "Responsive CSS"],
    firstSteps: ["Ship one full-stack app to a real URL", "Add tests to an existing project", "Rebuild a product you use, badly, then improve it"],
    certifications: [
      { name: "Meta Front-End Developer Professional Certificate", provider: "Meta" },
      { name: "Microsoft Certified: Azure Fundamentals (AZ-900)", provider: "Microsoft" },
    ],
  },
  {
    role: "IoT / Embedded Systems Engineer",
    drivers: ["Python", "Data Structures"],
    why: "Your branch is CSE (IoT), and embedded roles reward exactly the low-level, constraint-aware thinking your coursework already covers.",
    skillsToLearn: ["Embedded C", "MQTT and edge protocols", "ESP32 / Raspberry Pi projects", "Sensor data pipelines"],
    firstSteps: ["Build a sensor-to-dashboard pipeline end to end", "Publish the wiring diagram and firmware", "Read one datasheet fully"],
    certifications: [
      { name: "Microsoft Certified: Azure Fundamentals (AZ-900)", provider: "Microsoft" },
      { name: "AWS Certified Cloud Practitioner", provider: "AWS" },
    ],
  },
  {
    role: "Data Analyst",
    drivers: ["DBMS", "Python"],
    why: "Analytics converts your SQL and Python work into business questions, and it is the shortest bridge from your current subjects to a paid role.",
    skillsToLearn: ["Pandas and NumPy", "Window functions in SQL", "Power BI or Tableau", "Statistics for A/B testing"],
    firstSteps: ["Clean one messy public dataset and publish the notebook", "Recreate a company dashboard from open data", "Write up one insight in plain English"],
    certifications: [
      { name: "Google Data Analytics Professional Certificate", provider: "Google" },
      { name: "IBM Data Analyst Professional Certificate", provider: "IBM" },
    ],
  },
  {
    role: "Machine Learning Engineer",
    drivers: ["Python", "Data Structures"],
    why: "Your Python scores are consistently your highest, which is the prerequisite most ML candidates are actually missing.",
    skillsToLearn: ["Linear algebra and probability", "scikit-learn then PyTorch", "Feature engineering", "Model deployment with FastAPI"],
    firstSteps: ["Train and deploy one model behind an API", "Reproduce a paper's baseline", "Learn to read a confusion matrix properly"],
    certifications: [
      { name: "Google AI Professional Certificate", provider: "Google" },
      { name: "IBM Data Science Professional Certificate", provider: "IBM" },
    ],
  },
];

function fallbackRecommendations(perf: { subject: string | null; average: number }[]): Row[] {
  const scoreOf = (s: string) => perf.find((p) => p.subject === s)?.average ?? 55;
  return ROLE_LIBRARY
    .map((r) => {
      const avg = r.drivers.reduce((a, d) => a + scoreOf(d), 0) / r.drivers.length;
      return {
        role: r.role,
        match: Math.round(Math.min(96, avg * 0.9 + 15)),
        why: r.why,
        skillsToLearn: r.skillsToLearn,
        firstSteps: r.firstSteps,
        resources: resourcesFor(r.skillsToLearn[0], r.drivers[0]),
        certifications: sanitizeCertifications(r.certifications),
      };
    })
    .sort((a, b) => (b.match as number) - (a.match as number))
    .slice(0, 4);
}

/** GET /api/career -- last saved plan. */
async function getPlan(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;

  const { data } = await db
    .from(TABLES.careerPlans).select("*").eq("user_id", user.id)
    .order("created_at", { ascending: false }).limit(1);
  const plan = ((data ?? []) as Row[])[0];
  return json({ plan: plan ? serializeCareerPlan(plan) : null });
}

/** POST /api/career/generate { interests: [], strengths: [] } */
async function generateCareer(ctx: RouteCtx): Promise<Response> {
  const { user, error } = await protect(ctx.req);
  if (error) return error;
  const uid = user.id as string;

  const b = await body(ctx.req);
  const interests = (Array.isArray(b.interests) ? (b.interests as unknown[]) : []).map(String).slice(0, 8);
  const strengths = (Array.isArray(b.strengths) ? (b.strengths as unknown[]) : []).map(String).slice(0, 8);

  const perf = await subjectAverages(uid);

  let recommendations: Row[];
  let source = "ai";
  try {
    if (!aiConfigured()) throw new Error("no key");
    const data = (await completeJSON({
      prompt: careerPrompt(user, interests, strengths, perf as { subject: string; average: number }[]),
      model: modelFromRequest(ctx.req),
    })) as Row | Row[];
    const list = ((Array.isArray(data) ? data : data.recommendations) as Row[]) || [];
    recommendations = list
      .filter((r) => r?.role)
      .slice(0, 5)
      .map((r) => ({
        role: String(r.role),
        match: Math.min(100, Math.max(0, Number(r.match) || 70)),
        why: String(r.why || ""),
        skillsToLearn: ((r.skillsToLearn as unknown[]) || []).map(String).slice(0, 6),
        firstSteps: ((r.firstSteps as unknown[]) || []).map(String).slice(0, 5),
        resources: sanitizeResources(r.resources, { limit: 3 }),
        certifications: sanitizeCertifications(r.certifications, { limit: 3 }),
      }));
    if (!recommendations.length) throw new Error("empty");
  } catch (err) {
    console.error(`[career] falling back to rules-based recommendations for user ${uid}: ${(err as Error).message}`);
    source = "rules";
    recommendations = fallbackRecommendations(perf);
  }

  const { data: plan, error: insErr } = await db
    .from(TABLES.careerPlans)
    .insert({ user_id: uid, interests, strengths, recommendations })
    .select("*")
    .single();
  if (insErr) {
    console.error(`[career] insert failed for ${uid}: ${insErr.message}`);
    return json({ message: insErr.message }, 500);
  }
  return json({ plan: serializeCareerPlan(plan as Row), source, performance: perf }, 201);
}

const CAREER_ROUTES: Record<string, [string, RouteHandler][]> = {
  GET: [["", getPlan]],
  POST: [["generate", generateCareer]],
};

async function handleCareer(ctx: RouteCtx): Promise<Response | null> {
  const hit = match(CAREER_ROUTES, ctx);
  if (!hit) return null;
  return hit.handler(ctx, hit.params);
}

/* ===== routes/assessment.ts ===================================================== */
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

async function handleAssessment(ctx: RouteCtx): Promise<Response | null> {
  const hit = match(ASSESSMENT_ROUTES, ctx);
  if (!hit) return null;
  return hit.handler(ctx, hit.params);
}

/* ===== routes/dispatch.ts ===================================================== */
/**
 * The router: strips the /functions/v1/api prefix and dispatches to a route
 * module, applying the same mount-level rate limits server.js used.
 *
 * NOTE: this file is concatenated (with shared/*.ts and routes/*.ts) into the
 * single deployable supabase/functions/api/index.ts by scripts/build-function.sh
 * -- the deploy tool bundles only index.ts, so relative imports cannot ship.
 * Edit the modules, re-run the script, redeploy.
 */

/** /functions/v1/api/... -> ["..."]. */
const FUNCTION_PREFIX = "/functions/v1/api";

function segmentsFor(url: URL): string[] {
  let path = url.pathname;
  if (path.startsWith(FUNCTION_PREFIX)) path = path.slice(FUNCTION_PREFIX.length);
  // Tolerate a bare /api mount too (local invoke, manual testing).
  if (path.startsWith("/api")) path = path.slice(4);
  return path.split("/").filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();

  const url = new URL(req.url);
  const segments = segmentsFor(url);
  const ctx: RouteCtx = { req, method: req.method, segments, url };

  try {
    // GET / -- service identity, as the Express app served.
    if (segments.length === 0 && req.method === "GET") {
      return json({ name: "EduMind AI API", version: "1.0.0", docs: "/api/health" });
    }

    const mount = segments[0];
    const sub: RouteCtx = { ...ctx, segments: segments.slice(1) };

    /* ------------------------------------------------- rate limits (server.js) */
    if (mount === "auth") {
      const limited = await checkRateLimit(`auth:${clientIp(req)}`, LIMITS.auth);
      if (limited) return limited;
    }
    if (mount && AI_ROUTE_PREFIXES.includes(mount)) {
      const model = req.headers.get("x-ai-model") || "default";
      const limited = await checkRateLimit(`ai:${clientIp(req)}:${model}`, LIMITS.ai);
      if (limited) return limited;
    }

    /* ------------------------------------------------------------- dispatch */
    let out: Response | null = null;
    switch (mount) {
      case "health":
        out = await handleHealth(sub);
        break;
      case "auth":
        out = await handleAuth(sub);
        break;
      case "progress":
        out = await handleProgress(sub);
        break;
      case "planner":
        out = await handlePlanner(sub);
        break;
      case "quiz":
        out = await handleQuiz(sub);
        break;
      case "tutor":
        out = await handleTutor(sub);
        break;
      case "doubts":
        out = await handleDoubts(sub);
        break;
      case "assignments":
        out = await handleAssignments(sub);
        break;
      case "career":
        out = await handleCareer(sub);
        break;
      case "assessment":
        out = await handleAssessment(sub);
        break;
      default:
        out = null;
    }
    if (out) return out;

    return json(
      { message: `Route not found: ${req.method} /api/${segments.join("/")}` },
      404,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong on the server";
    console.error(`[api] unhandled error on ${req.method} ${url.pathname}: ${message}`);
    return new Response(JSON.stringify({ message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

