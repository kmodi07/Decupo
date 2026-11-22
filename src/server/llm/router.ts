import { LlmError, toLlmError, type LlmProvider, type LlmRequest, type LlmResponse, type LlmRouteAttempt } from "./provider";

export type RouterStrategy = "round-robin" | "least-recently-used";

export type RouterOptions = {
  strategy?: RouterStrategy;
  /** A provider that just failed with a retryable error is skipped for this long, unless every provider is cooling down. */
  cooldownMs?: number;
  /** Injected clock for tests. */
  now?: () => number;
};

export const ROUTER_DEFAULT_COOLDOWN_MS = 30_000;

type Slot = { provider: LlmProvider; lastUsedAt: number; lastFailedAt: number | null; calls: number; failures: number };

/**
 * Spreads calls across several providers and fails over on rate limits,
 * server errors and network failures. Round-robin by default: each call
 * starts one slot further along; least-recently-used starts with the provider
 * that has been idle longest. Either way the remaining providers are tried in
 * order until one answers. A non-retryable error (400, 401, refusal) stops
 * the chain immediately: trying another provider would not help and might
 * hide a configuration mistake.
 */
export class RouterLlmProvider implements LlmProvider {
  readonly name = "router";
  readonly strategy: RouterStrategy;
  private readonly slots: Slot[];
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private cursor = 0;

  constructor(providers: LlmProvider[], opts: RouterOptions = {}) {
    if (providers.length === 0) throw new LlmError("LLM router has no providers configured.", { provider: "router", status: 500, retryable: false });
    const names = new Set<string>();
    for (const p of providers) {
      if (p.name === "router") throw new LlmError("A router cannot contain another router.", { provider: "router", status: 500, retryable: false });
      if (names.has(p.name)) throw new LlmError(`Provider ${p.name} is listed twice in the router.`, { provider: "router", status: 500, retryable: false });
      names.add(p.name);
    }
    this.slots = providers.map((provider) => ({ provider, lastUsedAt: 0, lastFailedAt: null, calls: 0, failures: 0 }));
    this.strategy = opts.strategy ?? "round-robin";
    this.cooldownMs = opts.cooldownMs ?? ROUTER_DEFAULT_COOLDOWN_MS;
    this.now = opts.now ?? Date.now;
  }

  /** Provider names in the order the router would try them for the next call. */
  order(): string[] {
    return this.plan().map((s) => s.provider.name);
  }

  providers(): string[] {
    return this.slots.map((s) => s.provider.name);
  }

  /** Per-provider counters for status pages and tests. */
  stats(): Array<{ provider: string; calls: number; failures: number }> {
    return this.slots.map((s) => ({ provider: s.provider.name, calls: s.calls, failures: s.failures }));
  }

  private plan(): Slot[] {
    const n = this.slots.length;
    let start: number;
    if (this.strategy === "least-recently-used") {
      start = 0;
      for (let i = 1; i < n; i += 1) if (this.slots[i]!.lastUsedAt < this.slots[start]!.lastUsedAt) start = i;
    } else {
      start = this.cursor % n;
    }
    const ordered: Slot[] = [];
    for (let i = 0; i < n; i += 1) ordered.push(this.slots[(start + i) % n]!);
    // Providers still cooling down after a retryable failure go to the back, keeping their relative order.
    const t = this.now();
    const cooling = (s: Slot) => s.lastFailedAt !== null && t - s.lastFailedAt < this.cooldownMs;
    return [...ordered.filter((s) => !cooling(s)), ...ordered.filter(cooling)];
  }

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const plan = this.plan();
    if (this.strategy === "round-robin") this.cursor = (this.cursor + 1) % this.slots.length;
    const attempts: LlmRouteAttempt[] = [];
    let lastError: LlmError | undefined;
    for (const slot of plan) {
      slot.calls += 1;
      slot.lastUsedAt = this.now();
      try {
        const res = await slot.provider.complete(req);
        attempts.push({ provider: slot.provider.name, ok: true });
        return { ...res, provider: res.provider, route: { via: "router", strategy: this.strategy, attempts } };
      } catch (err) {
        const e = toLlmError(err, slot.provider.name);
        slot.failures += 1;
        attempts.push({ provider: slot.provider.name, ok: false, status: e.status, error: e.message });
        lastError = e;
        if (!e.retryable) break;
        slot.lastFailedAt = this.now();
      }
    }
    const tried = attempts.map((a) => `${a.provider}${a.status ? ` (${a.status})` : ""}`).join(", ");
    throw new LlmError(`All LLM providers failed: ${tried}. Last error: ${lastError?.message ?? "unknown"}`, {
      provider: "router",
      status: lastError?.status,
      retryable: lastError?.retryable ?? true,
      cause: lastError,
    });
  }
}
