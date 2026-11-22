import { AnthropicLlmProvider } from "./anthropic";
import { MockLlmProvider } from "./mock";
import { OpenAiCompatibleLlmProvider } from "./openai-compatible";
import { LlmError, type LlmProvider } from "./provider";
import { RouterLlmProvider, type RouterStrategy } from "./router";

export type { LlmProvider, LlmRequest, LlmResponse, LlmUsage, LlmStopReason, LlmRouteAttempt, ModelTier } from "./provider";
export { LlmError, toLlmError, isRetryableStatus, approxTokens } from "./provider";
export { MockLlmProvider, MOCK_NOTICE } from "./mock";
export { AnthropicLlmProvider, ANTHROPIC_DEFAULT_MODEL } from "./anthropic";
export { OpenAiCompatibleLlmProvider, OPENAI_DEFAULT_MODEL, XAI_DEFAULT_MODEL, XAI_BASE_URL } from "./openai-compatible";
export { RouterLlmProvider, type RouterStrategy, type RouterOptions } from "./router";

/**
 * `LLM_PROVIDER` values. `mock` is the default and the only one tests use.
 * `router` spreads calls across every real provider that has a key.
 */
export const LLM_PROVIDER_NAMES = ["mock", "anthropic", "openai", "xai", "router"] as const;
export type LlmProviderName = (typeof LLM_PROVIDER_NAMES)[number];

/** Which environment variable holds each real provider's key. */
export const PROVIDER_KEY_ENV: Record<Exclude<LlmProviderName, "mock" | "router">, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  xai: "XAI_API_KEY",
};

const REAL_PROVIDERS = ["anthropic", "openai", "xai"] as const;
type RealProviderName = (typeof REAL_PROVIDERS)[number];

let cached: LlmProvider | undefined;

function selected(): string {
  return (process.env.LLM_PROVIDER ?? "mock").trim().toLowerCase();
}

function hasKey(p: RealProviderName): boolean {
  return Boolean(process.env[PROVIDER_KEY_ENV[p]]?.trim());
}

/**
 * The real providers the router would use, in the order it tries them.
 * `LLM_ROUTER_PROVIDERS=anthropic,openai` narrows and orders the list; by
 * default every provider with a key is included.
 */
export function routerProviderNames(): RealProviderName[] {
  const requested = process.env.LLM_ROUTER_PROVIDERS?.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const candidates = requested?.length ? requested : [...REAL_PROVIDERS];
  const names: RealProviderName[] = [];
  for (const c of candidates) {
    if (!(REAL_PROVIDERS as readonly string[]).includes(c)) throw new LlmError(`LLM_ROUTER_PROVIDERS names an unknown provider: ${c}`, { provider: "router", status: 500, retryable: false });
    if (hasKey(c as RealProviderName)) names.push(c as RealProviderName);
  }
  return names;
}

/**
 * True when `LLM_PROVIDER` points at a real model that has its key. The
 * planner uses this to decide whether model-written steps can be offered;
 * it never constructs a client, so it is safe to call on every request.
 */
export function hasRealLlm(): boolean {
  if (cached) return cached.name !== "mock";
  const which = selected();
  if (which === "mock") return false;
  if (which === "router") return routerProviderNames().length > 0;
  if ((REAL_PROVIDERS as readonly string[]).includes(which)) return hasKey(which as RealProviderName);
  return false;
}

function makeReal(p: RealProviderName): LlmProvider {
  if (p === "anthropic") return new AnthropicLlmProvider();
  return new OpenAiCompatibleLlmProvider(p);
}

function build(): LlmProvider {
  const which = selected();
  if (which === "mock") return new MockLlmProvider();
  if ((REAL_PROVIDERS as readonly string[]).includes(which)) return makeReal(which as RealProviderName);
  if (which === "router") {
    const names = routerProviderNames();
    if (names.length === 0) {
      throw new LlmError(
        `LLM_PROVIDER=router but no provider key is set. Add at least one of ${REAL_PROVIDERS.map((p) => PROVIDER_KEY_ENV[p]).join(", ")} (wrangler secret put / .dev.vars), or set LLM_PROVIDER=mock.`,
        { provider: "router", status: 500, retryable: false },
      );
    }
    const strategy = (process.env.LLM_ROUTER_STRATEGY ?? "round-robin").trim() as RouterStrategy;
    if (strategy !== "round-robin" && strategy !== "least-recently-used") {
      throw new LlmError(`LLM_ROUTER_STRATEGY must be round-robin or least-recently-used, not ${strategy}.`, { provider: "router", status: 500, retryable: false });
    }
    return new RouterLlmProvider(names.map(makeReal), { strategy });
  }
  throw new LlmError(`LLM_PROVIDER=${which} is not a known provider. Use one of ${LLM_PROVIDER_NAMES.join(", ")}.`, { provider: which, status: 500, retryable: false });
}

/** Provider selection, built once per process. Throws a clear LlmError on a misconfiguration (unknown name, missing key). */
export function getLlmProvider(): LlmProvider {
  if (cached) return cached;
  cached = build();
  return cached;
}

export function setLlmProviderForTests(p: LlmProvider | undefined) {
  cached = p;
}

export type LlmStatus = {
  provider: string;
  mock: boolean;
  /** For the router: the providers it spreads calls over. For a single real provider: that provider. */
  providers: string[];
  /** Set when the configuration cannot produce a provider; the process still serves mock-free skills. */
  error?: string;
};

export function llmStatus(): LlmStatus {
  try {
    const p = getLlmProvider();
    const providers = p instanceof RouterLlmProvider ? p.providers() : p.name === "mock" ? [] : [p.name];
    return { provider: p.name, mock: p.name === "mock", providers };
  } catch (err) {
    return { provider: selected(), mock: false, providers: [], error: String((err as Error).message ?? err) };
  }
}
