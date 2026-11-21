import type { MissionPlan } from "@/server/planner/types";
import { AVAILABILITY_LABEL, AgentBadge, availabilityTone, Credits, Crew, CupiMark, Pill } from "./ui";

/**
 * Cupi's plan card: what will happen, who does it, what it costs, what is not
 * possible yet. Shown before authorisation and in the public demo.
 */
export function PlanCard({ plan, footer }: { plan: MissionPlan; footer?: React.ReactNode }) {
  const approvalSteps = plan.steps.filter((s) => s.requiresApproval).length;
  return (
    <article className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-float)]">
      <header className="flex items-start gap-4 border-b border-line bg-cream-deep px-5 py-4 sm:px-6">
        <CupiMark size={44} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-mute">Cupi&apos;s plan</p>
          <h3 className="truncate text-[20px] font-bold tracking-tight">{plan.title}</h3>
          <p className="mt-1 text-[15px] leading-relaxed text-ink">{plan.summary}</p>
        </div>
      </header>

      <div className="grid gap-6 px-5 py-5 sm:px-6 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <Crew names={plan.team} />
          <ol className="mt-4 space-y-2.5">
            {plan.steps.map((s, i) => (
              <li key={s.key} className="flex items-start gap-3">
                <span className="mt-0.5 w-5 shrink-0 text-right text-[13px] font-semibold tabular-nums text-mute">{i + 1}</span>
                <AgentBadge name={s.agent} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-medium">{s.title}</span>
                    {s.requiresApproval && <Pill tone="needs_you">Waits for your approval</Pill>}
                  </div>
                  <span className="text-[13px] text-mute">
                    {s.agent} with {s.skillId}
                    {s.dependsOn.length ? `, after ${s.dependsOn.join(" and ")}` : ""}
                  </span>
                </div>
                <span className="shrink-0 text-[13px] tabular-nums text-mute">about {s.estimatedCredits}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-4">
          <div className="rounded-[14px] bg-midnight p-4 text-cream">
            <p className="text-[13px] text-cream/70">Estimated cost</p>
            <p className="text-[28px] font-bold tracking-tight">
              <Credits n={plan.estimateCredits} />
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-cream/70">
              Reserved when you say go. Each step settles what it really used; the rest comes back.
              {approvalSteps > 0 && ` ${approvalSteps} step${approvalSteps > 1 ? "s" : ""} will pause for your approval.`}
            </p>
          </div>
          <ul className="space-y-2">
            {plan.capabilities.map((c) => (
              <li key={c.label} className="flex items-start justify-between gap-3 text-[14px]">
                <span className="text-ink">
                  {c.label}
                  {c.note && <span className="block text-[12.5px] text-mute">{c.note}</span>}
                </span>
                <Pill tone={availabilityTone(c.status)}>{AVAILABILITY_LABEL[c.status]}</Pill>
              </li>
            ))}
          </ul>
          {plan.caveats.length > 0 && (
            <ul className="space-y-1 border-t border-line pt-3 text-[13px] leading-relaxed text-mute">
              {plan.caveats.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {footer && <footer className="border-t border-line bg-cream-deep px-5 py-4 sm:px-6">{footer}</footer>}
    </article>
  );
}
