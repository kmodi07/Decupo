import { z } from "zod";
import { SALES_SKILLS } from "./sales";
import { SOCIAL_SKILLS } from "./social";
import { siteBuild } from "./site-build";
import { siteCheck } from "./site-check";
import type { Skill, SkillContext } from "./types";

/** Shared helper: ask the LLM once per step and meter the usage. */
async function draft(ctx: SkillContext, key: string, system: string, prompt: string) {
  const res = await ctx.once(key, "llm.complete", () => ctx.llm.complete({ system, prompt, tier: "small" }));
  await ctx.recordUsage({ provider: res.provider, sku: `${res.model}:input`, unit: "tokens", quantity: res.usage.inputTokens });
  await ctx.recordUsage({ provider: res.provider, sku: `${res.model}:output`, unit: "tokens", quantity: res.usage.outputTokens });
  return res;
}

const anyRecord = z.record(z.string(), z.unknown());

export const brandBrief: Skill = {
  manifest: {
    id: "brand-brief",
    version: "0.1.0",
    name: "Brand brief",
    description: "Positioning, audience, voice and naming directions from the goal. Names are suggestions and are not cleared.",
    agent: "Nova",
    actionClass: "draft",
    permissionScopes: ["llm:complete", "artifact:write"],
    privacy: "user_content",
    cost: { baseCredits: 40, variableAllowanceCredits: 10, creditsPerThousandTokens: 1 },
    timeoutMs: 60_000,
    maxAttempts: 3,
    availability: "supported",
    inputSchema: anyRecord,
  },
  async run(ctx) {
    const res = await draft(
      ctx,
      "brief",
      "You are Nova, a brand strategist. Produce a concise brand brief in Markdown with sections: Positioning, Audience, Voice, Naming directions (mark all names as uncleared suggestions), Visual direction.",
      `Goal: ${ctx.goal}\nAudience hints: ${String(ctx.input.audience ?? "not provided")}\nTone hints: ${String(ctx.input.tone ?? "not provided")}`,
    );
    const artifact = await ctx.writeArtifact({ kind: "markdown", title: "Brand brief", content: `# Brand brief\n\n${res.text}` });
    return {
      status: "succeeded",
      output: { artifactId: artifact.id, mock: res.mock },
      summary: res.mock ? "Brand brief drafted offline (placeholder content)." : "Brand brief drafted.",
    };
  },
};

export const researchMemo: Skill = {
  manifest: {
    id: "research-memo",
    version: "0.1.0",
    name: "Research memo",
    description: "Structured memo on the goal. Sources are listed only when actually retrieved; otherwise the memo says so.",
    agent: "Scout",
    actionClass: "read",
    permissionScopes: ["llm:complete", "artifact:write"],
    privacy: "user_content",
    cost: { baseCredits: 60, variableAllowanceCredits: 10, creditsPerThousandTokens: 1 },
    timeoutMs: 90_000,
    maxAttempts: 3,
    availability: "supported",
    inputSchema: anyRecord,
  },
  async run(ctx) {
    const res = await draft(
      ctx,
      "memo",
      "You are Scout, a research analyst. Write a Markdown memo with sections: Question, What we know, Open questions, Sources. Never invent sources; if none were retrieved, write 'No sources retrieved'.",
      `Research goal: ${ctx.goal}\nFocus: ${String(ctx.input.focus ?? "general")}`,
    );
    const sources = res.mock ? "\n\n## Sources\n\nNo sources retrieved (offline mode). Nothing above should be cited." : "";
    const artifact = await ctx.writeArtifact({ kind: "markdown", title: "Research memo", content: `# Research memo\n\n${res.text}${sources}` });
    return {
      status: "succeeded",
      output: { artifactId: artifact.id, sourcesRetrieved: 0, mock: res.mock },
      summary: res.mock ? "Memo outline produced offline; no sources retrieved." : "Research memo written.",
    };
  },
};

export const siteOutline: Skill = {
  manifest: {
    id: "site-outline",
    version: "0.1.0",
    name: "Website outline",
    description: "Sitemap and per-page content outline derived from the brand brief. The site-build step turns it into code.",
    agent: "Forge",
    actionClass: "generate",
    permissionScopes: ["llm:complete", "artifact:write", "artifact:read"],
    privacy: "user_content",
    cost: { baseCredits: 80, variableAllowanceCredits: 10, creditsPerThousandTokens: 1 },
    timeoutMs: 90_000,
    maxAttempts: 3,
    availability: "supported",
    inputSchema: anyRecord,
  },
  async run(ctx) {
    const pages = ["Home", "About", "Services", "Pricing", "Contact"];
    const sitemap = { pages: pages.map((p) => ({ title: p, path: p === "Home" ? "/" : `/${p.toLowerCase()}` })) };
    const res = await draft(
      ctx,
      "outline",
      "You are Forge. For each page in the sitemap, outline sections and the single call to action. Markdown.",
      `Goal: ${ctx.goal}\nSitemap: ${JSON.stringify(sitemap)}\nUpstream brief available: ${ctx.upstream["brand-brief"] ? "yes" : "no"}`,
    );
    const a1 = await ctx.writeArtifact({ kind: "json", title: "Sitemap", content: JSON.stringify(sitemap, null, 2) });
    const a2 = await ctx.writeArtifact({ kind: "markdown", title: "Page outlines", content: `# Page outlines\n\n${res.text}` });
    return {
      status: "succeeded",
      output: { sitemap, sitemapArtifactId: a1.id, outlineArtifactId: a2.id, pageCount: pages.length, mock: res.mock },
      summary: `Sitemap with ${pages.length} pages and outlines produced.`,
    };
  },
};

export const deckOutline: Skill = {
  manifest: {
    id: "deck-outline",
    version: "0.1.0",
    name: "Presentation outline",
    description: "Slide-by-slide outline from the research memo. Export to an editable deck is Phase 2.",
    agent: "Atlas",
    actionClass: "generate",
    permissionScopes: ["llm:complete", "artifact:write", "artifact:read"],
    privacy: "user_content",
    cost: { baseCredits: 60, variableAllowanceCredits: 10, creditsPerThousandTokens: 1 },
    timeoutMs: 90_000,
    maxAttempts: 3,
    availability: "supported",
    inputSchema: anyRecord,
  },
  async run(ctx) {
    const res = await draft(
      ctx,
      "deck",
      "You are Atlas. Produce a 10-slide outline in Markdown: title, 3 bullets and a speaker note per slide. Mark any claim that would need a citation with [citation needed].",
      `Topic: ${ctx.goal}\nMemo available: ${ctx.upstream["research-memo"] ? "yes" : "no"}`,
    );
    const artifact = await ctx.writeArtifact({ kind: "markdown", title: "Deck outline", content: `# Deck outline\n\n${res.text}` });
    return { status: "succeeded", output: { artifactId: artifact.id, slideCount: 10, mock: res.mock }, summary: "Deck outline produced." };
  },
};

export const qaReview: Skill = {
  manifest: {
    id: "qa-review",
    version: "0.1.0",
    name: "Quality review",
    description: "Independent checklist over upstream outputs: placeholders, uncited claims, missing sections. Flags, never silently fixes.",
    agent: "Vale",
    actionClass: "read",
    permissionScopes: ["artifact:read", "artifact:write"],
    privacy: "internal",
    cost: { baseCredits: 20, variableAllowanceCredits: 0, creditsPerThousandTokens: 0 },
    timeoutMs: 30_000,
    maxAttempts: 2,
    availability: "supported",
    inputSchema: anyRecord,
  },
  async run(ctx) {
    const upstreamKeys = Object.keys(ctx.upstream);
    const mockUpstream = upstreamKeys.filter((k) => ctx.upstream[k]?.mock === true);
    const findings: string[] = [];
    if (upstreamKeys.length === 0) findings.push("No upstream outputs to review.");
    if (mockUpstream.length) findings.push(`Offline placeholder content in: ${mockUpstream.join(", ")}. Not ready for external use.`);
    if (upstreamKeys.includes("research-memo") && Number(ctx.upstream["research-memo"]?.sourcesRetrieved ?? 0) === 0) {
      findings.push("Research memo has no retrieved sources; every claim is unverified.");
    }
    // Buyer-finding missions: missing offer facts and absent leads are never hidden.
    for (const k of upstreamKeys) {
      const missing = ctx.upstream[k]?.missing;
      if (Array.isArray(missing) && missing.length) findings.push(`${k} is missing: ${missing.join(", ")}. Outreach drafts carry placeholders until these are given.`);
    }
    if (upstreamKeys.some((k) => ctx.upstream[k]?.leadsRetrieved === 0)) {
      findings.push("No buyer contacts have been retrieved; nothing can be sent until a data connection finds leads or you add them.");
    }
    const verdict = findings.length ? "needs_work" : "pass";
    const body = [`# Quality review`, ``, `**Verdict:** ${verdict}`, ``, ...(findings.length ? findings.map((f) => `- ${f}`) : ["- No issues detected by automated checks."])].join("\n");
    const artifact = await ctx.writeArtifact({ kind: "markdown", title: "Quality review", content: body });
    return { status: "succeeded", output: { artifactId: artifact.id, verdict, findings }, summary: `Quality review: ${verdict} (${findings.length} findings).` };
  },
};

export const deployPreview: Skill = {
  manifest: {
    id: "deploy-preview",
    version: "0.1.0",
    name: "Deploy preview site",
    description: "Pushes the generated site to a connected hosting provider. Always requires approval; blocked until a hosting connection exists.",
    agent: "Forge",
    actionClass: "deploy",
    permissionScopes: ["connection:hosting", "artifact:write"],
    privacy: "third_party",
    cost: { baseCredits: 10, variableAllowanceCredits: 0, creditsPerThousandTokens: 0 },
    timeoutMs: 120_000,
    maxAttempts: 1,
    availability: "needs_connection",
    inputSchema: anyRecord,
  },
  async run(ctx) {
    if (!(await ctx.hasConnection("hosting"))) {
      return { status: "blocked", reason: "No hosting connection is configured for this workspace. Connect a provider under Connected apps, then retry." };
    }
    // The hosting adapter lands with the connector framework (B-30). Until then a
    // connected provider still yields a blocked result rather than a fake success.
    return { status: "blocked", reason: "Deployment is not implemented yet: the hosting adapter ships with the connector framework (backlog B-30)." };
  },
};

export const BUILTIN_SKILLS: Skill[] = [brandBrief, researchMemo, siteOutline, siteBuild, siteCheck, deckOutline, qaReview, deployPreview, ...SALES_SKILLS, ...SOCIAL_SKILLS];
