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
