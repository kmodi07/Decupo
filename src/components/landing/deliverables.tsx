import { AgentBadge, Pill } from "../ui";

/**
 * What a finished mission leaves behind, drawn from Decupo's real artifact
 * types: a brand brief, a generated multi-page site, Vale's quality review,
 * an approval request and the credit settlement. Static examples, labelled as
 * examples so nobody mistakes them for a live account.
 */
export function Deliverables() {
  return (
    <div className="deliverables grid gap-4 md:grid-cols-6">
      {/* Generated site: a miniature of a real site-build page */}
      <article className="deliverable md:col-span-4 md:row-span-2">
        <Caption agent="Forge" title="A real multi-page site" meta="index.html, about, services, pricing, contact, styles.css" />
        <div className="site-mini mt-4" aria-hidden>
          <div className="site-mini-bar">
            <span />
            <span />
            <span />
            <span className="site-mini-url">preview/index.html</span>
          </div>
          <div className="site-mini-mast">
            <div className="site-mini-nav">
              <b>Clay &amp; Kiln</b>
              <span>Home</span>
              <span>About</span>
              <span>Services</span>
              <span>Pricing</span>
              <span>Contact</span>
            </div>
            <div className="site-mini-hero">
              <div>
                <h4>Clay &amp; Kiln</h4>
                <p>A new home on the web for Clay &amp; Kiln.</p>
                <i>Get in touch</i>
              </div>
              <svg viewBox="0 0 120 120" fill="none" aria-hidden>
                <circle cx="60" cy="60" r="52" stroke="rgba(255,255,255,.2)" />
                <circle cx="60" cy="60" r="34" stroke="rgba(255,255,255,.2)" />
                <path d="M16 60a44 44 0 0 1 44-44" stroke="#bff3e0" strokeWidth="3" strokeLinecap="round" />
                <circle cx="60" cy="60" r="8" fill="#bff3e0" />
              </svg>
            </div>
          </div>
          <div className="site-mini-body">
            <div />
            <div />
            <div />
          </div>
        </div>
      </article>

      <article className="deliverable md:col-span-2">
        <Caption agent="Vale" title="Site quality review" meta="Automatic checks, never hidden" />
        <ul className="mt-3 space-y-1.5 text-[13.5px]">
          {["Internal links resolve", "Every image has alt text", "One h1 per page", "lang and title present"].map((c) => (
            <li key={c} className="flex items-center gap-2">
              <span className="inline-grid h-4 w-4 place-items-center rounded-full bg-mint text-[10px] font-bold text-mint-deep">✓</span>
              {c}
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center gap-2 text-[13px] text-mute">
          Verdict <Pill tone="done">pass</Pill>: 5 pages, 32 links, no failures.
        </p>
      </article>

      <article className="deliverable md:col-span-2">
        <Caption agent="Forge" title="Approval request" meta="Tier 3 action, waits for you" />
        <p className="mt-3 text-[14.5px] font-semibold">Deploy preview site</p>
        <p className="text-[13.5px] text-ink">Pushes the generated site to a connected hosting provider. Blocked until a hosting connection exists.</p>
        <div className="mt-3 flex gap-2">
          <span className="rounded-[var(--radius-control)] border border-line px-3 py-1.5 text-[13px] font-semibold">Decline</span>
          <span className="rounded-[var(--radius-control)] bg-coral px-3 py-1.5 text-[13px] font-semibold text-midnight">Approve</span>
        </div>
      </article>

      <article className="deliverable md:col-span-3">
        <Caption agent="Nova" title="Brand brief" meta="Markdown, built from your answers" />
        <div className="mt-3 space-y-1.5 text-[13.5px] leading-relaxed">
          <p className="font-semibold">Positioning</p>
          <p className="text-ink">Small-batch pottery for people who like their mugs to have a story.</p>
          <p className="font-semibold">Naming directions</p>
          <p className="text-ink">
            Clay &amp; Kiln, Second Firing, Slipware <span className="text-mute">(uncleared suggestions)</span>
          </p>
        </div>
      </article>

      <article className="deliverable md:col-span-3">
        <Caption agent="Cupi" title="Credit receipt" meta="Reserved, settled per step, remainder released" />
        <dl className="mt-3 grid grid-cols-3 gap-2 text-[13.5px]">
          <div className="rounded-[12px] bg-cream-deep p-3">
            <dt className="text-mute">Reserved</dt>
            <dd className="text-[20px] font-bold tabular-nums">275</dd>
          </div>
          <div className="rounded-[12px] bg-cream-deep p-3">
            <dt className="text-mute">Settled</dt>
            <dd className="text-[20px] font-bold tabular-nums">265</dd>
          </div>
          <div className="rounded-[12px] bg-mint/50 p-3">
            <dt className="text-mint-deep">Released</dt>
            <dd className="text-[20px] font-bold tabular-nums text-mint-deep">10</dd>
          </div>
        </dl>
      </article>
    </div>
  );
}

function Caption({ agent, title, meta }: { agent: string; title: string; meta: string }) {
  return (
    <header className="flex items-center gap-2.5">
      <AgentBadge name={agent} size="sm" />
      <div className="min-w-0">
        <h3 className="text-[16px] font-semibold tracking-tight">{title}</h3>
        <p className="truncate text-[12.5px] text-mute">{meta}</p>
      </div>
    </header>
  );
}
