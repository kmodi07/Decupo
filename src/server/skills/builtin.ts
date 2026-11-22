import { z } from "zod";
import { composeBrandBrief, composeDeckOutline, composePageOutlines, composeResearchMemo } from "./compose";
import { GROWTH_SKILLS } from "./growth";
import { SALES_SKILLS } from "./sales";
import { SOCIAL_SKILLS } from "./social";
import { siteBuild } from "./site-build";
import { siteCheck } from "./site-check";
import type { Skill } from "./types";

/**
 * Writing skills compose their deliverables from the goal and the answers the
 * user gave. No language model is involved: the content is structured,
 * English, and traceable to inputs, and the quality review flags what still
 * needs a human (sources, missing facts) instead of a stand-in notice.
 */

const anyRecord = z.record(z.string(), z.unknown());

export const brandBrief: Skill = {
  manifest: {
    id: "brand-brief",
    version: "0.2.0",
    name: "Brand brief",
    description: "Positioning, audience, voice, naming directions and visual direction built from the goal and your answers. Names are suggestions and are not cleared.",
    agent: "Nova",
    actionClass: "draft",
    permissionScopes: ["artifact:write"],
    privacy: "user_content",
    cost: { baseCredits: 40, variableAllowanceCredits: 10, creditsPerThousandTokens: 0 },
    timeoutMs: 60_000,
    maxAttempts: 3,
    availability: "supported",
    inputSchema: anyRecord,
  },
  async run(ctx) {
    const { markdown, brandName, archetype } = composeBrandBrief({
      goal: ctx.goal,
      brandName: ctx.input.brandName,
      audience: ctx.input.audience,
      tone: ctx.input.tone,
      look: ctx.input.look,
      products: ctx.input.products,
      place: ctx.input.market ?? ctx.input.place,
    });
    const artifact = await ctx.writeArtifact({ kind: "markdown", title: "Brand brief", content: markdown });
    return { status: "succeeded", output: { artifactId: artifact.id, brandName, archetype }, summary: `Brand brief written for ${brandName}.` };
  },
};

export const researchMemo: Skill = {
  manifest: {
    id: "research-memo",
    version: "0.2.0",
    name: "Research memo",
    description: "Structured memo on the goal: the question, what you have told us, what to find out and where to look. Sources are listed only when actually retrieved.",
    agent: "Scout",
    actionClass: "read",
    permissionScopes: ["artifact:write"],
    privacy: "user_content",
    cost: { baseCredits: 60, variableAllowanceCredits: 10, creditsPerThousandTokens: 0 },
    timeoutMs: 90_000,
    maxAttempts: 3,
    availability: "supported",
    inputSchema: anyRecord,
  },
  async run(ctx) {
    const content = composeResearchMemo({ goal: ctx.goal, focus: ctx.input.focus, answers: ctx.input });
    const artifact = await ctx.writeArtifact({ kind: "markdown", title: "Research memo", content });
    return { status: "succeeded", output: { artifactId: artifact.id, sourcesRetrieved: 0 }, summary: "Research memo written; no sources retrieved yet." };
  },
};

export const siteOutline: Skill = {
  manifest: {
    id: "site-outline",
    version: "0.2.0",
    name: "Website outline",
    description: "Sitemap and per-page content outline derived from the brand brief. The site-build step turns it into code.",
    agent: "Forge",
    actionClass: "generate",
    permissionScopes: ["artifact:write", "artifact:read"],
    privacy: "user_content",
    cost: { baseCredits: 80, variableAllowanceCredits: 10, creditsPerThousandTokens: 0 },
    timeoutMs: 90_000,
    maxAttempts: 3,
    availability: "supported",
    inputSchema: anyRecord,
  },
  async run(ctx) {
    const pages = ["Home", "About", "Services", "Pricing", "Contact"];
    const sitemap = { pages: pages.map((p) => ({ title: p, path: p === "Home" ? "/" : `/${p.toLowerCase()}` })) };
    const brand = typeof ctx.upstream["brand-brief"]?.brandName === "string" ? (ctx.upstream["brand-brief"]!.brandName as string) : "the business";
    const a1 = await ctx.writeArtifact({ kind: "json", title: "Sitemap", content: JSON.stringify(sitemap, null, 2) });
    const a2 = await ctx.writeArtifact({ kind: "markdown", title: "Page outlines", content: composePageOutlines(sitemap.pages, brand, ctx.goal) });
    return {
      status: "succeeded",
      output: { sitemap, sitemapArtifactId: a1.id, outlineArtifactId: a2.id, pageCount: pages.length },
      summary: `Sitemap with ${pages.length} pages and outlines produced.`,
    };
  },
};

export const deckOutline: Skill = {
  manifest: {
    id: "deck-outline",
    version: "0.2.0",
    name: "Presentation outline",
    description: "Ten-slide outline built from the goal and the research memo, with every claim that needs a source marked. Export to an editable deck is Phase 2.",
    agent: "Atlas",
    actionClass: "generate",
    permissionScopes: ["artifact:write", "artifact:read"],
    privacy: "user_content",
    cost: { baseCredits: 60, variableAllowanceCredits: 10, creditsPerThousandTokens: 0 },
    timeoutMs: 90_000,
    maxAttempts: 3,
    availability: "supported",
    inputSchema: anyRecord,
  },
  async run(ctx) {
    const { markdown, slideCount } = composeDeckOutline(ctx.goal, { memoPresent: Boolean(ctx.upstream["research-memo"]), focus: ctx.input.focus, length: ctx.input.length });
    const artifact = await ctx.writeArtifact({ kind: "markdown", title: "Deck outline", content: markdown });
    return { status: "succeeded", output: { artifactId: artifact.id, slideCount }, summary: `Deck outline with ${slideCount} slides produced.` };
  },
};

export const qaReview: Skill = {
  manifest: {
    id: "qa-review",
    version: "0.2.0",
    name: "Quality review",
    description: "Independent checklist over upstream outputs: unsourced claims, missing facts, nothing to send to. Flags, never silently fixes.",
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
    const findings: string[] = [];
    if (upstreamKeys.length === 0) findings.push("No upstream outputs to review.");
    if (upstreamKeys.includes("research-memo") && Number(ctx.upstream["research-memo"]?.sourcesRetrieved ?? 0) === 0) {
      findings.push("Research memo has no retrieved sources; treat its statements as your inputs, not verified facts, and add sources before sharing.");
    }
    // Connector test mode: data from a mock adapter is never real buyers or real sends.
    const testData = upstreamKeys.filter((k) => ctx.upstream[k]?.mock === true);
    if (testData.length) findings.push(`Test data from the mock adapter in: ${testData.join(", ")}. These are not real contacts or sends; nothing should go out to them outside a test.`);
    if (upstreamKeys.includes("deck-outline")) {
      findings.push("Deck outline marks claims with [citation needed]; each needs a source before the deck is shown.");
    }
    // Buyer-finding missions: missing offer facts and absent leads are never hidden.
    for (const k of upstreamKeys) {
      const missing = ctx.upstream[k]?.missing;
      if (Array.isArray(missing) && missing.length) findings.push(`${k} is missing: ${missing.join(", ")}. Outreach drafts carry placeholders until these are given.`);
    }
    const leadCounts = upstreamKeys.map((k) => Number(ctx.upstream[k]?.leadsRetrieved ?? NaN)).filter((n) => !Number.isNaN(n));
    if (leadCounts.length && Math.max(...leadCounts) === 0) {
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
      return {
        status: "blocked",
        reason: "No hosting connection yet, so nothing was deployed and nothing was charged. Download the site files from Deliverables and upload them to any static host, or wait for hosting connections to arrive under Connected apps.",
      };
    }
    // The hosting adapter lands with the connector framework (B-30). Until then a
    // connected provider still yields a blocked result rather than a fake success.
    return { status: "blocked", reason: "Deployment is not implemented yet: the hosting adapter ships with the connector framework (backlog B-30)." };
  },
};

export const BUILTIN_SKILLS: Skill[] = [brandBrief, researchMemo, siteOutline, siteBuild, siteCheck, deckOutline, qaReview, deployPreview, ...SALES_SKILLS, ...SOCIAL_SKILLS, ...GROWTH_SKILLS];
