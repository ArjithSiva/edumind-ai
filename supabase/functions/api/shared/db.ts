/**
 * Service-role Supabase client for the api function.
 *
 * Every table has RLS enabled with no anon/authenticated policies, so all
 * access goes through this client. Route code is responsible for scoping each
 * query to the authenticated user's id.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const TABLES = {
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
