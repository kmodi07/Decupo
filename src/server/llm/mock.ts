import { approxTokens, type LlmProvider, type LlmRequest, type LlmResponse } from "./provider";

export const MOCK_NOTICE =
  "> **Offline draft.** No language model or web source was used to produce this. " +
  "Connect a provider to replace it with researched, model-written content.";

/**
 * Deterministic stand-in used when no provider key is configured. It never
 * invents facts, statistics, quotes or sources: it restates the inputs and
 * leaves clearly marked placeholders where real work would go.
 */
export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const prompt = req.prompt.trim();
    const text = [MOCK_NOTICE, "", prompt.length > 0 ? prompt : "(empty prompt)"].join("\n");
    const inputTokens = approxTokens((req.system ?? "") + req.prompt);
    const outputTokens = approxTokens(text);
    return { text, usage: { inputTokens, outputTokens }, provider: this.name, model: `mock-${req.tier ?? "small"}`, mock: true, stopReason: "end" };
  }
}
