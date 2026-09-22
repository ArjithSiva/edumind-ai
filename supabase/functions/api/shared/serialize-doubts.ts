/**
 * Serializers for the doubt forum. Answers were Mongoose subdocuments inside
 * each Doubt; they now live in their own table, so the API has to nest them
 * back under `answers` with their own `_id` -- the client reads answer._id for
 * the upvote call (POST /api/doubts/:id/answers/:answerId/upvote).
 */
import { iso } from "./serialize.ts";

export function serializeDoubtAnswer(a: Record<string, unknown>) {
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
export function serializeDoubt(
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
