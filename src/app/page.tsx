import { Suspense } from "react";
import { CupiIntake } from "@/components/cupi-intake";
import { Deliverables } from "@/components/landing/deliverables";
import { Faq } from "@/components/landing/faq";
import { MissionWalkthrough } from "@/components/landing/mission-walkthrough";
import { AVAILABILITY_LABEL, AgentBadge, availabilityTone, LinkButton, Pill, Wordmark } from "@/components/ui";
import { getCurrentUser } from "@/server/auth/current";
import { AGENT_ROLES } from "@/server/skills/types";

const TODAY: { label: string; status: "supported" | "needs_connection" | "not_available" }[] = [
  { label: "Mission planning with estimates and approvals", status: "supported" },
  { label: "Brand briefs, research memos, site and deck outlines", status: "supported" },
  { label: "Generated multi-page website with preview and quality check", status: "supported" },
  { label: "Offer sheets, buyer maps and outreach drafts for selling stock", status: "supported" },
  { label: "Finding and contacting buyers from your own accounts", status: "needs_connection" },
  { label: "Live updates, pause, resume, cancel, credit ledger", status: "supported" },
  { label: "Deploying the site to hosting", status: "needs_connection" },
  { label: "Editable slide decks with citations", status: "not_available" },
  { label: "Local market research and a weekly reel plan in your language", status: "supported" },
  { label: "Posting reels to Instagram or YouTube", status: "needs_connection" },
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
                Start free
              </LinkButton>
            </>
          )}
        </div>
      </nav>

      {/* Front door: Cupi greets the visitor and reads the goal as they type. */}
      <section className="hero-scene relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-5 pb-16 pt-8 md:pt-12">
          <div className="mx-auto max-w-[22ch] text-center md:max-w-none md:text-left">
            <h1 className="text-[40px] font-bold leading-[1.02] tracking-[-0.03em] sm:text-[56px] md:max-w-[14ch]">Say the dream. Watch it happen.</h1>
            <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-ink md:text-[18px]">
              Meet Cupi, who turns a short goal into a priced mission and sends a small crew of specialist agents to do it, step by step, with
              your approval before anything leaves the building. A website, a deck, research, or buyers for the stock in your field.
            </p>
          </div>
          <div className="mt-8 md:mt-10">
            <Suspense>
              <CupiIntake />
            </Suspense>
          </div>
        </div>
      </section>

      {/* Honest status strip in place of social proof. */}
      <section aria-label="What works today" className="border-y border-line bg-white/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 text-[13.5px]">
          <span className="font-semibold">One real customer so far: Volt IQ Academy was built here.</span>
          <span className="text-mute">Websites, briefs, research, buyer maps, outreach drafts and reel plans run today, in English, Hindi or Gujarati. Deploying, decks, lead search, sending and posting are shown as not ready, never faked.</span>
        </div>
      </section>

      {/* A mission, step by step: sticky walkthrough. */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-[32px] font-bold tracking-tight sm:text-[40px]">A mission, step by step.</h2>
        <p className="mt-2 max-w-[60ch] text-[16px] text-ink">Scroll through what happens after you say it. The right side is what Mission Control shows at each moment.</p>
        <div className="mt-10">
          <MissionWalkthrough />
        </div>
      </section>

      {/* Deliverables */}
      <section className="bg-midnight text-cream">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-[32px] font-bold tracking-tight sm:text-[40px]">Real deliverables, honestly labelled.</h2>
          <p className="mt-2 max-w-[60ch] text-[16px] text-cream/75">
            These are the artifact types a mission produces today. When the crew drafts something offline, it says so on the artifact and in the
            quality review.
          </p>
          <div className="mt-10">
            <Deliverables />
          </div>
          <p className="mt-4 text-[12.5px] text-cream/50">Example content, not a live account.</p>
        </div>
      </section>

      {/* Crew */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="text-[32px] font-bold tracking-tight sm:text-[40px]">The crew.</h2>
        <p className="mt-2 max-w-[60ch] text-[16px] text-ink">Cupi only calls the agents a goal actually needs. A simple research task is one agent; a website is three.</p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(AGENT_ROLES).map(([name, role]) => (
            <li key={name} className="crew-card flex items-center gap-3 rounded-[16px] border border-line bg-white px-4 py-3.5">
              <AgentBadge name={name} />
              <div>
                <span className="text-[16px] font-semibold">{name}</span>
                <span className="block text-[13.5px] text-mute">{role}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* What works today */}
      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="rounded-[var(--radius-card)] bg-cream-deep p-6 sm:p-8">
          <h2 className="text-[26px] font-bold tracking-tight">What works today</h2>
          <p className="mt-2 max-w-[60ch] text-[15px] text-ink">
            The planner shows these same labels inside every mission, so you never authorise something that cannot happen.
          </p>
          <ul className="mt-6 grid gap-x-8 sm:grid-cols-2">
            {TODAY.map((t) => (
              <li key={t.label} className="flex items-center justify-between gap-4 border-b border-line py-3 text-[15px]">
                <span>{t.label}</span>
                <Pill tone={availabilityTone(t.status)}>{AVAILABILITY_LABEL[t.status]}</Pill>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-4xl px-5 pb-24">
        <h2 className="text-[32px] font-bold tracking-tight sm:text-[40px]">Questions people ask.</h2>
        <div className="mt-8">
          <Faq />
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
