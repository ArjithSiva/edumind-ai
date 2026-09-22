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
import { activeModel, activeProvider, aiConfigured, complete, hasProvider, keyEnvVarFor } from "./ai.ts";

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

export async function livePing(
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
