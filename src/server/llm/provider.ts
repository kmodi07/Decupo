export type ModelTier = "small" | "medium" | "large";

export type LlmRequest = {
  system?: string;
  prompt: string;
  maxTokens?: number;
  /** Smallest suitable model by default (build-prompt constraint). */
  tier?: ModelTier;
};

export type LlmUsage = {
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from the provider's prompt cache, when reported. Included in inputTokens. */
  cachedInputTokens?: number;
  /** True when the provider did not report usage and the counts are a 4 chars/token estimate. */
  estimated?: boolean;
};

export type LlmStopReason = "end" | "max_tokens" | "refusal" | "other";

/** One attempt the router made, in order; `ok` is true for the attempt that produced the response. */
export type LlmRouteAttempt = { provider: string; ok: boolean; status?: number; error?: string };

export type LlmResponse = {
  text: string;
  usage: LlmUsage;
  /** The provider that produced the text (never "router"). */
  provider: string;
  model: string;
  /** True when no real model produced this text. Surfaced to users. */
  mock: boolean;
  stopReason?: LlmStopReason;
  /** Present when the call went through the router: how the provider was chosen and what was tried. */
  route?: { via: "router"; strategy: string; attempts: LlmRouteAttempt[] };
};

export interface LlmProvider {
  readonly name: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

/**
 * Every provider failure is reported as an LlmError so the router and the
 * skills can decide without knowing which SDK threw. `retryable` is true for
 * rate limits (429), server errors (5xx) and network failures: the router
 * tries the next provider on those and gives up at once on anything else
 * (bad request, bad key, refused content).
 */
export class LlmError extends Error {
  readonly provider: string;
  readonly status: number | undefined;
  readonly retryable: boolean;

  constructor(message: string, opts: { provider: string; status?: number; retryable?: boolean; cause?: unknown }) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = "LlmError";
    this.provider = opts.provider;
    this.status = opts.status;
    this.retryable = opts.retryable ?? isRetryableStatus(opts.status);
  }
}

export function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return true; // network error or timeout: nothing reached the provider
  return status === 429 || status === 408 || status >= 500;
}

/** Wrap an SDK error (Anthropic and OpenAI both expose `status` on their APIError) as an LlmError. */
export function toLlmError(err: unknown, provider: string): LlmError {
  if (err instanceof LlmError) return err;
  const e = err as { status?: unknown; message?: unknown } | null | undefined;
  const status = typeof e?.status === "number" ? e.status : undefined;
  const message = typeof e?.message === "string" && e.message ? e.message : String(err);
  return new LlmError(`${provider}: ${message}`, { provider, status, cause: err });
}

export function approxTokens(text: string): number {
  // Rough: 4 chars/token. Used only by the mock and for pre-flight estimates.
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Default output cap when a skill does not say. Large enough for a long document, small enough to settle in one step. */
export const DEFAULT_MAX_TOKENS = 8_000;
/** Above this many output tokens the providers stream so the HTTP request never idles until a timeout. */
export const STREAM_ABOVE_TOKENS = 4_000;
