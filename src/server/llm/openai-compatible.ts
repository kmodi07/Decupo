import OpenAI from "openai";
import { approxTokens, DEFAULT_MAX_TOKENS, STREAM_ABOVE_TOKENS, toLlmError, LlmError, type LlmProvider, type LlmRequest, type LlmResponse, type LlmStopReason } from "./provider";

export const OPENAI_DEFAULT_MODEL = "gpt-5.1";
export const XAI_DEFAULT_MODEL = "grok-4";
export const XAI_BASE_URL = "https://api.x.ai/v1";

export type OpenAiCompatibleVendor = "openai" | "xai";

type Vendor = {
  name: OpenAiCompatibleVendor;
  keyEnv: string;
  modelEnv: string;
  defaultModel: string;
  baseURL?: string;
  /** OpenAI rejects `max_tokens` on current models; xAI documents `max_tokens`. */
  maxTokensParam: "max_completion_tokens" | "max_tokens";
  help: string;
};

const VENDORS: Record<OpenAiCompatibleVendor, Vendor> = {
  openai: {
    name: "openai",
    keyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: OPENAI_DEFAULT_MODEL,
    maxTokensParam: "max_completion_tokens",
    help: "Create a platform key at platform.openai.com/api-keys (a ChatGPT subscription does not include one)",
  },
  xai: {
    name: "xai",
    keyEnv: "XAI_API_KEY",
    modelEnv: "XAI_MODEL",
    defaultModel: XAI_DEFAULT_MODEL,
    baseURL: XAI_BASE_URL,
    maxTokensParam: "max_tokens",
    help: "Create an API key at console.x.ai (a Grok subscription does not include one)",
  },
};

type BaseParams = Omit<OpenAI.ChatCompletionCreateParamsNonStreaming, "stream">;

function stopReason(r: string | null | undefined): LlmStopReason {
  if (r === "stop") return "end";
  if (r === "length") return "max_tokens";
  if (r === "content_filter") return "refusal";
  return "other";
}

/**
 * Chat Completions through the official OpenAI SDK, pointed at OpenAI or at
 * xAI's OpenAI-compatible endpoint. Streams with usage in the final chunk
 * when the output cap is large; falls back to an estimate if the endpoint
 * omits usage, and says so in the response.
 */
export class OpenAiCompatibleLlmProvider implements LlmProvider {
  readonly name: string;
  readonly model: string;
  private readonly client: OpenAI;
  private readonly vendor: Vendor;

  constructor(vendor: OpenAiCompatibleVendor, opts: { apiKey?: string; model?: string; baseURL?: string } = {}) {
    this.vendor = VENDORS[vendor];
    this.name = this.vendor.name;
    const apiKey = opts.apiKey ?? process.env[this.vendor.keyEnv];
    if (!apiKey) {
      throw new LlmError(`${this.vendor.keyEnv} is not set. ${this.vendor.help} and set it with \`npx wrangler secret put ${this.vendor.keyEnv}\` (or in .dev.vars locally).`, {
        provider: this.name,
        status: 401,
        retryable: false,
      });
    }
    this.model = opts.model ?? process.env[this.vendor.modelEnv] ?? this.vendor.defaultModel;
    const baseURL = opts.baseURL ?? (vendor === "xai" ? (process.env.XAI_BASE_URL ?? this.vendor.baseURL) : undefined);
    this.client = new OpenAI({ apiKey, baseURL, maxRetries: 1 });
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const maxTokens = req.maxTokens ?? DEFAULT_MAX_TOKENS;
    const messages: OpenAI.ChatCompletionMessageParam[] = [];
    if (req.system) messages.push({ role: "system", content: req.system });
    messages.push({ role: "user", content: req.prompt });
    const base: BaseParams = { model: this.model, messages, [this.vendor.maxTokensParam]: maxTokens };
    try {
      if (maxTokens > STREAM_ABOVE_TOKENS) return await this.streamed(base, req);
      const res = await this.client.chat.completions.create({ ...base, stream: false });
      const choice = res.choices[0];
      return this.shape(choice?.message?.content ?? "", res.model, res.usage ?? null, stopReason(choice?.finish_reason), req);
    } catch (err) {
      throw toLlmError(err, this.name);
    }
  }

  private async streamed(base: BaseParams, req: LlmRequest): Promise<LlmResponse> {
    const stream = await this.client.chat.completions.create({ ...base, stream: true, stream_options: { include_usage: true } });
    let text = "";
    let model = this.model;
    let usage: OpenAI.CompletionUsage | null = null;
    let finish: string | null | undefined;
    for await (const chunk of stream) {
      model = chunk.model || model;
      const c = chunk.choices[0];
      if (c?.delta?.content) text += c.delta.content;
      if (c?.finish_reason) finish = c.finish_reason;
      if (chunk.usage) usage = chunk.usage;
    }
    return this.shape(text, model, usage, stopReason(finish), req);
  }

  private shape(text: string, model: string, usage: OpenAI.CompletionUsage | null, stop: LlmStopReason, req: LlmRequest): LlmResponse {
    const estimated = !usage;
    const inputTokens = usage?.prompt_tokens ?? approxTokens((req.system ?? "") + req.prompt);
    const outputTokens = usage?.completion_tokens ?? approxTokens(text);
    const cachedInputTokens = usage?.prompt_tokens_details?.cached_tokens ?? 0;
    return {
      text,
      usage: { inputTokens, outputTokens, cachedInputTokens, ...(estimated ? { estimated: true } : {}) },
      provider: this.name,
      model,
      mock: false,
      stopReason: stop,
    };
  }
}
