import { hasRealLlm } from "../llm";
import { getSkill } from "../skills/registry";
import { requiresApproval } from "../policy/actions";
import { parseOffer } from "../skills/sales";
import { brandNameFromGoal } from "../skills/site/generate";
import { businessFromGoal } from "../skills/social";
import type { AgentName } from "../skills/types";
import type { MissionPlan, PlanInput, PlannedStep, Planner, PlanQuestion, Capability } from "./types";

type Template = {
  id: string;
  match: RegExp;
  summary: string;
  steps: Array<{ key: string; skillId: string; title: string; dependsOn?: string[]; input?: Record<string, unknown> }>;
  /** In order of usefulness; only the ones the goal did not answer are shown, at most MAX_QUESTIONS. */
  questions: PlanQuestion[];
  /** What Cupi can read from the goal itself. */
  prefill?: (goal: string) => Record<string, string | null | undefined>;
  capabilities: Capability[];
  caveats: string[];
};

/** Cupi asks for at most this many things. Everything else is optional and marked as missing, never guessed. */
export const MAX_QUESTIONS = 3;

const CONTACT_Q: PlanQuestion = { key: "contact", prompt: "How should customers reach you? A phone or WhatsApp number.", required: false };

function prefillBusiness(goal: string) {
  const b = businessFromGoal(goal, {});
  return { business: b.business === "your business" ? null : b.business, market: b.place, products: b.products };
}

function prefillOffer(goal: string) {
  const o = parseOffer(goal, {});
  const contact = o.contact.whatsapp ?? o.contact.phone ?? o.contact.email;
  return { quantity: o.quantity, price: o.price, market: o.market, location: o.location, contact, product: o.product };
}

function prefillBrand(goal: string) {
  const name = brandNameFromGoal(goal);
  // "my tutoring company" yields a category, not a name; only a real name is prefilled.
  const category = new RegExp(`\\bfor\\s+(?:my|our|a|an|the)\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(goal);
  return { brandName: name === "Your Business" || category ? null : name };
}

const TEMPLATES: Template[] = [
  {
    id: "website",
    match: /\b(website|web site|landing page|homepage|site)\b/i,
    summary:
      "Brand brief, sitemap and page outlines, a generated multi-page site built for your kind of business that you can preview, an independent quality check, then a deployment step that waits for your approval.",
    steps: [
      { key: "brand-brief", skillId: "brand-brief", title: "Draft the brand brief" },
      { key: "site-outline", skillId: "site-outline", title: "Outline the site", dependsOn: ["brand-brief"] },
      { key: "site-build", skillId: "site-build", title: "Build the site", dependsOn: ["brand-brief", "site-outline"] },
      { key: "site-check", skillId: "site-check", title: "Check the site", dependsOn: ["site-build"] },
      { key: "deploy-preview", skillId: "deploy-preview", title: "Deploy preview (needs approval)", dependsOn: ["site-check"] },
    ],
    questions: [
      { key: "brandName", prompt: "What is the business called?", required: false },
      { key: "audience", prompt: "Who is the site for?", required: false },
      { key: "look", prompt: "Any colours or a look you have in mind?", required: false },
      { key: "tone", prompt: "Any words that describe the tone you want?", required: false },
    ],
    prefill: prefillBrand,
    capabilities: [
      { label: "Brand and page planning", status: "supported" },
      { label: "Generated site code with tests and preview", status: "supported", note: "Layout, logo mark, cursor and copy chosen for your kind of business; automatic link and accessibility checks." },
      { label: "Deployment to hosting", status: "needs_connection", note: "Requires a hosting connection and your approval. Until then, download the files and host them anywhere." },
    ],
    caveats: ["Copy is written in English from your brief and answers; review it before publishing.", "Only template output is generated; no custom code is run."],
  },
  {
    id: "presentation",
    match: /\b(presentation|deck|slides?|pitch)\b/i,
    summary: "Research memo, slide-by-slide outline, then an independent quality pass that flags uncited claims.",
    steps: [
      { key: "research-memo", skillId: "research-memo", title: "Research the topic" },
      { key: "deck-outline", skillId: "deck-outline", title: "Outline the deck", dependsOn: ["research-memo"] },
      { key: "qa-review", skillId: "qa-review", title: "Quality review", dependsOn: ["deck-outline"] },
    ],
    questions: [
      { key: "focus", prompt: "What angle or argument should the deck make?", required: false },
      { key: "length", prompt: "How long is the talk?", required: false },
    ],
    capabilities: [
      { label: "Outline with citation flags", status: "supported" },
      { label: "Editable .pptx export", status: "not_available", note: "Phase 2." },
    ],
    caveats: ["Citations are only included when sources are actually retrieved."],
  },
  {
    id: "grow",
    match: /\b(sell more|more (?:sales|customers|buyers|walk-?ins|footfall|orders|enquiries|business)|increase (?:sales|revenue|footfall|customers)|grow (?:my|our|the)? ?(?:shop|store|business|sales|customer base)|maximi[sz]e|revenue|customer base|footfall|get customers|bring customers|boost sales)\b/i,
    summary:
      "What sells in your area and how it is promoted, a four-week sales plan with offers and WhatsApp broadcasts written out, a week of reels to shoot, an independent quality pass, then posting from your own account, which needs the connection and your approval per reel.",
    steps: [
      { key: "research-memo", skillId: "research-memo", title: "Research what sells locally", input: { focus: "what sells in this area, how competitors promote it, and what customers ask" } },
      { key: "promo-plan", skillId: "promo-plan", title: "Write the four-week sales plan", dependsOn: ["research-memo"] },
      { key: "reel-plan", skillId: "reel-plan", title: "Plan a week of reels", dependsOn: ["research-memo"] },
      { key: "qa-review", skillId: "qa-review", title: "Quality review", dependsOn: ["promo-plan", "reel-plan"] },
      { key: "social-publish", skillId: "social-publish", title: "Post the first reel (needs approval)", dependsOn: ["qa-review"] },
    ],
    questions: [
      { key: "products", prompt: "What do you mainly sell?", required: false },
      CONTACT_Q,
      { key: "market", prompt: "Which town or area are your customers in?", required: false },
      { key: "business", prompt: "What is the business called?", required: false },
    ],
    prefill: prefillBusiness,
    capabilities: [
      { label: "Sales plan, offers and WhatsApp broadcast drafts", status: "supported", note: "Written in English from your answers; nothing is sent." },
      { label: "Local market research and a weekly reel plan", status: "supported", note: "Research is a structured memo from your answers until web research is connected." },
      { label: "Posting to Instagram or YouTube", status: "needs_connection", note: "From your own connected account, one reel per approval." },
    ],
    caveats: ["Nothing is sent or posted without your approval. Decupo never messages your customers on its own."],
  },
  {
    id: "social",
    match: /\b(instagram|insta|reels?|youtube|shorts?|tiktok|social media|followers|videos?|channel|posts?)\b/i,
    summary:
      "Research on what sells in your area and how it is promoted, a week of reels with hooks, shots and captions, an independent quality pass, then posting from your own account, which needs the connection and your approval per reel.",
    steps: [
      { key: "research-memo", skillId: "research-memo", title: "Research what sells locally", input: { focus: "what sells in this area, how competitors promote it, and what customers ask" } },
      { key: "reel-plan", skillId: "reel-plan", title: "Plan a week of reels", dependsOn: ["research-memo"] },
      { key: "qa-review", skillId: "qa-review", title: "Quality review", dependsOn: ["reel-plan"] },
      { key: "social-publish", skillId: "social-publish", title: "Post the first reel (needs approval)", dependsOn: ["qa-review"] },
    ],
    questions: [
      { key: "products", prompt: "What do you mainly sell?", required: false },
      { key: "market", prompt: "Which town or area are your customers in?", required: false },
      { key: "business", prompt: "What is the business called?", required: false },
    ],
    prefill: prefillBusiness,
    capabilities: [
      { label: "Local market research and a weekly reel plan", status: "supported", note: "Research is a structured memo from your answers until web research is connected." },
      { label: "Video rendering", status: "not_available", note: "The plan is for you to shoot from; give a link to a video you shot when it is time to post." },
      { label: "Posting to Instagram or YouTube", status: "needs_connection", note: "From your own connected account, one reel per approval." },
    ],
    caveats: ["Nothing is posted or promoted without your approval of each reel. Promotion budgets are never spent without a separate approval."],
  },
  {
    id: "buyers",
    match: /\b(sell(?:ing)?|buyers?|wholesal\w*|export(?:ers?|ing)?|stock|harvest|crop|produce|mandi|distributors?|bulk|offload)\b/i,
    summary:
      "An offer sheet from your stock and price, a map of who buys this in your market and how they want to be contacted, outreach drafts for each, an independent quality pass, then lead search and sending, which need connections and your approval per batch.",
    steps: [
      { key: "offer-sheet", skillId: "offer-sheet", title: "Write the offer sheet" },
      { key: "buyer-map", skillId: "buyer-map", title: "Map the buyers", dependsOn: ["offer-sheet"] },
      { key: "outreach-sequence", skillId: "outreach-sequence", title: "Draft the outreach", dependsOn: ["offer-sheet", "buyer-map"] },
      { key: "qa-review", skillId: "qa-review", title: "Quality review", dependsOn: ["outreach-sequence"] },
      { key: "lead-search", skillId: "lead-search", title: "Find buyer contacts (needs a connection)", dependsOn: ["buyer-map"] },
      { key: "outreach-send", skillId: "outreach-send", title: "Send outreach (needs approval)", dependsOn: ["qa-review", "lead-search"] },
    ],
    questions: [
      { key: "quantity", prompt: "How much stock do you have, and in what unit?", required: false },
      { key: "price", prompt: "What price are you asking, per unit?", required: false },
      { key: "contact", prompt: "How should buyers reach you? A phone or WhatsApp number, or an email.", required: false },
      { key: "market", prompt: "Which city or region should buyers be in?", required: false },
      { key: "location", prompt: "Where is the stock now?", required: false },
      { key: "terms", prompt: "Any delivery or payment terms?", required: false },
    ],
    prefill: prefillOffer,
    capabilities: [
      { label: "Offer sheet, buyer map and outreach drafts", status: "supported" },
      { label: "Finding real buyer contacts", status: "needs_connection", note: "Needs a lead-data or web-search connection; until then you can add contacts yourself. Not charged until it runs." },
      { label: "Sending email, WhatsApp or calls", status: "needs_connection", note: "From your own connected account, one batch per approval." },
    ],
    caveats: ["Decupo never contacts anyone without a connected account and your approval of each batch. Buyer segments are directions, not verified leads."],
  },
  {
    id: "outreach",
    match: /\b(outreach|leads?|prospects?|sales|crm|cold email)\b/i,
    summary: "Research-backed prospect profile and a quality pass. No messages are sent.",
    steps: [
      { key: "research-memo", skillId: "research-memo", title: "Profile the ideal prospect", input: { focus: "prospecting" } },
      { key: "qa-review", skillId: "qa-review", title: "Quality review", dependsOn: ["research-memo"] },
    ],
    questions: [{ key: "offer", prompt: "What are you offering and to whom?", required: false }],
    capabilities: [
      { label: "Prospect research and drafts", status: "supported" },
      { label: "Sending email", status: "not_available", note: "Requires a connected mailbox and per-recipient approval." },
    ],
    caveats: ["Decupo never sends outreach without a connected account, policy and approval."],
  },
];

const FALLBACK: Template = {
  id: "research",
  match: /.*/,
  summary: "A research memo on your goal followed by an independent quality pass.",
  steps: [
    { key: "research-memo", skillId: "research-memo", title: "Research the goal" },
    { key: "qa-review", skillId: "qa-review", title: "Quality review", dependsOn: ["research-memo"] },
  ],
  questions: [{ key: "focus", prompt: "What matters most about this?", required: false }],
  capabilities: [{ label: "Research memo", status: "supported" }],
  caveats: [],
};

/**
 * With a language model configured, a goal no template recognises goes to the
 * model instead of the structured memo. The draft is labelled model-written
 * and the quality review flags it as unverified.
 */
const GENERAL_FALLBACK: Template = {
  id: "general",
  match: /.*/,
  summary: "A model-written draft that answers your goal, clearly labelled as unverified, followed by an independent quality pass.",
  steps: [
    { key: "general-task", skillId: "general-task", title: "Draft an answer with a language model" },
    { key: "qa-review", skillId: "qa-review", title: "Quality review", dependsOn: ["general-task"] },
  ],
  questions: [{ key: "focus", prompt: "What matters most about this?", required: false }],
  capabilities: [
    { label: "Model-written draft", status: "supported", note: "Written by a language model from your goal and answers; labelled as unverified. No web research." },
    { label: "Research with sources", status: "not_available", note: "Web research is not connected; the draft cites nothing." },
  ],
  caveats: ["This draft is written by a language model and is not checked for accuracy. Review every fact before you rely on it."],
};

export function fallbackTemplateId(): "research" | "general" {
  return hasRealLlm() ? "general" : "research";
}

export function titleFromGoal(goal: string): string {
  const clean = goal.trim().replace(/\s+/g, " ");
  const t = clean.length > 72 ? `${clean.slice(0, 69).trimEnd()}...` : clean;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export class RuleBasedPlanner implements Planner {
  readonly name = "rule-based-v2";

  async plan(input: PlanInput): Promise<MissionPlan> {
    const goal = input.goal.trim();
    const template = TEMPLATES.find((t) => t.match.test(goal)) ?? (fallbackTemplateId() === "general" ? GENERAL_FALLBACK : FALLBACK);
    const answers = input.answers ?? {};
    const prefilled: Record<string, string> = {};
    for (const [k, v] of Object.entries(template.prefill?.(goal) ?? {})) if (typeof v === "string" && v.trim()) prefilled[k] = v.trim();
    // Questions: skip anything the goal or the answers already cover; ask the most useful few.
    const questions = template.questions.filter((q) => !prefilled[q.key] && !answers[q.key]?.trim()).slice(0, MAX_QUESTIONS);
    const steps: PlannedStep[] = template.steps.map((s) => {
      const skill = getSkill(s.skillId);
      const m = skill.manifest;
      return {
        key: s.key,
        title: s.title,
        agent: m.agent,
        skillId: m.id,
        dependsOn: s.dependsOn ?? [],
        input: { ...(s.input ?? {}), ...prefilled, ...answers },
        requiresApproval: requiresApproval(m.actionClass),
        actionClass: m.actionClass,
        estimatedCredits: m.cost.baseCredits + m.cost.variableAllowanceCredits,
      };
    });
    const team = [...new Set<AgentName>(["Cupi", ...steps.map((s) => s.agent)])];
    const estimateCredits = steps.reduce((sum, s) => sum + s.estimatedCredits, 0);
    return {
      templateId: template.id,
      title: titleFromGoal(goal),
      summary: template.summary,
      team,
      steps,
      questions,
      prefilled,
      capabilities: template.capabilities,
      estimateCredits,
      caveats: [
        ...template.caveats,
        "Estimates are each skill's base cost; a step that cannot run is not charged, and unused credits are released.",
      ],
      plannerName: this.name,
    };
  }
}

export function getPlanner(): Planner {
  return new RuleBasedPlanner();
}
