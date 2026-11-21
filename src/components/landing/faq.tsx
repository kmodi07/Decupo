const QA: Array<[string, string]> = [
  [
    "What is Decupo?",
    "Decupo gives you Cupi, a planner that turns a short goal into a mission: a plan, a price in credits and a small crew of specialist agents who do bounded steps and report back.",
  ],
  [
    "Does Cupi do anything without asking?",
    "No. Nothing runs until you approve the estimate, and anything that leaves your workspace, such as deploying or publishing, pauses for a separate approval every time.",
  ],
  [
    "What does it cost?",
    "Every new account starts with 100 Explore credits. A mission reserves its estimate, each step settles what it really used, and the rest comes back. Paid plans are not final yet.",
  ],
  [
    "What can it actually do today?",
    "Plan missions with honest estimates, write brand briefs, research memos and outlines, generate a multi-page website with a private preview and an offline quality check. Deployment, decks, publishing and email need connections that are not built yet, and the planner says so.",
  ],
  [
    "Is the content real?",
    "Without a connected language model the agents produce clearly labelled offline drafts. They never invent sources, prices or statistics, and Vale flags placeholder content in the quality review.",
  ],
  ["Do I own what the crew makes?", "Yes. Every deliverable can be opened and downloaded from Mission Control, including the generated site files."],
];

export function Faq() {
  return (
    <div className="divide-y divide-line border-y border-line">
      {QA.map(([q, a]) => (
        <details key={q} className="faq group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[18px] font-semibold tracking-tight [&::-webkit-details-marker]:hidden">
            {q}
            <span className="faq-chevron inline-grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-white text-lavender-deep transition-transform duration-300 group-open:rotate-180 group-open:bg-lavender group-open:text-cream">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </summary>
          <p className="faq-answer max-w-[68ch] pb-6 text-[15.5px] leading-relaxed text-ink">{a}</p>
        </details>
      ))}
    </div>
  );
}
