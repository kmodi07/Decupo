import { Suspense } from "react";
import { Intake } from "@/components/intake";
import { AVAILABILITY_LABEL, AgentBadge, availabilityTone, CupiMark, LinkButton, Pill, Wordmark } from "@/components/ui";
import { getCurrentUser } from "@/server/auth/current";
import { AGENT_ROLES } from "@/server/skills/types";

const STAGES: { title: string; body: string }[] = [
  { title: "Say it", body: "One or two sentences. Cupi asks only for what is missing." },
  { title: "See the plan and the price", body: "Which agents, which steps, how many credits. Anything consequential is marked as needing your approval." },
  { title: "Give the go-ahead", body: "Credits are reserved, not spent. You can set a ceiling." },
  { title: "Watch the crew work", body: "Every step reports in. Pause, resume or stop at any time." },
  { title: "Review the deliverables", body: "Each step settles what it used. Unused credits come back." },
];

const TODAY: { label: string; status: "supported" | "needs_connection" | "not_available" }[] = [
  { label: "Mission planning with estimates and approvals", status: "supported" },
  { label: "Brand briefs, research memos, site and deck outlines", status: "supported" },
  { label: "Live updates, pause, resume, cancel, credit ledger", status: "supported" },
  { label: "Generated website code with tests and a preview", status: "not_available" },
  { label: "Editable slide decks with citations", status: "not_available" },
  { label: "YouTube publishing", status: "needs_connection" },
  { label: "Sending email or messages", status: "not_available" },
];

export default async function Landing() {
  const session = await getCurrentUser();
  return (
    <main className="min-h-dvh">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Wordmark />
        <div className="flex items-center gap-2">
          {session ? (
            <LinkButton href="/app" variant="secondary">
              Open Mission Control
            </LinkButton>
          ) : (
            <>
              <LinkButton href="/login" variant="ghost">
                Log in
              </LinkButton>
              <LinkButton href="/signup" variant="secondary">
                Sign up
              </LinkButton>
            </>
          )}
        </div>
      </nav>

      {/* Hero: the headline and a working intake, with Cupi alongside. */}
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-6 md:pt-14">
        <Suspense>
          <Intake
            mode="preview"
            hero={
              <>
                <h1 className="max-w-[12ch] text-[44px] font-bold leading-[1.02] tracking-[-0.03em] sm:text-[64px]">Say the dream. Watch it happen.</h1>
                <p className="mt-5 max-w-[46ch] text-[18px] leading-relaxed text-ink">
                  Cupi turns a short goal into a mission, prices it in credits, and assigns a small crew of specialist agents. They work in
                  bounded steps, stop for your approval before anything leaves the building, and tell you plainly when something is not
                  possible yet.
                </p>
              </>
            }
            aside={
              <div className="relative mx-auto hidden md:block">
                <div className="absolute inset-x-8 bottom-6 h-10 rounded-full bg-lavender/20 blur-2xl" aria-hidden />
                <CupiMark size={420} priority className="cupi-float relative drop-shadow-[0_30px_40px_rgba(128,101,237,0.25)]" />
              </div>
            }
          />
        </Suspense>
      </section>

      {/* How a mission runs: this is a sequence, so it is numbered. */}
      <section className="bg-midnight text-cream">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-[30px] font-bold tracking-tight">How a mission runs</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {STAGES.map((s, i) => (
              <li key={s.title} className="border-t border-cream/15 pt-4">
                <span className="text-[13px] font-semibold tabular-nums text-coral">{i + 1}</span>
                <h3 className="mt-1 text-[17px] font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-cream/75">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Crew */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <h2 className="text-[30px] font-bold tracking-tight">The crew</h2>
        <p className="mt-2 max-w-[60ch] text-[16px] text-ink">
          Cupi only calls the agents a goal actually needs. A simple research task is one agent; a website is three or four.
        </p>
        <ul className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(AGENT_ROLES).map(([name, role]) => (
            <li key={name} className="flex items-center gap-3">
              <AgentBadge name={name} />
              <div>
                <span className="text-[16px] font-semibold">{name}</span>
                <span className="block text-[14px] text-mute">{role}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Honesty */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="rounded-[var(--radius-card)] bg-cream-deep p-6 sm:p-8">
          <h2 className="text-[26px] font-bold tracking-tight">What works today</h2>
          <p className="mt-2 max-w-[60ch] text-[15px] text-ink">
            Decupo is in its foundation phase. The planner shows these same labels inside every mission, so you never authorise something that
            cannot happen.
          </p>
          <ul className="mt-6 divide-y divide-line">
            {TODAY.map((t) => (
              <li key={t.label} className="flex items-center justify-between gap-4 py-3 text-[15px]">
                <span>{t.label}</span>
                <Pill tone={availabilityTone(t.status)}>{AVAILABILITY_LABEL[t.status]}</Pill>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-[13px] text-mute sm:flex-row sm:items-center sm:justify-between">
          <span>Decupo is a working name and has not been cleared for trademark or domain use.</span>
          <span>Every new account starts with 100 Explore credits. Paid plans are not final.</span>
        </div>
      </footer>
    </main>
  );
}
