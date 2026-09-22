/**
 * Aggregations, replacing the Mongoose `Attempt.aggregate` pipelines.
 *
 * Backend functions may not execute raw SQL, so instead of a SQL view these
 * fetch a user's attempt rows with the query builder and reduce them in
 * TypeScript. Correct at this app's scale (a few dozen attempts per user), and
 * every return shape matches what the original $group/$avg pipelines produced.
 */
import { db, TABLES } from "./db.ts";

export type AttemptRow = {
  topic: string | null;
  subject: string | null;
  percentage: number;
  created_at: string;
};

/** Just the columns the aggregations need. */
export async function attemptRows(userId: string): Promise<AttemptRow[]> {
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
export async function weakTopicsFor(
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
export async function weakTopicsWithSubject(
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
export async function subjectAverages(
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
export async function progressBreakdown(userId: string): Promise<{
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
