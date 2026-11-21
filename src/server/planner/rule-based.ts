import { getSkill } from "../skills/registry";
import { requiresApproval } from "../policy/actions";
import type { AgentName } from "../skills/types";
import type { MissionPlan, PlanInput, PlannedStep, Planner, PlanQuestion, Capability } from "./types";

type Template = {
  id: string;
  match: RegExp;
  summary: string;
  steps: Array<{ key: string; skillId: string; title: string; dependsOn?: string[]; input?: Record<string, unknown> }>;
  questions: PlanQuestion[];
  capabilities: Capability[];
  caveats: string[];
};

const TEMPLATES: Template[] = [
  {
    id: "website",
    match: /\b(website|web site|landing page|homepage|site)\b/i,
    summary:
      "Brand brief, sitemap and page outlines, a generated multi-page static site you can preview, an independent offline quality check, then a deployment step that waits for your approval.",
    steps: [
      { key: "brand-brief", skillId: "brand-brief", title: "Draft the brand brief" },
      { key: "site-outline", skillId: "site-outline", title: "Outline the site", dependsOn: ["brand-brief"] },
      { key: "site-build", skillId: "site-build", title: "Build the site", dependsOn: ["brand-brief", "site-outline"] },
      { key: "site-check", skillId: "site-check", title: "Check the site", dependsOn: ["site-build"] },
      { key: "deploy-preview", skillId: "deploy-preview", title: "Deploy preview (needs approval)", dependsOn: ["site-check"] },
    ],
    questions: [
      { key: "brandName", prompt: "What is the business or project called?", required: false },
      { key: "look", prompt: "Any colours or a look you have in mind?", required: false },
      { key: "audience", prompt: "Who is the site for?", required: false },
      { key: "tone", prompt: "Any words that describe the tone you want?", required: false },
    ],
    capabilities: [
      { label: "Brand and page planning", status: "supported" },
      { label: "Generated site code with tests and preview", status: "supported", note: "Template-based static site with offline link and accessibility checks." },
      { label: "Deployment to hosting", status: "needs_connection", note: "Requires a hosting connection and your approval." },
    ],
    caveats: [
      "The site is built from templates. Without a connected language model the copy is an offline draft and the quality review says so.",
      "Sandboxed builds of custom code are not available yet; only template output is generated.",
    ],
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
    id: "social",
    match: /\b(instagram|insta|reels?|youtube|shorts?|tiktok|social media|followers|videos?|channel|posts?)\b/i,
    summary:
      "Research on what sells in your area and how it is promoted, a week of reels with hooks, shots and captions in your language, an independent quality pass, then posting from your own account, which needs the connection and your approval per reel.",
    steps: [
      { key: "research-memo", skillId: "research-memo", title: "Research what sells locally", input: { focus: "what sells in this area, how competitors promote it, and what customers ask" } },
      { key: "reel-plan", skillId: "reel-plan", title: "Plan a week of reels", dependsOn: ["research-memo"] },
      { key: "qa-review", skillId: "qa-review", title: "Quality review", dependsOn: ["reel-plan"] },
      { key: "social-publish", skillId: "social-publish", title: "Post the first reel (needs approval)", dependsOn: ["qa-review"] },
    ],
    questions: [
      { key: "business", prompt: "What is the business called?", required: false },
      { key: "products", prompt: "What do you mainly sell?", required: false },
      { key: "market", prompt: "Which town or area are your customers in?", required: false },
      { key: "language", prompt: "Which language should captions be in? English, Hindi or Gujarati.", required: false },
    ],
    capabilities: [
      { label: "Local market research and a weekly reel plan", status: "supported", note: "Research is an offline outline until a language model and web access are connected." },
      { label: "Video rendering", status: "not_available", note: "Media pipeline is a later phase; the plan is for you to shoot from." },
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
      { key: "location", prompt: "Where is the stock now?", required: false },
      { key: "market", prompt: "Which city or region should buyers be in?", required: false },
      { key: "contact", prompt: "How should buyers reach you? Email, phone or WhatsApp number.", required: false },
      { key: "terms", prompt: "Any delivery or payment terms?", required: false },
      { key: "language", prompt: "Which language should messages be in? English, Hindi or Gujarati.", required: false },
    ],
    capabilities: [
      { label: "Offer sheet, buyer map and outreach drafts", status: "supported" },
      { label: "Finding real buyer contacts", status: "needs_connection", note: "Needs a lead-data or web-search connection; until then you can add contacts yourself." },
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

export function titleFromGoal(goal: string): string {
  const clean = goal.trim().replace(/\s+/g, " ");
  const t = clean.length > 72 ? `${clean.slice(0, 69).trimEnd()}...` : clean;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export class RuleBasedPlanner implements Planner {
  readonly name = "rule-based-v1";

  async plan(input: PlanInput): Promise<MissionPlan> {
    const goal = input.goal.trim();
    const template = TEMPLATES.find((t) => t.match.test(goal)) ?? FALLBACK;
    const answers = input.answers ?? {};
    const steps: PlannedStep[] = template.steps.map((s) => {
      const skill = getSkill(s.skillId);
      const m = skill.manifest;
      return {
        key: s.key,
        title: s.title,
        agent: m.agent,
        skillId: m.id,
        dependsOn: s.dependsOn ?? [],
        input: { ...(s.input ?? {}), ...answers },
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
      questions: template.questions,
      capabilities: template.capabilities,
      estimateCredits,
      caveats: [
        ...template.caveats,
        "Estimates are based on each skill's base cost; actual usage is settled per step and unused credits are released.",
      ],
      plannerName: this.name,
    };
  }
}

export function getPlanner(): Planner {
  return new RuleBasedPlanner();
}
