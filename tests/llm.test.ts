import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DbHandle } from "@/server/db/client";
import { closeTestDb, makeTenant, makeTestDb } from "./helpers/db";
import {
  AnthropicLlmProvider,
  ANTHROPIC_DEFAULT_MODEL,
  getLlmProvider,
  hasRealLlm,
  LlmError,
  llmStatus,
  MockLlmProvider,
  OpenAiCompatibleLlmProvider,
  OPENAI_DEFAULT_MODEL,
  RouterLlmProvider,
  setLlmProviderForTests,
  toLlmError,
  XAI_DEFAULT_MODEL,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
} from "@/server/llm";
import { fallbackTemplateId, getPlanner } from "@/server/planner/rule-based";
import { generalTask, MODEL_WRITTEN_NOTICE_TITLE } from "@/server/skills/general";
import type { SkillContext } from "@/server/skills/types";
import { authorizeMission, createMission, getMission, listArtifacts, listSteps } from "@/server/missions/service";
import { listEvents } from "@/server/missions/events";
import { drain } from "@/server/worker/runner";
import { getBalance } from "@/server/ledger/service";
import { providerCosts } from "@/server/db/schema";

// Never let a developer's real keys leak into these tests.
const KEY_VARS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "XAI_API_KEY", "LLM_PROVIDER", "LLM_ROUTER_PROVIDERS", "LLM_ROUTER_STRATEGY"] as const;
const saved: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const k of KEY_VARS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterAll(() => {
  for (const k of KEY_VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});
afterEach(() => {
  for (const k of KEY_VARS) delete process.env[k];
  setLlmProviderForTests(undefined);
});

type Fake = LlmProvider & { calls: LlmRequest[] };

/** A provider that answers with its name, or throws what `fail` returns for that call. */
function fake(name: string, fail?: (callIndex: number) => Error | undefined, usage = { inputTokens: 1200, outputTokens: 800 }): Fake {
  const calls: LlmRequest[] = [];
  return {
    name,
    calls,
    async complete(req) {
      const idx = calls.length;
      calls.push(req);
      const err = fail?.(idx);
      if (err) throw err;
      const res: LlmResponse = { text: `# Answer from ${name}\n\nFor: ${req.prompt.split("\n")[0]}`, usage, provider: name, model: `${name}-model`, mock: false, stopReason: "end" };
      return res;
    },
  };
}

const status = (provider: string, code: number) => new LlmError(`${provider} said ${code}`, { provider, status: code });

describe("router: rotation", () => {
  it("round-robin starts one provider further along on every call and reports who served it", async () => {
    const a = fake("a");
    const b = fake("b");
    const c = fake("c");
    const router = new RouterLlmProvider([a, b, c]);
    const served: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await router.complete({ prompt: `call ${i}` });
      served.push(res.provider);
      expect(res.route).toEqual({ via: "router", strategy: "round-robin", attempts: [{ provider: res.provider, ok: true }] });
      expect(res.model).toBe(`${res.provider}-model`);
      expect(res.usage).toEqual({ inputTokens: 1200, outputTokens: 800 });
    }
    expect(served).toEqual(["a", "b", "c", "a"]);
    expect(router.stats()).toEqual([
      { provider: "a", calls: 2, failures: 0 },
      { provider: "b", calls: 1, failures: 0 },
      { provider: "c", calls: 1, failures: 0 },
    ]);
  });

  it("least-recently-used starts with the provider idle the longest", async () => {
    let t = 1_000;
    const now = () => (t += 1);
    const a = fake("a");
    const b = fake("b");
    const c = fake("c");
    const router = new RouterLlmProvider([a, b, c], { strategy: "least-recently-used", now });
    const served: string[] = [];
    for (let i = 0; i < 5; i += 1) served.push((await router.complete({ prompt: "x" })).provider);
    expect(served).toEqual(["a", "b", "c", "a", "b"]);
    expect(router.order()[0]).toBe("c");
  });

  it("refuses an empty pool, a nested router and duplicate names", () => {
    expect(() => new RouterLlmProvider([])).toThrow(/no providers/);
    expect(() => new RouterLlmProvider([fake("a"), fake("a")])).toThrow(/listed twice/);
    expect(() => new RouterLlmProvider([new RouterLlmProvider([fake("a")])])).toThrow(/cannot contain another router/);
  });
});

describe("router: failover", () => {
  it("moves to the next provider on 429 and 5xx, records every attempt, and rests the failed provider", async () => {
    let t = 0;
    const now = () => t;
    const a = fake("a", (i) => (i === 0 ? status("a", 429) : undefined));
    const b = fake("b", (i) => (i === 0 ? status("b", 503) : undefined));
    const c = fake("c");
    const router = new RouterLlmProvider([a, b, c], { cooldownMs: 30_000, now });

    const first = await router.complete({ prompt: "x" });
    expect(first.provider).toBe("c");
    expect(first.route?.attempts).toEqual([
      { provider: "a", ok: false, status: 429, error: "a said 429" },
      { provider: "b", ok: false, status: 503, error: "b said 503" },
      { provider: "c", ok: true },
    ]);

    // Cursor is now at b, but a and b are cooling down: c answers again, with no failed attempts.
    t = 10_000;
    const second = await router.complete({ prompt: "y" });
    expect(second.provider).toBe("c");
    expect(second.route?.attempts).toEqual([{ provider: "c", ok: true }]);
    expect(router.order()).toEqual(["c", "a", "b"]);

    // After the cooldown the rotation resumes and a and b (now healthy) take calls again.
    t = 50_000;
    expect(router.order()[0]).toBe("c"); // cursor 2
    expect((await router.complete({ prompt: "z" })).provider).toBe("c");
    expect((await router.complete({ prompt: "z" })).provider).toBe("a");
    expect((await router.complete({ prompt: "z" })).provider).toBe("b");
    expect(router.stats().map((s) => s.failures)).toEqual([1, 1, 0]);
  });

  it("falls back to a cooling provider when every provider is cooling down", async () => {
    let t = 0;
    const a = fake("a", (i) => (i === 0 ? status("a", 500) : undefined));
    const b = fake("b", (i) => (i === 0 ? status("b", 502) : undefined));
    const router = new RouterLlmProvider([a, b], { now: () => t });
    await expect(router.complete({ prompt: "x" })).rejects.toMatchObject({ name: "LlmError", provider: "router", retryable: true, status: 502 });
    t = 1;
    const res = await router.complete({ prompt: "x" });
    expect(res.provider).toBe("b"); // cursor moved on; both cooling, order kept
    expect(res.route?.attempts).toEqual([{ provider: "b", ok: true }]);
  });

  it("stops at once on a non-retryable error and never calls the next provider", async () => {
    const a = fake("a", () => status("a", 400));
    const b = fake("b");
    const router = new RouterLlmProvider([a, b]);
    await expect(router.complete({ prompt: "x" })).rejects.toMatchObject({ name: "LlmError", status: 400, retryable: false });
    expect(b.calls).toHaveLength(0);
  });

  it("names every provider it tried when all of them fail", async () => {
    const a = fake("a", () => status("a", 529));
    const b = fake("b", () => new Error("socket hang up")); // network error: no status, retryable
    const router = new RouterLlmProvider([a, b]);
    const err = await router.complete({ prompt: "x" }).then(
      () => null,
      (e: unknown) => e as LlmError,
    );
    expect(err).toBeInstanceOf(LlmError);
    expect(err!.message).toMatch(/All LLM providers failed: a \(529\), b\. Last error: b: socket hang up/);
    expect(err!.retryable).toBe(true);
  });

  it("wraps SDK-shaped errors (status field) and treats missing status as a network failure", () => {
    expect(toLlmError({ status: 429, message: "rate limited" }, "openai")).toMatchObject({ provider: "openai", status: 429, retryable: true, message: "openai: rate limited" });
    expect(toLlmError({ status: 401, message: "bad key" }, "xai")).toMatchObject({ status: 401, retryable: false });
    expect(toLlmError(new TypeError("fetch failed"), "anthropic")).toMatchObject({ status: undefined, retryable: true });
  });
});

describe("provider selection and keys", () => {
  it("each real provider refuses to start without its key and names the secret to set", () => {
    expect(() => new AnthropicLlmProvider()).toThrow(/ANTHROPIC_API_KEY is not set.*wrangler secret put ANTHROPIC_API_KEY/);
    expect(() => new OpenAiCompatibleLlmProvider("openai")).toThrow(/OPENAI_API_KEY is not set.*platform\.openai\.com/);
    expect(() => new OpenAiCompatibleLlmProvider("xai")).toThrow(/XAI_API_KEY is not set.*console\.x\.ai/);
  });

  it("uses the documented default models and accepts overrides (no request is made on construction)", () => {
    expect(new AnthropicLlmProvider({ apiKey: "test-key-never-sent" }).model).toBe(ANTHROPIC_DEFAULT_MODEL);
    expect(ANTHROPIC_DEFAULT_MODEL).toBe("claude-opus-5-5");
    expect(new OpenAiCompatibleLlmProvider("openai", { apiKey: "k" }).model).toBe(OPENAI_DEFAULT_MODEL);
    expect(new OpenAiCompatibleLlmProvider("xai", { apiKey: "k" }).model).toBe(XAI_DEFAULT_MODEL);
    process.env.XAI_MODEL = "grok-test";
    expect(new OpenAiCompatibleLlmProvider("xai", { apiKey: "k" }).model).toBe("grok-test");
    delete process.env.XAI_MODEL;
  });

  it("LLM_PROVIDER unset or mock keeps the mock, and nothing is considered configured", () => {
    expect(getLlmProvider()).toBeInstanceOf(MockLlmProvider);
    expect(hasRealLlm()).toBe(false);
    expect(llmStatus()).toEqual({ provider: "mock", mock: true, providers: [] });
    setLlmProviderForTests(undefined);
    process.env.LLM_PROVIDER = "mock";
    expect(getLlmProvider().name).toBe("mock");
  });

  it("router with no keys is a clear configuration error, surfaced by llmStatus without throwing", () => {
    process.env.LLM_PROVIDER = "router";
    expect(hasRealLlm()).toBe(false);
    expect(() => getLlmProvider()).toThrow(/LLM_PROVIDER=router but no provider key is set.*ANTHROPIC_API_KEY, OPENAI_API_KEY, XAI_API_KEY/);
    expect(llmStatus()).toMatchObject({ provider: "router", mock: false, providers: [], error: expect.stringMatching(/no provider key/) });
  });

  it("router includes only the providers that have keys, in the requested order", () => {
    process.env.LLM_PROVIDER = "router";
    process.env.ANTHROPIC_API_KEY = "a";
    process.env.XAI_API_KEY = "x";
    expect(hasRealLlm()).toBe(true);
    const p = getLlmProvider();
    expect(p).toBeInstanceOf(RouterLlmProvider);
    expect((p as RouterLlmProvider).providers()).toEqual(["anthropic", "xai"]);
    expect(llmStatus()).toEqual({ provider: "router", mock: false, providers: ["anthropic", "xai"] });

    setLlmProviderForTests(undefined);
    process.env.LLM_ROUTER_PROVIDERS = "xai,openai,anthropic";
    process.env.LLM_ROUTER_STRATEGY = "least-recently-used";
    const q = getLlmProvider() as RouterLlmProvider;
    expect(q.providers()).toEqual(["xai", "anthropic"]);
    expect(q.strategy).toBe("least-recently-used");

    setLlmProviderForTests(undefined);
    process.env.LLM_ROUTER_PROVIDERS = "gemini";
    expect(() => getLlmProvider()).toThrow(/unknown provider: gemini/);
  });

  it("a single real provider needs its own key, and unknown names are rejected", () => {
    process.env.LLM_PROVIDER = "openai";
    expect(hasRealLlm()).toBe(false);
    expect(() => getLlmProvider()).toThrow(/OPENAI_API_KEY is not set/);
    setLlmProviderForTests(undefined);
    process.env.OPENAI_API_KEY = "k";
    expect(hasRealLlm()).toBe(true);
    expect(getLlmProvider().name).toBe("openai");
    setLlmProviderForTests(undefined);
    process.env.LLM_PROVIDER = "gemini";
    expect(() => getLlmProvider()).toThrow(/not a known provider/);
  });
});

describe("planner and the general-task skill", () => {
  const GOAL = "Write a checklist for opening a second branch of my pharmacy in Surat";

  it("falls back to the research memo on the mock and to general-task only when a real provider is configured", async () => {
    expect(fallbackTemplateId()).toBe("research");
    const offline = await getPlanner().plan({ goal: GOAL });
    expect(offline.templateId).toBe("research");
    expect(offline.steps.map((s) => s.skillId)).toEqual(["research-memo", "qa-review"]);

    process.env.LLM_PROVIDER = "router";
    expect(fallbackTemplateId()).toBe("research"); // router selected but no key: still offline
    process.env.ANTHROPIC_API_KEY = "test-key-never-sent";
    expect(fallbackTemplateId()).toBe("general");
    const online = await getPlanner().plan({ goal: GOAL });
    expect(online.templateId).toBe("general");
    expect(online.steps.map((s) => s.skillId)).toEqual(["general-task", "qa-review"]);
    expect(online.steps[0]).toMatchObject({ agent: "Atlas", actionClass: "draft", requiresApproval: false, estimatedCredits: 100 });
    expect(online.caveats[0]).toMatch(/written by a language model/);
    expect(online.capabilities.map((c) => c.status)).toEqual(["supported", "not_available"]);

    // Recognised goals keep their templates whatever the provider.
    expect((await getPlanner().plan({ goal: "Build a website for my bakery" })).templateId).toBe("website");
  });

  it("general-task is blocked, not faked, when the provider is the mock", async () => {
    const writes: string[] = [];
    const ctx = {
      llm: new MockLlmProvider(),
      goal: GOAL,
      input: {},
      upstream: {},
      async writeArtifact() {
        writes.push("artifact");
        throw new Error("should not write");
      },
    } as unknown as SkillContext;
    const r = await generalTask.run(ctx);
    expect(r.status).toBe("blocked");
    if (r.status === "blocked") expect(r.reason).toMatch(/No language model is configured/);
    expect(writes).toEqual([]);
  });

  describe("mission with a fake provider behind the router", () => {
    let h: DbHandle;
    beforeAll(async () => {
      h = await makeTestDb();
    });
    afterAll(async () => closeTestDb(h));

    it("plans general-task, writes a labelled artifact, records usage, settles token credits and gets flagged by qa-review", async () => {
      process.env.LLM_PROVIDER = "router";
      process.env.ANTHROPIC_API_KEY = "test-key-never-sent";
      const a = fake("fake-a", () => status("fake-a", 429));
      const b = fake("fake-b");
      setLlmProviderForTests(new RouterLlmProvider([a, b]));

      const t = await makeTenant(h, { credits: 500 });
      const { mission, plan } = await createMission(h.db, t.ctx, { goal: GOAL, answers: { focus: "licences and staffing" } });
      expect(plan.templateId).toBe("general");
      expect(mission.estimateCredits).toBe(100 + 20);
      await authorizeMission(h.db, t.ctx, mission.id);
      await drain(h.db);

      const done = await getMission(h.db, t.ctx, mission.id);
      expect(done.status).toBe("completed");
      const steps = await listSteps(h.db, t.ctx, mission.id);
      expect(steps.map((s) => s.status)).toEqual(["succeeded", "succeeded"]);
      const general = steps[0]!;
      // 40 base + ceil(2000 tokens / 1000 * 5) = 50 credits.
      expect(general.actualCredits).toBe(50);
      expect(general.output).toMatchObject({ modelWritten: true, provider: "fake-b", model: "fake-b-model", inputTokens: 1200, outputTokens: 800, stopReason: "end", factsGiven: 1 });
      expect((general.output as { route: { attempts: unknown[] } }).route.attempts).toEqual([
        { provider: "fake-a", ok: false, status: 429, error: "fake-a said 429" },
        { provider: "fake-b", ok: true },
      ]);
      expect(b.calls[0]!.system).toMatch(/English only/);
      expect(b.calls[0]!.prompt).toContain("Goal: Write a checklist");
      expect(b.calls[0]!.prompt).toContain("- focus: licences and staffing");

      const arts = await listArtifacts(h.db, t.ctx, mission.id);
      expect(arts.map((x) => x.title)).toEqual(["Model-written draft", "Quality review"]);
      expect(arts[0]!.contentText).toContain(MODEL_WRITTEN_NOTICE_TITLE);
      expect(arts[0]!.contentText).toContain("(fake-b, fake-b-model)");
      expect(arts[0]!.contentText).toContain("# Answer from fake-b");
      expect(arts[1]!.contentText).toContain("needs_work");
      expect(arts[1]!.contentText).toMatch(/general-task was written by a language model by fake-b \(fake-b-model\) and has not been verified/);

      const costs = await h.db.select().from(providerCosts).where(eq(providerCosts.stepId, general.id));
      expect(costs.map((c) => [c.provider, c.sku, c.unit, c.quantity]).sort()).toEqual([
        ["fake-b", "fake-b/fake-b-model/input", "tokens", 1200],
        ["fake-b", "fake-b/fake-b-model/output", "tokens", 800],
      ]);

      const events = await listEvents(h.db, t.org.id, mission.id);
      const log = events.find((e) => e.type === "step.log");
      expect((log?.payload as { message: string }).message).toBe("Model call served by fake-b via router (fake-a failed 429, fake-b)");

      const bal = await getBalance(h.db, t.org.id);
      expect(bal.reserved).toBe(0);
      expect(bal.balance).toBe(500 - 50 - 20);
    });

    it("a draft the model cut short is flagged by the quality review", async () => {
      process.env.LLM_PROVIDER = "anthropic";
      process.env.ANTHROPIC_API_KEY = "test-key-never-sent";
      const truncated: LlmProvider = {
        name: "fake-trunc",
        async complete() {
          return { text: "# Half a plan", usage: { inputTokens: 10, outputTokens: 6000, estimated: true }, provider: "fake-trunc", model: "m", mock: false, stopReason: "max_tokens" };
        },
      };
      setLlmProviderForTests(truncated);
      const t = await makeTenant(h, { credits: 500 });
      const { mission } = await createMission(h.db, t.ctx, { goal: GOAL });
      await authorizeMission(h.db, t.ctx, mission.id);
      await drain(h.db);
      const arts = await listArtifacts(h.db, t.ctx, mission.id);
      expect(arts[0]!.contentText).toContain("hit its length limit");
      expect(arts[1]!.contentText).toMatch(/cut off at the model's length limit/);
      expect(arts[1]!.contentText).toMatch(/did not report token usage/);
      // 40 + ceil(6010/1000*5) = 71, within the 100-credit estimate.
      expect((await listSteps(h.db, t.ctx, mission.id))[0]!.actualCredits).toBe(71);
    });
  });
});
