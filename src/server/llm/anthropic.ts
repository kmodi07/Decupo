import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MAX_TOKENS, STREAM_ABOVE_TOKENS, toLlmError, LlmError, type LlmProvider, type LlmRequest, type LlmResponse, type LlmStopReason, type ModelTier } from "./provider";

export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5";

/** Adaptive thinking is always on for this model family; the tier picks how hard it thinks. */
const EFFORT: Record<ModelTier, "low" | "medium" | "high"> = { small: "low", medium: "medium", large: "high" };

function stopReason(r: Anthropic.Message["stop_reason"]): LlmStopReason {
  if (r === "end_turn" || r === "stop_sequence") return "end";
  if (r === "max_tokens") return "max_tokens";
  if (r === "refusal") return "refusal";
  return "other";
}

/**
 * Anthropic through the official SDK. One user turn in, text out; adaptive
 * thinking with the effort chosen by the requested tier; streamed when the
 * output cap is large so a long document never trips the request timeout.
 */
export class AnthropicLlmProvider implements LlmProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly client: Anthropic;

  constructor(opts: { apiKey?: string; model?: string; baseURL?: string } = {}) {
    const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new LlmError(
        "ANTHROPIC_API_KEY is not set. Create a key at platform.claude.com and set it with `npx wrangler secret put ANTHROPIC_API_KEY` (or in .dev.vars locally).",
        { provider: "anthropic", status: 401, retryable: false },
      );
    }
    this.model = opts.model ?? process.env.ANTHROPIC_MODEL ?? ANTHROPIC_DEFAULT_MODEL;
    // The router owns failover, so the SDK retries once at most.
    this.client = new Anthropic({ apiKey, baseURL: opts.baseURL, maxRetries: 1 });
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const maxTokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: maxTokens,
      system: req.system,
      messages: [{ role: "user", content: req.prompt }],
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT[req.tier ?? "small"] },
    };
    let msg: Anthropic.Message;
    try {
      msg = maxTokens > STREAM_ABOVE_TOKENS ? await this.client.messages.stream(params).finalMessage() : await this.client.messages.create(params);
    } catch (err) {
      throw toLlmError(err, this.name);
    }
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const cached = (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0);
    return {
      text,
      usage: { inputTokens: msg.usage.input_tokens + cached, outputTokens: msg.usage.output_tokens, cachedInputTokens: msg.usage.cache_read_input_tokens ?? 0 },
      provider: this.name,
      model: msg.model,
      mock: false,
      stopReason: stopReason(msg.stop_reason),
    };
  }
}
