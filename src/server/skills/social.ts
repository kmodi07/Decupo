import { z } from "zod";
import type { Skill } from "./types";
import type { Connector } from "../connections/service";
import { detectLanguage, type Language } from "./sales";

/**
 * Social missions for a local business (for example an electronics agency
 * that wants Instagram reels): what sells locally, a week of reels, an
 * independent review, then posting one approved reel through the connected
 * Instagram or YouTube account. Nothing is rendered here: the video comes from
 * a public link the user gives.
 */

const anyRecord = z.record(z.string(), z.unknown());

export type ReelSlot = { day: number; angle: string; hook: string; shots: string[]; caption: string; cta: string };

const LANG_LABEL: Record<Language, string> = { en: "English", hi: "Hindi", gu: "Gujarati" };

function businessFromGoal(goal: string, input: Record<string, unknown>): { business: string; place: string | null; products: string | null } {
  const g = goal.replace(/\s+/g, " ").trim();
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const business = str(input.business) ?? /\bfor\s+(?:my|our|the)?\s*([A-Za-z][A-Za-z0-9&'\s-]{2,50}?)(?=\s+(?:in|at|near|that|which|who|selling|which)\b|[.,;]|$)/.exec(g)?.[1]?.trim() ?? "your business";
  const place = str(input.market) ?? /\b(?:in|at|near)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)(?=[.,;]|\s+(?:that|which|who|selling|for|and)\b|$)/.exec(g)?.[1]?.trim() ?? null;
  const products = str(input.products) ?? /\b(?:selling|sells?|stock(?:ing|s)?)\s+([a-z][a-z0-9&,\s-]{3,80}?)(?=[.;]|\s+(?:in|at|near)\b|$)/i.exec(g)?.[1]?.trim() ?? null;
  return { business, place, products };
}

const ANGLES: Array<[string, string, string[]]> = [
  ["What arrived this week", "Show the box opening and the first switch-on.", ["Delivery van or box at the door", "Unboxing in 3 cuts", "Product on, first use"]],
  ["Price vs the alternative", "One honest comparison customers ask about every day.", ["Two products side by side", "Point to the price tags", "Owner says which one and why"]],
  ["A customer's question", "Answer the question staff hear most often.", ["Staff member to camera", "Close-up of the feature", "Quick demo"]],
  ["Before and after", "Old appliance out, new one in, in one minute.", ["Old unit being removed", "New unit installed", "Family reaction"]],
  ["Service and delivery", "How fast delivery and installation really are.", ["Loading at the shop", "Driving through the area", "Installed and tested"]],
  ["Festival or season", "What people buy for this time of year and why.", ["Decorated shop front", "Three products on a table", "Owner's recommendation"]],
  ["Behind the counter", "Who runs the shop and how long it has been there.", ["Owner at the counter", "Old photo or signboard", "Today's shop"]],
];

export function reelPlan(business: string, place: string | null, products: string | null, language: Language): ReelSlot[] {
  const where = place ? ` in ${place}` : "";
  const what = products ?? "what you sell";
  const cta: Record<Language, string> = {
    en: `Visit ${business}${where} or message us on WhatsApp.`,
    hi: `${business}${place ? `, ${place}` : ""} पर आएं या WhatsApp पर मैसेज करें।`,
    gu: `${business}${place ? `, ${place}` : ""} પર આવો અથવા WhatsApp પર મેસેજ કરો.`,
  };
  return ANGLES.map(([angle, hook, shots], i) => ({
    day: i + 1,
    angle,
    hook,
    shots,
    caption:
      language === "hi"
        ? `${angle}: ${what} पर आज का रील। ${cta.hi}`
        : language === "gu"
          ? `${angle}: ${what} પર આજની રીલ. ${cta.gu}`
          : `${angle}: today's reel on ${what}. ${cta.en}`,
    cta: cta[language],
  }));
}

export const reelPlanSkill: Skill = {
  manifest: {
    id: "reel-plan",
    version: "0.1.0",
    name: "Reel plan",
    description:
      "A week of reel ideas for a local business: an angle, a hook, three shots and a caption per day, in English, Hindi or Gujarati, built from what the research step found about the area. A plan to shoot from; no video is rendered.",
    agent: "Motion",
    actionClass: "draft",
    permissionScopes: ["artifact:write"],
    privacy: "user_content",
    cost: { baseCredits: 50, variableAllowanceCredits: 0, creditsPerThousandTokens: 0 },
    timeoutMs: 30_000,
    maxAttempts: 3,
    availability: "supported",
    inputSchema: anyRecord,
  },
  async run(ctx) {
    const { business, place, products } = businessFromGoal(ctx.goal, ctx.input);
    const language = detectLanguage(ctx.goal, typeof ctx.input.language === "string" ? ctx.input.language : null);
    const plan = reelPlan(business, place, products, language);
    const research = ctx.upstream["research-memo"];
    const offline = research?.mock === true || Number(research?.sourcesRetrieved ?? 0) === 0;
    const md = [
      `# Reel plan: ${business}${place ? ` (${place})` : ""}`,
      "",
      `Seven reels, one per day, captions in ${LANG_LABEL[language]}.`,
      "",
      offline
        ? "> The local market research step ran offline, so these angles are general ones that work for shops like yours, not findings about your area. Replace the examples with what customers actually ask you."
        : "> Angles are shaped by the research memo for your area.",
      "",
      "> Nothing is posted by this step. Each reel waits for your approval before it goes out, and posting needs your Instagram or YouTube account connected.",
      "",
      ...plan.flatMap((r) => [`## Day ${r.day}: ${r.angle}`, "", `- Hook: ${r.hook}`, `- Shots: ${r.shots.join("; ")}`, `- Caption: ${r.caption}`, `- Call to action: ${r.cta}`, ""]),
    ].join("\n");
    const a = await ctx.writeArtifact({ kind: "markdown", title: "Reel plan", content: md });
    const j = await ctx.writeArtifact({ kind: "json", title: "Reel plan (structured)", content: JSON.stringify({ business, place, products, language, reels: plan }, null, 2) });
    return {
      status: "succeeded",
      output: { artifactId: a.id, planArtifactId: j.id, reelCount: plan.length, language, business, place, mock: offline, posted: 0 },
      summary: `${plan.length} reels planned in ${LANG_LABEL[language]}${offline ? " (general angles; research ran offline)" : ""}. Nothing posted.`,
    };
  },
};

type ReadyConnector = Extract<Connector, { status: "ready" }>;
type MissingConnector = Extract<Connector, { status: "needs_connection" }>;

export const socialPublish: Skill = {
  manifest: {
    id: "social-publish",
    version: "0.2.0",
    name: "Post to Instagram or YouTube",
    description:
      "Posts one approved reel from your own connected account using the video link you gave. Always requires approval, one reel at a time; blocked until the account is connected. YouTube uploads stay private until you change them.",
    agent: "Pulse",
    actionClass: "publish",
    permissionScopes: ["connection:instagram", "connection:youtube", "artifact:write", "artifact:read"],
    privacy: "third_party",
    cost: { baseCredits: 10, variableAllowanceCredits: 0, creditsPerThousandTokens: 0 },
    timeoutMs: 180_000,
    maxAttempts: 1,
    availability: "needs_connection",
    inputSchema: anyRecord,
  },
  async run(ctx) {
    const ig = await ctx.connector("instagram");
    const yt = await ctx.connector("youtube");
    const target = [ig, yt].find((c): c is ReadyConnector => c.status === "ready");
    if (!target) {
      const notEnabled = [ig, yt].filter((c): c is MissingConnector => c.status !== "ready" && c.code === "not_enabled");
      return {
        status: "blocked",
        reason: notEnabled.length ? notEnabled.map((c) => c.reason).join(" ") : "No Instagram or YouTube connection is configured for this workspace. Connect the account under Connected apps, then retry.",
        output: { posted: 0 },
      };
    }
    const videoUrl = typeof ctx.input.videoUrl === "string" ? ctx.input.videoUrl.trim() : "";
    if (!/^https?:\/\/\S+$/i.test(videoUrl)) {
      return {
        status: "blocked",
        reason: 'No video to post: Decupo does not render video yet. Give a public link to the reel you shot (the "videoUrl" answer) when creating the mission, then retry.',
        output: { posted: 0, platform: target.provider },
      };
    }
    const planOut = ctx.upstream["reel-plan"] ?? {};
    let reel: ReelSlot | null = null;
    if (typeof planOut.planArtifactId === "string") {
      const art = await ctx.readArtifact(planOut.planArtifactId);
      try {
        reel = (JSON.parse(art?.contentText ?? "{}") as { reels?: ReelSlot[] }).reels?.[0] ?? null;
      } catch {
        reel = null;
      }
    }
    if (!reel) {
      const { business, place, products } = businessFromGoal(ctx.goal, ctx.input);
      reel = reelPlan(business, place, products, detectLanguage(ctx.goal, typeof ctx.input.language === "string" ? ctx.input.language : null))[0]!;
    }
    const first: ReelSlot = reel;
    const business = typeof planOut.business === "string" ? planOut.business : businessFromGoal(ctx.goal, ctx.input).business;
    const title = `${business}: ${first.angle}`;
    const res = await ctx.once("publish:1", `${target.provider}.publishReel`, () => target.publishReel({ videoUrl, caption: first.caption, title }));
    const mock = target.mode === "mock";
    const md = [
      `# Post record: ${title}`,
      "",
      `Posted to ${target.provider} (${target.label ?? "connected account"}) with your approval.`,
      "",
      `- Post id: ${res.postId}`,
      `- Link: ${res.url ?? "not returned by the provider"}`,
      `- Visibility: ${res.visibility ?? "as set by the provider"}`,
      `- Video: ${videoUrl}`,
      `- Caption: ${first.caption}`,
      "",
      mock ? "> Published through the mock adapter: nothing reached a real account." : target.provider === "youtube" ? "> Uploaded as private. Change the visibility on YouTube when you are ready." : "> The reel is live on your account.",
      "",
    ].join("\n");
    const a = await ctx.writeArtifact({ kind: "markdown", title: "Post record", content: md });
    return {
      status: "succeeded",
      output: { artifactId: a.id, posted: 1, platform: target.provider, postId: res.postId, url: res.url, visibility: res.visibility, mock },
      summary: `1 reel posted to ${target.provider}${res.visibility === "private" ? " (private)" : ""}${mock ? " (mock adapter)" : ""}.`,
    };
  },
};

export const SOCIAL_SKILLS: Skill[] = [reelPlanSkill, socialPublish];
