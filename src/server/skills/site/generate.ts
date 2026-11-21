/**
 * Template-based static site generator (backlog B-21).
 *
 * Pure and deterministic: no network, no LLM, no user-provided code is ever
 * executed. The output is a flat file tree (index.html, one page per sitemap
 * entry, styles.css) that works from any directory because every link is
 * relative. Copy comes from the brand brief when it has real sections and from
 * honest, clearly labelled draft text otherwise; nothing is invented (no fake
 * prices, testimonials or statistics).
 *
 * Design system: navy masthead over porcelain content, serif display type over
 * a system sans, one cobalt accent. Motion is CSS-only because the preview
 * serves pages with `script-src 'none'`: a single hero cascade on load, a slow
 * aurora drift as texture, scroll-driven reveals on section headings, and
 * hover feedback on controls. Everything is disabled under
 * `prefers-reduced-motion`.
 */

export type SiteFile = { path: string; kind: "html" | "css"; content: string };

export type SitemapEntry = { title: string; path: string };

export type BriefSections = {
  positioning?: string;
  audience?: string;
  voice?: string;
  visual?: string;
};

export type SiteSpec = {
  brandName: string;
  goal: string;
  pages: SitemapEntry[];
  brief?: BriefSections;
  /** True when upstream copy came from the offline mock provider. */
  offline: boolean;
  /** Optional short tagline; derived from the brief when omitted. */
  tagline?: string;
};

export const CONTACT_FORM_NOTICE =
  "This form is not connected yet. Submissions go nowhere until a form endpoint is configured during deployment.";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** `/about` -> `about.html`, `/` -> `index.html`, `/our team` -> `our-team.html`. */
export function fileNameForPath(path: string): string {
  const slug = path
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, "-")
    .replace(/\//g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `${slug}.html` : "index.html";
}

/**
 * Pull `## Heading` sections out of the brand brief Markdown. Returns nothing
 * for the offline mock output, which has no sections, so templates fall back
 * to labelled draft copy instead of quoting the mock notice.
 */
export function parseBrief(markdown: string): BriefSections {
  const out: BriefSections = {};
  const chunks = markdown.split(/^##\s+/m).slice(1);
  for (const chunk of chunks) {
    const nl = chunk.indexOf("\n");
    const heading = (nl === -1 ? chunk : chunk.slice(0, nl)).trim().toLowerCase();
    const body = (nl === -1 ? "" : chunk.slice(nl + 1)).trim();
    if (!body || body.startsWith("> **Offline draft")) continue;
    if (heading.startsWith("positioning")) out.positioning = body;
    else if (heading.startsWith("audience")) out.audience = body;
    else if (heading.startsWith("voice")) out.voice = body;
    else if (heading.startsWith("visual")) out.visual = body;
  }
  return out;
}

/** Best-effort brand name from a goal such as "Build a website for my tutoring company". */
export function brandNameFromGoal(goal: string): string {
  const m = /\bfor\s+(?:my|our|a|an|the)?\s*([a-z0-9][a-z0-9' &-]{1,60}?)(?:\s+(?:called|named)\s+"?([^".,]+)"?)?\s*(?:[.,!]|$)/i.exec(goal.trim());
  const named = m?.[2]?.trim();
  if (named) return titleCase(named);
  const phrase = m?.[1]?.trim();
  if (phrase) return titleCase(phrase);
  return "Your Business";
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function plainText(md: string): string {
  return md
    .replace(/^[-*>]\s+/gm, "")
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstSentence(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const plain = plainText(s);
  const m = /^(.+?[.!?])(\s|$)/.exec(plain);
  return (m?.[1] ?? plain).slice(0, 160);
}

function paragraphs(md: string | undefined, fallback: string[]): string[] {
  if (!md) return fallback;
  const paras = md
    .split(/\n\s*\n/)
    .map(plainText)
    .filter(Boolean);
  return paras.length ? paras.slice(0, 3) : fallback;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1).replace(/[.!?]$/, ".");
}

type PageKind = "home" | "about" | "services" | "pricing" | "contact" | "generic";

function classify(title: string, path: string): PageKind {
  const t = `${title} ${path}`.toLowerCase();
  if (path.trim() === "/" || /\bhome\b|\bindex\b/.test(t)) return "home";
  if (/about|story|team/.test(t)) return "about";
  if (/service|offer|product|what we do/.test(t)) return "services";
  if (/pric|plan|rate/.test(t)) return "pricing";
  if (/contact|enquir|inquir|book/.test(t)) return "contact";
  return "generic";
}

type NormPage = SitemapEntry & { file: string; kind: PageKind };

function normalisePages(pages: SitemapEntry[]): NormPage[] {
  const seen = new Set<string>();
  const out: NormPage[] = [];
  for (const p of pages) {
    const title = (p.title ?? "").trim() || "Page";
    const path = (p.path ?? "").trim() || `/${title}`;
    let file = fileNameForPath(path);
    if (seen.has(file)) {
      let n = 2;
      while (seen.has(file.replace(/\.html$/, `-${n}.html`))) n += 1;
      file = file.replace(/\.html$/, `-${n}.html`);
    }
    seen.add(file);
    out.push({ title, path, file, kind: classify(title, path) });
  }
  if (!out.some((p) => p.file === "index.html")) {
    out.unshift({ title: "Home", path: "/", file: "index.html", kind: "home" });
  }
  // Home first, keep the rest in sitemap order.
  out.sort((a, b) => Number(b.file === "index.html") - Number(a.file === "index.html"));
  return out;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
type RenderCtx = {
  brand: string;
  tagline: string;
  goal: string;
  brief: BriefSections;
  ctaHref: string;
  ctaLabel: string;
  pages: NormPage[];
  offline: boolean;
};

const e = escapeHtml;

export function generateSite(spec: SiteSpec): SiteFile[] {
  const pages = normalisePages(spec.pages);
  const brand = spec.brandName.trim() || "Your Business";
  const tagline = spec.tagline?.trim() || firstSentence(spec.brief?.positioning) || `A new home on the web for ${brand}.`;
  const audienceLine = firstSentence(spec.brief?.audience);
  const description = audienceLine ? `${tagline} Made for ${lowerFirst(audienceLine)}` : tagline;
  const contact = pages.find((p) => p.kind === "contact");
  const ctaHref = contact ? contact.file : (pages[0]?.file ?? "index.html");
  const ctaLabel = contact ? "Get in touch" : "Learn more";
  const c: RenderCtx = { brand, tagline, goal: spec.goal, brief: spec.brief ?? {}, ctaHref, ctaLabel, pages, offline: spec.offline };
  const draftComment = spec.offline
    ? "<!-- Draft copy: generated offline from templates (no language model was connected). Replace the text before publishing. -->"
    : "<!-- Generated by Decupo. Copy derived from the brand brief; review before publishing. -->";

  const files: SiteFile[] = pages.map((p) => {
    const pageTitle = p.kind === "home" ? `${brand} - ${tagline}` : `${p.title} - ${brand}`;
    const html = [
      "<!doctype html>",
      '<html lang="en">',
      "<head>",
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>${e(pageTitle)}</title>`,
      `<meta name="description" content="${e(description)}">`,
      '<meta name="theme-color" content="#0b1f3a">',
      '<meta property="og:type" content="website">',
      `<meta property="og:site_name" content="${e(brand)}">`,
      `<meta property="og:title" content="${e(pageTitle)}">`,
      `<meta property="og:description" content="${e(description)}">`,
      '<meta name="twitter:card" content="summary">',
      '<meta name="generator" content="Decupo site-build">',
      '<link rel="stylesheet" href="styles.css">',
      "</head>",
      `<body class="page-${p.kind}">`,
      draftComment,
      '<a class="skip-link" href="#main">Skip to content</a>',
      '<div class="masthead">',
      '<div class="aurora" aria-hidden="true"></div>',
      '<header class="site-header">',
      `<a class="brand" href="index.html" aria-label="${e(brand)} home">${logoMark()}<span>${e(brand)}</span></a>`,
      `<nav class="site-nav" aria-label="Main"><ul>${navItems(pages, p)}</ul></nav>`,
      "</header>",
      renderMasthead(p, c),
      "</div>",
      `<main id="main">`,
      renderBody(p, c),
      "</main>",
      renderFooter(c),
      "</body>",
      "</html>",
      "",
    ].join("\n");
    return { path: p.file, kind: "html", content: html };
  });

  files.push({ path: "styles.css", kind: "css", content: stylesheet() });
  return files;
}

function navItems(pages: NormPage[], current: NormPage): string {
  return pages
    .map((p) => (p.file === current.file ? `<li><a href="${p.file}" aria-current="page">${e(p.title)}</a></li>` : `<li><a href="${p.file}">${e(p.title)}</a></li>`))
    .join("");
}

const draftNote = (c: RenderCtx) =>
  c.offline ? `<p class="draft-note" role="note">Draft copy. Written from templates without a connected language model; replace before publishing.</p>` : "";

/** The navy band at the top of every page: the hero on home, a page title elsewhere. */
function renderMasthead(page: NormPage, c: RenderCtx): string {
  const primary = `<a class="button button-primary" href="${c.ctaHref}"><span>${e(c.ctaLabel)}</span></a>`;
  if (page.kind === "home") {
    const about = c.pages.find((p) => p.kind === "about");
    const secondary = about ? `<a class="button button-ghost" href="${about.file}">Our story</a>` : "";
    return [
      '<section class="hero">',
      '<div class="hero-copy">',
      `<h1>${e(c.brand)}</h1>`,
      `<p class="lead">${e(c.tagline)}</p>`,
      `<div class="hero-actions">${primary}${secondary}</div>`,
      draftNote(c),
      "</div>",
      '<div class="hero-art" aria-hidden="true">',
      heroArt(),
      "</div>",
      "</section>",
      renderMarquee(c),
    ].join("\n");
  }
  const intro: Record<Exclude<PageKind, "home">, string> = {
    about: `The people, the purpose and the way ${c.brand} works.`,
    services: `What ${c.brand} does, and what you get at the end of it.`,
    pricing: "Clear tiers, confirmed in writing before any work starts.",
    contact: "Tell us what you need. We reply to every message.",
    generic: `A page from the ${c.brand} sitemap.`,
  };
  const heading = page.kind === "about" ? `About ${c.brand}` : page.kind === "contact" ? `Contact ${c.brand}` : page.title;
  return [
    '<section class="page-hero">',
    `<h1>${e(heading)}</h1>`,
    `<p class="lead">${e(intro[page.kind])}</p>`,
    draftNote(c),
    "</section>",
  ].join("\n");
}

/** Slow, pausable strip under the hero built from the sitemap, so it is always true to the site. */
function renderMarquee(c: RenderCtx): string {
  const sections = c.pages.filter((p) => p.kind !== "home");
  if (sections.length < 2) return "";
  const live = sections.map((p) => `<li><a href="${p.file}">${e(p.title)}</a></li>`).join("");
  // The second track only fills the loop; it is hidden from assistive tech and holds no links.
  const copy = sections.map((p) => `<li>${e(p.title)}</li>`).join("");
  return `<div class="marquee" aria-label="Sections of this site"><ul class="marquee-track">${live}</ul><ul class="marquee-track" aria-hidden="true">${copy}</ul></div>`;
}

function renderBody(page: NormPage, c: RenderCtx): string {
  const cta = `<a class="button button-primary" href="${c.ctaHref}"><span>${e(c.ctaLabel)}</span></a>`;
  switch (page.kind) {
    case "home": {
      const intro = paragraphs(c.brief.positioning, [`${c.brand} is getting a new website. This draft was generated for the goal: "${c.goal}".`]);
      const audience = paragraphs(c.brief.audience, ["Tell us who you serve and this section will speak to them directly."]);
      const voice = paragraphs(c.brief.voice, ["Clear, warm and direct, in every message and on every page."]);
      return [
        section("why", `Why ${c.brand}`, [
          '<div class="bento">',
          bentoTile("wide", "Who we are", intro[0]!, iconSpark()),
          bentoTile("tall", "Who we serve", audience[0]!, iconPeople()),
          bentoTile("", "How we talk", voice[0]!, iconQuote()),
          bentoTile("", "How to reach us", "Use the contact page to start a conversation. We reply to every message.", iconMail()),
          "</div>",
        ]),
        section("process", "How it works", [
          '<ol class="steps">',
          step(1, "Say hello", "Send a message with what you need and when you need it."),
          step(2, "Agree the plan", "We confirm scope, timing and price in writing before anything starts."),
          step(3, "Get it done", "The work lands as agreed, with a clear hand-over at the end."),
          "</ol>",
        ]),
        section("faq", "Questions people ask", [
          faq("How do we start?", `Use the contact page. ${c.brand} replies to every message with a suggested next step.`),
          faq("What does it cost?", "Prices are not published yet. Every quote is confirmed in writing before work starts."),
          faq("Where do you work?", "Add your locations or service area here; this draft does not assume one."),
        ]),
        ctaBand(c.brand, cta),
      ].join("\n");
    }
    case "about": {
      const story = paragraphs(c.brief.positioning, [
        `${c.brand} was set up with a clear goal: ${lowerFirst(c.goal)}`,
        "This page tells the story behind the business, the people involved and what they stand for. Replace this draft with your own words.",
      ]);
      const voice = paragraphs(c.brief.voice, ["Clear, warm and direct."]);
      const visual = paragraphs(c.brief.visual, ["Calm, uncluttered and consistent, so the work stays the focus."]);
      return [
        section("story", "The story", [
          '<div class="prose">',
          ...story.map((p) => `<p>${e(p)}</p>`),
          "</div>",
        ]),
        section("values", "What we stand for", [
          '<div class="cards">',
          card("How we work", voice[0]!),
          card("How things look", visual[0]!),
          card("What you can expect", "Straight answers, agreed timelines and no surprises on the invoice."),
          "</div>",
        ]),
        ctaBand(c.brand, cta),
      ].join("\n");
    }
    case "services": {
      return [
        section("offer", "The services", [
          '<div class="bento">',
          bentoTile("wide", "Core service", "Describe the main thing you do and the outcome a customer gets.", iconSpark()),
          bentoTile("tall", "Second service", "A complementary offer, or the next step customers usually take.", iconLayers()),
          bentoTile("", "Support", "How you look after customers after the work is done.", iconShield()),
          bentoTile("", "Something bespoke", "If it is not listed, ask. Most good work starts as a conversation.", iconMail()),
          "</div>",
        ]),
        ctaBand(c.brand, cta),
      ].join("\n");
    }
    case "pricing": {
      return [
        section("tiers", "Choose a starting point", [
          '<p class="section-intro">Figures are not filled in yet, so none are shown. Each tier is a conversation starter, not a contract.</p>',
          '<div class="tiers">',
          tier("Starter", "For getting going.", ["One clear deliverable", "Agreed timeline", "Email support"], false),
          tier("Standard", "For most customers.", ["Everything in Starter", "Regular check-ins", "Two rounds of changes"], true),
          tier("Premium", "For bigger needs.", ["Everything in Standard", "Priority scheduling", "Dedicated point of contact"], false),
          "</div>",
        ]),
        ctaBand(c.brand, cta, "Ask for a quote and we will confirm prices in writing before any work starts."),
      ].join("\n");
    }
    case "contact": {
      return [
        '<section class="section contact-grid" aria-labelledby="contact-heading">',
        '<div class="contact-aside">',
        '<h2 id="contact-heading">Send a message</h2>',
        '<p class="section-intro">A few lines is enough. Say what you need and roughly when, and we will come back with a next step.</p>',
        '<ul class="contact-points">',
        `<li>${iconMail()}<span>Email address to be added</span></li>`,
        `<li>${iconPin()}<span>Location or service area to be added</span></li>`,
        `<li>${iconClock()}<span>Opening hours to be added</span></li>`,
        "</ul>",
        "</div>",
        '<form class="contact-form" method="post" aria-describedby="form-status">',
        `<p id="form-status" class="form-notice" role="status">${e(CONTACT_FORM_NOTICE)}</p>`,
        field("name", "Your name", "text", "name"),
        field("email", "Email", "email", "email"),
        '<div class="field"><textarea id="message" name="message" rows="5" placeholder=" " required></textarea><label for="message">Message</label></div>',
        '<button class="button button-primary" type="submit" disabled aria-disabled="true"><span>Send (not connected yet)</span></button>',
        "</form>",
        "</section>",
      ].join("\n");
    }
    default:
      return [
        section("content", page.title, [
          '<div class="prose">',
          "<p>This page was listed in the sitemap but has no outline yet. Add the sections you want here.</p>",
          "</div>",
        ]),
        ctaBand(c.brand, cta),
      ].join("\n");
  }
}

function renderFooter(c: RenderCtx): string {
  const links = c.pages.map((p) => `<li><a href="${p.file}">${e(p.title)}</a></li>`).join("");
  return [
    '<footer class="site-footer">',
    '<div class="footer-inner">',
    `<a class="brand" href="index.html">${logoMark()}<span>${e(c.brand)}</span></a>`,
    `<nav aria-label="Footer"><ul>${links}</ul></nav>`,
    `<p class="legal">&copy; <span class="year">${new Date().getUTCFullYear()}</span> ${e(c.brand)}. All rights reserved.</p>`,
    "</div>",
    "</footer>",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
function section(id: string, heading: string, body: string[]): string {
  return [`<section class="section" aria-labelledby="${id}-heading">`, `<h2 id="${id}-heading" class="reveal">${e(heading)}</h2>`, ...body, "</section>"].join("\n");
}

function bentoTile(size: string, title: string, body: string, icon: string): string {
  const cls = size ? `tile tile-${size}` : "tile";
  return `<article class="${cls}"><span class="tile-icon" aria-hidden="true">${icon}</span><h3>${e(title)}</h3><p>${e(body)}</p></article>`;
}

function card(title: string, body: string): string {
  return `<article class="card"><h3>${e(title)}</h3><p>${e(body)}</p></article>`;
}

function step(n: number, title: string, body: string): string {
  return `<li class="step"><span class="step-number" aria-hidden="true">${n}</span><div><h3>${e(title)}</h3><p>${e(body)}</p></div></li>`;
}

function faq(q: string, a: string): string {
  return `<details class="faq"><summary>${e(q)}<span class="faq-chevron" aria-hidden="true">${iconChevron()}</span></summary><p>${e(a)}</p></details>`;
}

function tier(name: string, body: string, points: string[], featured: boolean): string {
  const cls = featured ? "tier tier-featured" : "tier";
  const flag = featured ? '<span class="tier-flag">Most chosen</span>' : "";
  return [
    `<article class="${cls}">${flag}<h3>${e(name)}</h3>`,
    `<p class="price">Price to be confirmed</p>`,
    `<p>${e(body)}</p>`,
    `<ul class="tier-points">${points.map((p) => `<li>${iconCheck()}${e(p)}</li>`).join("")}</ul>`,
    "</article>",
  ].join("");
}

function ctaBand(brand: string, cta: string, note?: string): string {
  return [
    '<section class="cta-band" aria-labelledby="cta-heading">',
    '<div class="cta-glow" aria-hidden="true"></div>',
    `<h2 id="cta-heading">Ready when you are.</h2>`,
    `<p>${e(note ?? `Start a conversation with ${brand}. No forms to fight, no commitment.`)}</p>`,
    cta,
    "</section>",
  ].join("\n");
}

function field(id: string, label: string, type: string, autocomplete: string): string {
  return `<div class="field"><input id="${id}" name="${id}" type="${type}" autocomplete="${autocomplete}" placeholder=" " required><label for="${id}">${e(label)}</label></div>`;
}

// Inline SVG only: no <img>, so nothing can be missing alt text and nothing is fetched.
const svg = (body: string, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
const iconSpark = () => svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>');
const iconPeople = () => svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 15.5a5 5 0 0 1 5.5 4.5"/>');
const iconQuote = () => svg('<path d="M7 7h4v5a4 4 0 0 1-4 4H6M15 7h4v5a4 4 0 0 1-4 4h-1"/>');
const iconMail = () => svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>');
const iconLayers = () => svg('<path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5M3 17l9 5 9-5"/>');
const iconShield = () => svg('<path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6l-8-3Z"/><path d="m9 12 2 2 4-4"/>');
const iconPin = () => svg('<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>');
const iconClock = () => svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>');
const iconCheck = () => svg('<path d="m5 12 4 4L19 7"/>', 16);
const iconChevron = () => svg('<path d="m6 9 6 6 6-6"/>', 18);

function logoMark(): string {
  return '<svg class="logo" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true" focusable="false"><rect x="2" y="2" width="26" height="26" rx="8" fill="currentColor" opacity="0.18"/><path d="M9 20V10h4.5a5 5 0 0 1 0 10H9Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="21" cy="19" r="1.8" fill="currentColor"/></svg>';
}

function heroArt(): string {
  // Abstract composition: concentric arcs and a drifting orb. Decorative, aria-hidden.
  return [
    '<svg class="hero-svg" viewBox="0 0 480 480" fill="none" aria-hidden="true" focusable="false">',
    '<defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bff3e0"/><stop offset="1" stop-color="#2f5bea"/></linearGradient></defs>',
    '<g class="hero-rings" stroke="rgba(255,255,255,0.18)" stroke-width="1.25">',
    '<circle cx="240" cy="240" r="210"/><circle cx="240" cy="240" r="165"/><circle cx="240" cy="240" r="120"/><circle cx="240" cy="240" r="75"/>',
    "</g>",
    '<path class="hero-arc" d="M60 240a180 180 0 0 1 180-180" stroke="url(#g1)" stroke-width="6" stroke-linecap="round"/>',
    '<circle class="hero-orb" cx="240" cy="60" r="14" fill="#bff3e0"/>',
    '<circle cx="240" cy="240" r="30" fill="url(#g1)"/>',
    "</svg>",
  ].join("");
}

// ---------------------------------------------------------------------------
// Stylesheet
// ---------------------------------------------------------------------------
function stylesheet(): string {
  return `/* Generated by Decupo site-build. Edit freely. */
/* Motion language: Premium. Base unit 400ms, ease cubic-bezier(.4,0,.2,1), no overshoot.
   One hero cascade on load, slow aurora as texture, scroll reveals on headings only. */
:root {
  --navy: #0b1f3a;
  --navy-deep: #071527;
  --porcelain: #f4f6f8;
  --paper: #ffffff;
  --ink: #121826;
  --muted: #5b6475;
  --line: #dde3ea;
  --cobalt: #2f5bea;
  --cobalt-deep: #1e43c4;
  --mint: #bff3e0;
  --on-navy: #f4f6f8;
  --on-navy-muted: rgba(244, 246, 248, 0.72);
  --radius-l: 22px;
  --radius-m: 14px;
  --radius-s: 10px;
  --max: 1120px;
  --gutter: clamp(20px, 4vw, 40px);
  --ease: cubic-bezier(0.4, 0, 0.2, 1);
  --t: 400ms;
  --t-fast: 200ms;
  --t-slow: 800ms;
  --font-display: "Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif;
  --font-body: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  font-family: var(--font-body);
  font-size: 1.0625rem;
  line-height: 1.6;
  color: var(--ink);
  background: var(--porcelain);
  display: flex;
  min-height: 100vh;
  flex-direction: column;
}
h1, h2, h3 { font-family: var(--font-display); font-weight: 500; letter-spacing: -0.015em; margin: 0; text-wrap: balance; }
h1 { font-size: clamp(2.6rem, 7vw, 5.25rem); line-height: 0.98; }
h2 { font-size: clamp(1.9rem, 3.6vw, 2.75rem); line-height: 1.1; }
h3 { font-size: 1.3rem; line-height: 1.25; }
p { margin: 0; }
a { color: inherit; }
:focus-visible { outline: 3px solid var(--cobalt); outline-offset: 3px; border-radius: 4px; }

/* Skip link */
.skip-link { position: absolute; left: -999px; top: 12px; background: var(--ink); color: #fff; padding: 10px 14px; border-radius: var(--radius-s); z-index: 20; }
.skip-link:focus { left: 12px; }

/* Masthead: navy band shared by every page */
.masthead { position: relative; background: var(--navy); color: var(--on-navy); overflow: hidden; isolation: isolate; }
.aurora {
  position: absolute; inset: -30% -10%; z-index: -1; pointer-events: none;
  background:
    radial-gradient(40% 50% at 15% 30%, rgba(47, 91, 234, 0.55), transparent 70%),
    radial-gradient(35% 45% at 80% 20%, rgba(191, 243, 224, 0.28), transparent 70%),
    radial-gradient(45% 55% at 70% 85%, rgba(30, 67, 196, 0.5), transparent 70%);
  filter: blur(40px);
  animation: aurora 22s var(--ease) infinite alternate;
}
.site-header {
  width: 100%; max-width: var(--max); margin: 0 auto; padding: 22px var(--gutter);
  display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
}
.brand { display: inline-flex; align-items: center; gap: 10px; font-family: var(--font-display); font-size: 1.25rem; text-decoration: none; }
.logo { color: var(--mint); }
.site-nav ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 2px 6px; }
.site-nav a {
  position: relative; display: inline-block; padding: 8px 12px; border-radius: 999px;
  color: var(--on-navy-muted); text-decoration: none; font-size: 0.95rem; font-weight: 500;
  transition: color var(--t-fast) var(--ease), background-color var(--t-fast) var(--ease);
}
.site-nav a:hover, .site-nav a:focus-visible { color: var(--on-navy); background: rgba(255, 255, 255, 0.08); }
.site-nav a[aria-current="page"] { color: var(--navy); background: var(--mint); }

/* Hero (home) */
.hero {
  width: 100%; max-width: var(--max); margin: 0 auto; padding: clamp(40px, 7vw, 96px) var(--gutter) clamp(48px, 7vw, 88px);
  display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr); gap: clamp(24px, 5vw, 64px); align-items: center;
}
.hero-copy > * { animation: rise var(--t-slow) var(--ease) both; }
.hero-copy > :nth-child(1) { animation-delay: 60ms; }
.hero-copy > :nth-child(2) { animation-delay: 140ms; }
.hero-copy > :nth-child(3) { animation-delay: 220ms; }
.hero-copy > :nth-child(4) { animation-delay: 300ms; }
.hero .lead, .page-hero .lead { margin-top: 20px; font-size: clamp(1.15rem, 1.8vw, 1.45rem); line-height: 1.45; color: var(--on-navy-muted); max-width: 34ch; }
.hero-actions { margin-top: 32px; display: flex; flex-wrap: wrap; gap: 12px; }
.hero-art { display: flex; justify-content: center; animation: fade var(--t-slow) var(--ease) 240ms both; }
.hero-svg { width: min(100%, 420px); height: auto; }
.hero-rings { transform-origin: 240px 240px; animation: spin 90s linear infinite; }
.hero-orb { transform-origin: 240px 240px; animation: spin 18s linear infinite; }
.hero-arc { stroke-dasharray: 300; stroke-dashoffset: 300; animation: draw 1.4s var(--ease) 500ms forwards; }

/* Page hero (inner pages) */
.page-hero { width: 100%; max-width: var(--max); margin: 0 auto; padding: clamp(32px, 6vw, 72px) var(--gutter) clamp(40px, 6vw, 64px); }
.page-hero > * { animation: rise var(--t-slow) var(--ease) both; }
.page-hero > :nth-child(2) { animation-delay: 80ms; }
.page-hero > :nth-child(3) { animation-delay: 160ms; }
.page-hero h1 { font-size: clamp(2.2rem, 5vw, 3.75rem); max-width: 18ch; }

/* Marquee strip */
.marquee {
  display: flex; overflow: hidden; border-top: 1px solid rgba(255, 255, 255, 0.12);
  mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
}
.marquee:hover .marquee-track, .marquee:focus-within .marquee-track { animation-play-state: paused; }
.marquee-track {
  flex: none; display: flex; list-style: none; margin: 0; padding: 14px 0; gap: 0; min-width: 100%;
  animation: marquee 32s linear infinite;
}
.marquee-track li { flex: none; padding: 0 28px; font-family: var(--font-display); font-size: 1.05rem; color: var(--on-navy-muted); position: relative; }
.marquee-track li + li::before { content: ""; position: absolute; left: -3px; top: 50%; width: 6px; height: 6px; margin-top: -3px; border-radius: 50%; background: var(--mint); opacity: 0.7; }
.marquee-track a { text-decoration: none; }
.marquee-track a:hover { color: var(--on-navy); text-decoration: underline; text-underline-offset: 4px; }

/* Buttons */
.button {
  position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 8px; overflow: hidden;
  padding: 14px 24px; border-radius: 999px; font: 600 1rem var(--font-body); text-decoration: none; cursor: pointer; border: 1px solid transparent;
  transition: transform var(--t) var(--ease), box-shadow var(--t) var(--ease), background-color var(--t) var(--ease), color var(--t) var(--ease);
}
.button > span { position: relative; }
.button-primary { background: var(--cobalt); color: #fff; box-shadow: 0 10px 30px -12px rgba(47, 91, 234, 0.8); }
.button-primary::after {
  content: ""; position: absolute; inset: 0; transform: translateX(-120%) skewX(-18deg);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.32), transparent);
  transition: transform var(--t-slow) var(--ease);
}
.button-primary:hover::after, .button-primary:focus-visible::after { transform: translateX(120%) skewX(-18deg); }
.button-primary:hover, .button-primary:focus-visible { background: var(--cobalt-deep); transform: translateY(-1px); box-shadow: 0 16px 36px -14px rgba(47, 91, 234, 0.9); }
.button-ghost { color: var(--on-navy); border-color: rgba(255, 255, 255, 0.28); background: transparent; }
.button-ghost:hover, .button-ghost:focus-visible { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.5); }
main .button-ghost { color: var(--ink); border-color: var(--line); }
.button[disabled] { opacity: 0.55; cursor: not-allowed; transform: none; box-shadow: none; }
.button[disabled]::after { display: none; }

/* Content sections */
main { flex: 1; width: 100%; }
.section { width: 100%; max-width: var(--max); margin: 0 auto; padding: clamp(56px, 8vw, 104px) var(--gutter) 0; }
.section > h2 { max-width: 20ch; margin-bottom: clamp(24px, 4vw, 40px); }
.section-intro { color: var(--muted); max-width: 58ch; margin: -8px 0 28px; font-size: 1.1rem; }
.prose { max-width: 66ch; display: grid; gap: 18px; font-size: 1.125rem; line-height: 1.7; }
.draft-note {
  margin-top: 28px; display: inline-flex; align-items: center; gap: 10px; padding: 8px 14px; border-radius: 999px;
  font-size: 0.9rem; color: var(--on-navy); background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.18);
}
.draft-note::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--mint); flex: none; }

/* Bento grid with spotlight borders */
.bento { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); grid-auto-rows: minmax(190px, auto); grid-auto-flow: dense; }
.tile {
  position: relative; display: flex; flex-direction: column; gap: 12px; padding: 26px; border-radius: var(--radius-l);
  background: var(--paper); border: 1px solid var(--line);
  transition: transform var(--t) var(--ease), box-shadow var(--t) var(--ease), border-color var(--t) var(--ease);
}
.tile::before {
  content: ""; position: absolute; inset: -1px; border-radius: inherit; padding: 1px; pointer-events: none; opacity: 0;
  background: linear-gradient(135deg, var(--cobalt), var(--mint) 60%, transparent);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude;
  transition: opacity var(--t) var(--ease);
}
.tile:hover { transform: translateY(-3px); box-shadow: 0 24px 48px -28px rgba(11, 31, 58, 0.45); }
.tile:hover::before { opacity: 1; }
.tile-wide { grid-column: span 2; }
.tile-tall { grid-row: span 2; }
.tile-icon { display: inline-grid; place-items: center; width: 42px; height: 42px; border-radius: 12px; background: var(--porcelain); color: var(--cobalt); }
.tile h3 { margin-top: auto; }
.tile p { color: var(--muted); }

/* Plain cards */
.cards { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.card { background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius-m); padding: 24px; display: grid; gap: 8px; align-content: start; }
.card p { color: var(--muted); }

/* Steps (a genuine sequence) */
.steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); counter-reset: step; }
.step { display: flex; gap: 18px; align-items: flex-start; padding: 22px 22px 22px 18px; border-radius: var(--radius-m); background: var(--paper); border: 1px solid var(--line); }
.step-number { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: var(--navy); color: var(--mint); font-family: var(--font-display); font-size: 1.15rem; }
.step h3 { margin-bottom: 6px; }
.step p { color: var(--muted); }

/* FAQ accordion (native details, animated chevron) */
.faq { border-top: 1px solid var(--line); }
.faq:last-of-type { border-bottom: 1px solid var(--line); }
.faq summary {
  list-style: none; cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 16px;
  padding: 20px 4px; font-family: var(--font-display); font-size: 1.25rem;
}
.faq summary::-webkit-details-marker { display: none; }
.faq-chevron { display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; color: var(--cobalt); background: var(--paper); border: 1px solid var(--line); transition: transform var(--t) var(--ease), background-color var(--t) var(--ease), color var(--t) var(--ease); }
.faq[open] .faq-chevron { transform: rotate(180deg); background: var(--cobalt); color: #fff; }
.faq p { padding: 0 4px 22px; color: var(--muted); max-width: 64ch; animation: rise var(--t) var(--ease) both; }

/* Pricing tiers */
.tiers { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); align-items: stretch; }
.tier { position: relative; background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius-l); padding: 28px; display: grid; gap: 10px; align-content: start; transition: transform var(--t) var(--ease), box-shadow var(--t) var(--ease); }
.tier:hover { transform: translateY(-3px); box-shadow: 0 24px 48px -28px rgba(11, 31, 58, 0.4); }
.tier-featured { background: var(--navy); color: var(--on-navy); border-color: var(--navy); }
.tier-featured p, .tier-featured .price { color: var(--on-navy); }
.tier-featured .tier-points li { color: var(--on-navy-muted); }
.tier-featured .tier-points svg { color: var(--mint); }
.tier-flag { position: absolute; top: 18px; right: 18px; font-size: 0.8rem; font-weight: 600; padding: 4px 10px; border-radius: 999px; background: var(--mint); color: var(--navy); }
.tier h3 { font-size: 1.6rem; }
.price { font-weight: 600; color: var(--ink); }
.tier > p:not(.price) { color: var(--muted); }
.tier-points { list-style: none; margin: 10px 0 0; padding: 14px 0 0; border-top: 1px solid rgba(128, 140, 160, 0.25); display: grid; gap: 10px; }
.tier-points li { display: flex; gap: 10px; align-items: center; color: var(--muted); }
.tier-points svg { color: var(--cobalt); flex: none; }

/* CTA band */
.cta-band {
  position: relative; overflow: hidden; isolation: isolate; width: min(100% - 2 * var(--gutter), var(--max)); margin: clamp(56px, 8vw, 104px) auto;
  padding: clamp(36px, 6vw, 64px); border-radius: var(--radius-l); background: var(--navy); color: var(--on-navy); display: grid; gap: 14px; justify-items: start;
}
.cta-band p { color: var(--on-navy-muted); max-width: 52ch; font-size: 1.1rem; }
.cta-band .button { margin-top: 10px; }
.cta-glow { position: absolute; inset: auto -10% -60% auto; width: 60%; aspect-ratio: 1; border-radius: 50%; z-index: -1; background: radial-gradient(closest-side, rgba(47, 91, 234, 0.7), transparent); filter: blur(30px); animation: pulse 9s var(--ease) infinite alternate; }

/* Contact */
.contact-grid { display: grid; gap: clamp(28px, 5vw, 64px); grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); padding-bottom: clamp(56px, 8vw, 104px); }
.contact-aside h2 { margin-bottom: 14px; }
.contact-points { list-style: none; margin: 28px 0 0; padding: 0; display: grid; gap: 14px; color: var(--muted); }
.contact-points li { display: flex; gap: 12px; align-items: center; }
.contact-points svg { color: var(--cobalt); flex: none; }
.contact-form { display: grid; gap: 16px; background: var(--paper); border: 1px solid var(--line); border-radius: var(--radius-l); padding: clamp(22px, 3vw, 32px); align-self: start; }
.form-notice { font-size: 0.95rem; color: var(--muted); padding: 10px 14px; border-radius: var(--radius-s); background: var(--porcelain); border: 1px dashed var(--line); }
.field { position: relative; }
.field input, .field textarea {
  width: 100%; font: inherit; padding: 22px 14px 10px; border: 1px solid var(--line); border-radius: var(--radius-s); background: var(--paper); color: var(--ink);
  transition: border-color var(--t-fast) var(--ease), box-shadow var(--t-fast) var(--ease);
}
.field textarea { resize: vertical; min-height: 140px; }
.field label {
  position: absolute; left: 14px; top: 16px; color: var(--muted); pointer-events: none; transform-origin: left top;
  transition: transform var(--t-fast) var(--ease), color var(--t-fast) var(--ease);
}
.field input:focus, .field textarea:focus { outline: none; border-color: var(--cobalt); box-shadow: 0 0 0 4px rgba(47, 91, 234, 0.15); }
.field input:focus + label, .field input:not(:placeholder-shown) + label,
.field textarea:focus + label, .field textarea:not(:placeholder-shown) + label { transform: translateY(-10px) scale(0.78); color: var(--cobalt); }

/* Footer */
.site-footer { background: var(--navy-deep); color: var(--on-navy-muted); margin-top: auto; }
.footer-inner { width: 100%; max-width: var(--max); margin: 0 auto; padding: 36px var(--gutter) 40px; display: grid; gap: 20px; grid-template-columns: 1fr auto; align-items: center; }
.site-footer .brand { color: var(--on-navy); }
.site-footer nav ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 20px; }
.site-footer a { text-decoration: none; }
.site-footer nav a:hover { color: var(--on-navy); text-decoration: underline; text-underline-offset: 4px; }
.legal { grid-column: 1 / -1; font-size: 0.9rem; border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 18px; }

/* Scroll-driven reveal for section headings (progressive enhancement) */
@supports (animation-timeline: view()) {
  .reveal { animation: rise var(--t) var(--ease) both; animation-timeline: view(); animation-range: entry 0% entry 35%; }
}

/* Keyframes */
@keyframes rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes aurora { from { transform: translate3d(-4%, -2%, 0) scale(1); } to { transform: translate3d(4%, 3%, 0) scale(1.08); } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes draw { to { stroke-dashoffset: 0; } }
@keyframes marquee { to { transform: translateX(-100%); } }
@keyframes pulse { from { transform: scale(0.9); opacity: 0.8; } to { transform: scale(1.1); opacity: 1; } }

/* Responsive */
@media (max-width: 900px) {
  .hero { grid-template-columns: 1fr; }
  .hero-art { order: -1; }
  .hero-svg { width: min(60%, 280px); }
  .tile-wide { grid-column: span 1; }
  .tile-tall { grid-row: span 1; }
}
@media (max-width: 640px) {
  .site-header { flex-direction: column; align-items: flex-start; }
  .site-nav ul { gap: 0; }
  .site-nav a { padding: 6px 10px; font-size: 0.9rem; }
  .hero-actions .button { width: 100%; }
  .footer-inner { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
  .hero-arc { stroke-dashoffset: 0; }
  .marquee-track { animation: none; }
  .aurora { animation: none; }
}
`;
}
