import type { MissionPlan } from "@/server/planner/types";

const KIND: Record<string, string> = {
  website: "A website mission",
  presentation: "A presentation mission",
  social: "A social media mission",
  buyers: "A buyer-finding mission",
  outreach: "An outreach mission",
  research: "A research mission",
};

/** One sentence Cupi says about a plan, built only from the planner's own output. */
export function readOfPlan(plan: MissionPlan, opts: { withQuestion?: boolean } = {}): string {
  const crew = plan.team.filter((n) => n !== "Cupi");
  const who = crew.length <= 1 ? crew.join("") : `${crew.slice(0, -1).join(", ")} and ${crew.at(-1)}`;
  const approvals = plan.steps.filter((s) => s.requiresApproval).length;
  const notYet = plan.capabilities.filter((c) => c.status !== "supported").length;
  return [
    `${KIND[plan.templateId] ?? "A mission"}: ${plan.steps.length} steps with ${who}, about ${plan.estimateCredits} credits.`,
    approvals ? `${approvals === 1 ? "One step waits" : `${approvals} steps wait`} for your approval.` : "",
    notYet ? "I'll show you plainly what is not possible yet." : "",
    opts.withQuestion && plan.questions.length ? `I'd ask: ${plan.questions[0]!.prompt}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Keep only answered questions; the API accepts a record of non-empty strings. */
export function cleanAnswers(answers: Record<string, string>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers)) if (v.trim()) out[k] = v.trim();
  return Object.keys(out).length ? out : undefined;
}

export function parseAnswersParam(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (typeof v === "string") out[k] = v.slice(0, 500);
    return out;
  } catch {
    return {};
  }
}
