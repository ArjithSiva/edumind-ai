/**
 * Pluggable AI provider layer, ported from server/src/services/ai.js.
 *
 * One function -- complete({ prompt, system, json, model }) -- talks to
 * whichever provider AI_PROVIDER names. If no key is configured, or the call
 * fails, it throws AIUnavailable; callers catch that and serve deterministic
 * fallback content, so the app never shows a dead screen.
 */

export class AIUnavailable extends Error {
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

export function activeProvider(): string {
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
export const AVAILABLE_MODELS = [
  { id: "qwen/qwen3.8-27b", label: "Qwen 3.8 27B", note: "Qwen — default, satisfies the track requirement" },
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", note: "Strongest non-Qwen option — rate-limit escape hatch" },
  { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B", note: "Not Qwen — fastest option" },
];

export function isValidModelOverride(id: unknown): boolean {
  return activeProvider() === "groq" &&
    typeof id === "string" &&
    AVAILABLE_MODELS.some((m) => m.id === id);
}

/** Reads X-AI-Model and returns it only if it is one of AVAILABLE_MODELS --
 *  never hands an arbitrary client-supplied string to the provider. */
export function modelFromRequest(req: Request): string | undefined {
  const requested = req.headers.get("x-ai-model");
  return isValidModelOverride(requested) ? (requested as string) : undefined;
}

/** The actual model id in use, shown in /api/health and Settings. */
export function activeModel(override?: string): string {
  const p = activeProvider();
  if (p === "groq") {
    if (override && isValidModelOverride(override)) return override;
    return Deno.env.get("GROQ_MODEL") || "qwen/qwen3.8-27b";
  }
  if (p === "gemini") return Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";
  if (p === "openrouter") return Deno.env.get("OPENROUTER_MODEL") || "meta-llama/llama-3.3-70b-instruct:free";
  return "unknown";
}

export function isQwen(override?: string): boolean {
  return /qwen/i.test(activeModel(override));
}

export function aiConfigured(): boolean {
  const p = activeProvider();
  if (p === "groq") return Boolean(Deno.env.get("GROQ_API_KEY"));
  if (p === "gemini") return Boolean(Deno.env.get("GEMINI_API_KEY"));
  if (p === "openrouter") return Boolean(Deno.env.get("OPENROUTER_API_KEY"));
  return false;
}

/** True when AI_PROVIDER names a provider this layer actually implements. */
export function hasProvider(name: string): boolean {
  return Boolean(providers[name]);
}

/** The env var a provider's key is read from, for actionable error copy. */
export function keyEnvVarFor(provider: string): string {
  if (provider === "groq") return "GROQ_API_KEY";
  if (provider === "gemini") return "GEMINI_API_KEY";
  if (provider === "openrouter") return "OPENROUTER_API_KEY";
  return "the provider's API key";
}

export async function complete(opts: CompleteOpts): Promise<string> {
  const name = activeProvider();
  const fn = providers[name];
  if (!fn) throw new AIUnavailable(`Unknown AI_PROVIDER "${name}"`);
  return fn(opts);
}

/** Ask for JSON and parse it defensively; models sometimes wrap output in
 *  markdown fences or add a sentence of preamble. */
export async function completeJSON(opts: CompleteOpts): Promise<unknown> {
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
