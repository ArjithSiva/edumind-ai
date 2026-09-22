/**
 * A tiny path router, so the api function can reproduce Express's mounting:
 * `/api/tutor/sessions/:id` arrives here as ctx.segments = ["sessions", "<id>"].
 */

export type RouteCtx = {
  req: Request;
  method: string;
  /** Path after the module's own mount point, e.g. ["tasks", "<uuid>"]. */
  segments: string[];
  url: URL;
};

/** Handlers that don't need path params simply declare fewer arguments. */
export type RouteHandler = (
  ctx: RouteCtx,
  params: Record<string, string>,
) => Promise<Response>;

/** A raw database row as PostgREST returns it. Defined once here because every
 *  route module is concatenated into a single index.ts scope, so per-module
 *  aliases would collide. */
export type Row = Record<string, unknown>;

/** Parse a JSON body, tolerating an empty or malformed one. */
export async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await req.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Mongoose returned a CastError for a malformed ObjectId; a bad uuid is the
 *  same "not found" case here, so callers should treat null as 404. */
export function asUuid(v: unknown): string | null {
  const s = String(v ?? "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) ? s : null;
}

export function toInt(v: unknown, fallback = 0): number {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Reshape flat route definitions into a matcher. `:param` segments capture. */
export function match(
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
