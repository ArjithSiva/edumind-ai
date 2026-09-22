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
import { db, TABLES } from "./db.ts";
import { json } from "./cors.ts";

/** Render sat behind a proxy; take the first hop of x-forwarded-for as the client IP. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const first = fwd.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

type Limit = { windowMs: number; max: number; message: string };

export const LIMITS = {
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
export const AI_ROUTE_PREFIXES = ["tutor", "quiz", "career", "assignments", "assessment"];

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
export async function checkRateLimit(
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
