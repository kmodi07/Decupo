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
    id: "youtube",
    match: /\b(youtube|shorts?|video|channel|tiktok|reels?)\b/i,
    summary: "Topic research and a quality pass. Publishing is shown as needing a channel connection; nothing is posted.",
    steps: [
      { key: "research-memo", skillId: "research-memo", title: "Build a topic bank", input: { focus: "video topics" } },
      { key: "qa-review", skillId: "qa-review", title: "Quality review", dependsOn: ["research-memo"] },
    ],
    questions: [
      { key: "audience", prompt: "Who watches the channel?", required: false },
      { key: "cadence", prompt: "How many videos per week?", required: false },
    ],
    capabilities: [
      { label: "Topic research and scripts", status: "supported" },
      { label: "Video rendering", status: "not_available", note: "Media pipeline is a later phase." },
      { label: "YouTube publishing", status: "needs_connection", note: "Needs Google OAuth, app verification and quota." },
    ],
    caveats: [
      "High daily volumes (for example 10 Shorts a day) are expensive and must respect platform rules; feasibility and cost are shown before activation.",
    ],
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
