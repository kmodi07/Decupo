import { AVAILABILITY_LABEL, AgentBadge, availabilityTone, Card, Pill } from "@/components/ui";
import { ACTION_LABELS, ACTION_TIER, type ActionClass } from "@/server/policy/actions";
import { describeSkill, listSkills } from "@/server/skills/registry";

export const metadata = { title: "Skills" };

export default function SkillsPage() {
  const skills = listSkills().map(describeSkill);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-[30px] font-bold tracking-tight">Skills</h1>
        <p className="mt-1 max-w-[60ch] text-[15px] text-mute">
          What the crew can do today, what each skill is allowed to touch, and what it costs before it runs. Anything above tier 1 stops for
          your approval.
        </p>
      </header>
      <ul className="space-y-3">
        {skills.map((s) => {
          const tier = ACTION_TIER[s.actionClass as ActionClass];
          return (
            <li key={s.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <AgentBadge name={s.agent} />
                    <div className="min-w-0">
                      <p className="text-[16px] font-semibold">
                        {s.name} <span className="text-[13px] font-normal text-mute">v{s.version}</span>
                      </p>
                      <p className="mt-0.5 max-w-[64ch] text-[14px] text-ink">{s.description}</p>
                      <p className="mt-2 text-[13px] text-mute">
                        {s.agent}. {ACTION_LABELS[s.actionClass as ActionClass]} (tier {tier}). Touches {s.permissionScopes.join(", ")}. Data class:{" "}
                        {s.privacy.replace("_", " ")}. About {s.estimatedCredits} credits.
                      </p>
                    </div>
                  </div>
                  <Pill tone={availabilityTone(s.availability)}>{AVAILABILITY_LABEL[s.availability]}</Pill>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
