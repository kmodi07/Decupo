"use client";

import { useEffect, useRef, useState } from "react";
import { AgentBadge, CupiMark, Pill } from "../ui";

type Stage = { key: string; title: string; body: string };

export const STAGES: Stage[] = [
  { key: "say", title: "Say it", body: "One or two sentences. Cupi asks only for what is missing." },
  { key: "plan", title: "See the plan and the price", body: "Which agents, which steps, how many credits. Anything consequential is marked as needing your approval." },
  { key: "go", title: "Give the go-ahead", body: "Credits are reserved, not spent. You can set a ceiling." },
  { key: "work", title: "Watch the crew work", body: "Every step reports in. Pause, resume or stop at any time." },
  { key: "review", title: "Review the deliverables", body: "Each step settles what it used. Unused credits come back." },
];

/**
 * Scroll-driven walkthrough: the stage list on the left scrolls, the panel on
 * the right stays put and shows what Mission Control looks like at that
 * moment. IntersectionObserver picks the active stage; no scroll handlers.
 */
export function MissionWalkthrough() {
  const [active, setActive] = useState(0);
  const refs = useRef<Array<HTMLLIElement | null>>([]);

  useEffect(() => {
    const items = refs.current.filter((el): el is HTMLLIElement => el !== null);
    if (!items.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((en) => en.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(Number((visible.target as HTMLElement).dataset.index));
      },
      { rootMargin: "-40% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    for (const el of items) io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
      <ol className="space-y-2">
        {STAGES.map((s, i) => (
          <li
            key={s.key}
            data-index={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={`walk-stage rounded-[18px] px-5 py-5 transition-colors duration-300 ${i === active ? "is-active bg-white shadow-[var(--shadow-lift)]" : ""}`}
          >
            <button type="button" onClick={() => refs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" })} className="w-full text-left">
              <span className="flex items-center gap-3">
                <span className={`inline-grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-bold ${i === active ? "bg-coral text-midnight" : "bg-slate-soft text-mute"}`}>
                  {i + 1}
                </span>
                <span className="text-[18px] font-semibold tracking-tight">{s.title}</span>
              </span>
              <span className={`mt-1.5 block pl-10 text-[15px] leading-relaxed ${i === active ? "text-ink" : "text-mute"}`}>{s.body}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="walk-panel relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-float)]">
          <div className="flex items-center gap-2 border-b border-line bg-cream-deep px-4 py-2.5 text-[12.5px] text-mute">
            <span className="h-2.5 w-2.5 rounded-full bg-coral/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-soft" />
            <span className="h-2.5 w-2.5 rounded-full bg-mint" />
            <span className="ml-2">Mission Control</span>
          </div>
          <div key={active} className="walk-panel-in p-5 sm:p-6">
            <StagePanel index={active} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StagePanel({ index }: { index: number }) {
  switch (index) {
    case 0:
      return (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <CupiMark size={40} />
            <p className="rounded-[16px] rounded-tl-[4px] bg-lavender-soft px-4 py-3 text-[15px]">Hi, I&apos;m Cupi. What should we make?</p>
          </div>
          <div className="ml-auto max-w-[85%] rounded-[16px] rounded-tr-[4px] bg-midnight px-4 py-3 text-[15px] text-cream">
            Build me a beautiful website for my tutoring company
          </div>
          <div className="flex items-start gap-3">
            <CupiMark size={40} />
            <p className="rounded-[16px] rounded-tl-[4px] bg-lavender-soft px-4 py-3 text-[15px]">
              A website mission: 5 steps with Nova, Forge and Vale, about 275 credits. One step waits for your approval. I&apos;d ask: who is the site for?
            </p>
          </div>
        </div>
      );
    case 1:
      return (
        <div className="space-y-3">
          <p className="text-[13px] font-medium text-mute">Cupi&apos;s plan</p>
          <h3 className="text-[20px] font-bold tracking-tight">Build me a beautiful website for my tutoring company</h3>
          <ol className="space-y-2 text-[14.5px]">
            {[
              ["Nova", "Draft the brand brief", "about 50"],
              ["Forge", "Outline the site", "about 90"],
              ["Forge", "Build the site", "about 100"],
              ["Vale", "Check the site", "about 25"],
              ["Forge", "Deploy preview (needs approval)", "about 10"],
            ].map(([agent, title, cost], i) => (
              <li key={title} className="flex items-center gap-3">
                <span className="w-4 text-right text-[12.5px] tabular-nums text-mute">{i + 1}</span>
                <AgentBadge name={agent!} size="sm" />
                <span className="flex-1">{title}</span>
                {i === 4 && <Pill tone="needs_you">Waits for your approval</Pill>}
                <span className="text-[12.5px] tabular-nums text-mute">{cost}</span>
              </li>
            ))}
          </ol>
          <div className="rounded-[14px] bg-midnight p-4 text-cream">
            <p className="text-[12.5px] text-cream/70">Estimated cost</p>
            <p className="text-[24px] font-bold tracking-tight">275 credits</p>
            <p className="mt-1 text-[12.5px] text-cream/70">Reserved when you say go. Each step settles what it really used.</p>
          </div>
        </div>
      );
    case 2:
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-[14px] bg-cream-deep px-4 py-3">
            <span className="text-[15px]">Reserve 275 credits and start?</span>
            <span className="rounded-[var(--radius-control)] bg-coral px-4 py-2 text-[14px] font-semibold text-midnight">Go ahead</span>
          </div>
          <dl className="grid grid-cols-3 gap-3 rounded-[14px] bg-midnight p-4 text-cream">
            <div>
              <dt className="text-[12px] text-cream/60">Balance</dt>
              <dd className="text-[20px] font-bold tabular-nums">1,000</dd>
            </div>
            <div>
              <dt className="text-[12px] text-cream/60">Reserved</dt>
              <dd className="text-[20px] font-bold tabular-nums">275</dd>
            </div>
            <div>
              <dt className="text-[12px] text-cream/60">Available</dt>
              <dd className="text-[20px] font-bold tabular-nums">725</dd>
            </div>
          </dl>
          <p className="text-[13.5px] text-mute">A ceiling stops steps that would overspend. Nothing is ever overdrawn.</p>
        </div>
      );
    case 3:
      return (
        <ol className="space-y-2.5 text-[14.5px]">
          {[
            ["Nova", "Draft the brand brief", "Done", "done"],
            ["Forge", "Outline the site", "Done", "done"],
            ["Forge", "Build the site", "In progress", "active"],
            ["Vale", "Check the site", "Ready", "quiet"],
            ["Forge", "Deploy preview", "Waits for approval", "needs_you"],
          ].map(([agent, title, label, tone]) => (
            <li key={title} className="flex items-center gap-3 rounded-[12px] px-2 py-2 odd:bg-cream-deep/60">
              <AgentBadge name={agent!} size="sm" />
              <span className="flex-1 font-medium">{title}</span>
              <Pill tone={tone as "done" | "active" | "quiet" | "needs_you"} pulse={tone === "active"}>
                {label}
              </Pill>
            </li>
          ))}
          <li className="pt-2 text-[13px] text-mute">Updates stream live. Pause, resume or stop at any time; finished steps keep their deliverables.</li>
        </ol>
      );
    default:
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-[14px] border border-line bg-cream-deep/60 p-4">
            <div className="flex items-center gap-2">
              <AgentBadge name="Forge" size="sm" />
              <span className="font-semibold">Website</span>
              <span className="text-[12.5px] text-mute">5 pages, 6 files</span>
              <Pill tone="done">Checks passed</Pill>
            </div>
            <span className="rounded-[var(--radius-control)] bg-coral px-3 py-1.5 text-[13px] font-semibold text-midnight">Open preview</span>
          </div>
          <ul className="divide-y divide-line text-[14.5px]">
            {[
              ["Nova", "Brand brief"],
              ["Forge", "Sitemap"],
              ["Vale", "Site quality review"],
            ].map(([agent, title]) => (
              <li key={title} className="flex items-center gap-2 py-2.5">
                <AgentBadge name={agent!} size="sm" />
                <span className="flex-1 font-medium">{title}</span>
                <span className="text-[12.5px] text-mute">Open · Download</span>
              </li>
            ))}
          </ul>
          <p className="rounded-[12px] bg-mint/40 px-3 py-2 text-[13.5px] text-mint-deep">Settled 265 of 275 credits. 10 unused credits released.</p>
        </div>
      );
  }
}
