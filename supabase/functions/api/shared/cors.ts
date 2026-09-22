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
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ai-model, x-seed-token",
  "Access-Control-Max-Age": "86400",
};

/** JSON response with the CORS headers attached. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Preflight short-circuit -- must run before any other work. */
export function preflight(): Response {
  return new Response("ok", { headers: corsHeaders });
}
