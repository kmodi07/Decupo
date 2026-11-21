import { MockLlmProvider } from "./mock";
import type { LlmProvider } from "./provider";

export type { LlmProvider, LlmRequest, LlmResponse, ModelTier } from "./provider";
export { MockLlmProvider, MOCK_NOTICE } from "./mock";

let cached: LlmProvider | undefined;

/**
 * Provider selection. `LLM_PROVIDER=anthropic` is reserved for the adapter
 * tracked as backlog item B-20; until it lands the process refuses to start
 * with that setting rather than silently falling back to the mock.
 */
export function getLlmProvider(): LlmProvider {
  if (cached) return cached;
  const which = process.env.LLM_PROVIDER ?? "mock";
  if (which === "mock") {
    cached = new MockLlmProvider();
    return cached;
  }
  throw new Error(`LLM_PROVIDER=${which} is not wired yet (backlog B-20). Use LLM_PROVIDER=mock.`);
}

export function setLlmProviderForTests(p: LlmProvider | undefined) {
  cached = p;
}

export function llmStatus(): { provider: string; mock: boolean } {
  const p = getLlmProvider();
  return { provider: p.name, mock: p.name === "mock" };
}
