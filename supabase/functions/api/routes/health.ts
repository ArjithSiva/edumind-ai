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
import { json } from "../shared/cors.ts";
import { checkRateLimit, clientIp, LIMITS } from "../shared/ratelimit.ts";
import { activeModel, activeProvider, aiConfigured, AVAILABLE_MODELS, isQwen, modelFromRequest } from "../shared/ai.ts";
import { livePing } from "../shared/ai-ping.ts";
import type { RouteCtx } from "../shared/router.ts";

export async function handleHealth(ctx: RouteCtx): Promise<Response | null> {
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
