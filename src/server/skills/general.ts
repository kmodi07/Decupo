import { z } from "zod";
import type { LlmResponse } from "../llm/provider";
import type { Skill, SkillContext } from "./types";

/**
 * The one skill that hands an open-ended goal to a language model. It is only
 * planned when a real provider is configured (see the planner), and whatever
 * the model writes is delivered under a header that says so: model-written,
 * unverified, to be checked before it is relied on. Facts the user gave are
 * passed in as facts; the model is told not to invent any others.
 */

const anyRecord = z.record(z.string(), z.unknown());

export const GENERAL_TASK_MAX_TOKENS = 6_000;

export const MODEL_WRITTEN_NOTICE_TITLE = "Model-written draft, not verified.";

const SYSTEM_PROMPT = [
  "You are Atlas, a careful writer working inside Decupo, a mission engine for small businesses.",
  "Write in English only, in Markdown, with a short title, clear section headings and short paragraphs or lists.",
  "Work only from the goal and the facts the user gave. Never invent facts, figures, prices, statistics, names, quotes, dates or sources.",
  "Where a fact is needed but not given, write [to confirm: what is needed] in its place instead of guessing.",
  "Do not cite sources or claim research: you have no web access and retrieved nothing.",
  "Do not include a notice about being a model; the system adds one.",
  "Be useful and concrete: a reader should be able to act on this today.",
].join(" ");

/** Everything the user said, as a facts list the model may use. */
export function factsFromInput(input: Record<string, unknown>, upstream: Record<string, Record<string, unknown>>): string[] {
  const facts: string[] = [];
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string" && v.trim()) facts.push(`${k}: ${v.trim()}`);
    else if (typeof v === "number" || typeof v === "boolean") facts.push(`${k}: ${String(v)}`);
  }
  for (const [step, out] of Object.entries(upstream)) {
    const summary = typeof out.summary === "string" ? out.summary : null;
    if (summary) facts.push(`earlier step ${step}: ${summary}`);
  }
  return facts;
}

export function buildGeneralPrompt(goal: string, facts: string[]): string {
  return [
    `Goal: ${goal.trim()}`,
    "",
    facts.length ? "Facts given by the user (use these, and only these, as facts):" : "The user gave no facts beyond the goal; mark every needed fact as [to confirm: ...].",
    ...facts.map((f) => `- ${f}`),
    "",
    "Write the deliverable that best serves this goal.",
  ].join("\n");
}

/** The header every model-written artifact carries. Kept as one function so the quality review and tests agree on the wording. */
export function modelWrittenNotice(res: Pick<LlmResponse, "provider" | "model" | "stopReason">): string {
  const lines = [
    `> **${MODEL_WRITTEN_NOTICE_TITLE}** Written by a language model (${res.provider}, ${res.model}) from your goal and answers, with no web research and no retrieved sources.`,
    "> Check every fact, number and name before you rely on it or share it. Items marked [to confirm: ...] are gaps the model did not fill in.",
  ];
  if (res.stopReason === "max_tokens") lines.push("> The model hit its length limit, so this draft ends early.");
  if (res.stopReason === "refusal") lines.push("> The model declined part of this request; the draft may be incomplete.");
  return lines.join("\n");
}

export const generalTask: Skill = {
  manifest: {
    id: "general-task",
    version: "0.1.0",
    name: "General task",
    description: "Answers an open-ended goal with a language model: a plan, a draft, an explanation or a checklist, labelled as model-written and unverified. Only offered when a model provider is configured.",
    agent: "Atlas",
    actionClass: "draft",
    permissionScopes: ["llm:complete", "artifact:write"],
    privacy: "user_content",
    cost: { baseCredits: 40, variableAllowanceCredits: 60, creditsPerThousandTokens: 5 },
    timeoutMs: 180_000,
    maxAttempts: 3,
    availability: "supported",
    inputSchema: anyRecord,
  },
  async run(ctx: SkillContext) {
    if (ctx.llm.name === "mock") {
      return {
        status: "blocked",
        reason: "No language model is configured on this server, so nothing was written and nothing was charged. Set LLM_PROVIDER and a provider key (see docs/LLM_PROVIDERS.md).",
      };
    }
    const facts = factsFromInput(ctx.input, ctx.upstream);
    const prompt = buildGeneralPrompt(ctx.goal, facts);
    const res = await ctx.llm.complete({ system: SYSTEM_PROMPT, prompt, maxTokens: GENERAL_TASK_MAX_TOKENS, tier: "large" });
    const sku = `${res.provider}/${res.model}`;
    await ctx.recordUsage({ provider: res.provider, sku: `${sku}/input`, unit: "tokens", quantity: res.usage.inputTokens });
    await ctx.recordUsage({ provider: res.provider, sku: `${sku}/output`, unit: "tokens", quantity: res.usage.outputTokens });
    const servedBy = res.route ? `${res.provider} via router (${res.route.attempts.map((a) => `${a.provider}${a.ok ? "" : ` failed${a.status ? ` ${a.status}` : ""}`}`).join(", ")})` : res.provider;
    await ctx.log(`Model call served by ${servedBy}`, { provider: res.provider, model: res.model, inputTokens: res.usage.inputTokens, outputTokens: res.usage.outputTokens, route: res.route ?? null });
    const body = res.text.trim() || "_The model returned no text._";
    const content = [modelWrittenNotice(res), "", body, ""].join("\n");
    const artifact = await ctx.writeArtifact({ kind: "markdown", title: "Model-written draft", content });
    return {
      status: "succeeded",
      output: {
        artifactId: artifact.id,
        modelWritten: true,
        provider: res.provider,
        model: res.model,
        route: res.route ?? null,
        inputTokens: res.usage.inputTokens,
        outputTokens: res.usage.outputTokens,
        usageEstimated: res.usage.estimated === true,
        stopReason: res.stopReason ?? "other",
        factsGiven: facts.length,
      },
      summary: `Model-written draft from ${res.provider} (${res.model}); unverified, review before use.`,
    };
  },
};

export const GENERAL_SKILLS: Skill[] = [generalTask];
