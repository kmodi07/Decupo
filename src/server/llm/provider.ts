export type ModelTier = "small" | "medium" | "large";

export type LlmRequest = {
  system?: string;
  prompt: string;
  maxTokens?: number;
  /** Smallest suitable model by default (build-prompt constraint). */
  tier?: ModelTier;
};

export type LlmUsage = { inputTokens: number; outputTokens: number };

export type LlmResponse = {
  text: string;
  usage: LlmUsage;
  provider: string;
  model: string;
  /** True when no real model produced this text. Surfaced to users. */
  mock: boolean;
};

export interface LlmProvider {
  readonly name: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export function approxTokens(text: string): number {
  // Rough: 4 chars/token. Used only by the mock and for pre-flight estimates.
  return Math.max(1, Math.ceil(text.length / 4));
}
