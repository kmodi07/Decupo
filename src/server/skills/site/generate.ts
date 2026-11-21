/**
 * Template-based static site generator (backlog B-21).
 *
 * Pure and deterministic: no network, no LLM, no user-provided code is ever
 * executed. The output is a flat file tree (index.html, one page per sitemap
 * entry, styles.css) that works from any directory because every link is
 * relative. Copy comes from the brand brief when it has real sections and from
 * honest, clearly labelled draft text otherwise; nothing is invented (no fake
 * prices, testimonials or statistics).
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

function firstSentence(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const plain = s
    .replace(/^[-*>]\s+/gm, "")
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(plain);
  return (m?.[1] ?? plain).slice(0, 160);
}

function paragraphs(md: string | undefined, fallback: string[]): string[] {
  if (!md) return fallback;
  const paras = md
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^[-*>]\s+/gm, "").replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return paras.length ? paras.slice(0, 3) : fallback;
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

export function generateSite(spec: SiteSpec): SiteFile[] {
  const pages = normalisePages(spec.pages);
  const brand = spec.brandName.trim() || "Your Business";
  const tagline = spec.tagline?.trim() || firstSentence(spec.brief?.positioning) || `A new home on the web for ${brand}.`;
  const description = firstSentence(spec.brief?.audience) ? `${tagline} Made for ${lowerFirst(firstSentence(spec.brief?.audience)!)}` : tagline;
  const nav = pages.map((p) => `<li><a href="${p.file}">${escapeHtml(p.title)}</a></li>`).join("");
  const contact = pages.find((p) => p.kind === "contact");
  const ctaHref = contact ? contact.file : (pages[0]?.file ?? "index.html");
  const ctaLabel = contact ? "Get in touch" : "Learn more";
  const draftComment = spec.offline
    ? "<!-- Draft copy: generated offline from templates (no language model was connected). Replace the text before publishing. -->\n"
    : "<!-- Generated by Decupo. Copy derived from the brand brief; review before publishing. -->\n";

  const files: SiteFile[] = pages.map((p) => {
    const body = renderPage(p, { brand, tagline, goal: spec.goal, brief: spec.brief ?? {}, ctaHref, ctaLabel, pages, offline: spec.offline });
    const pageTitle = p.kind === "home" ? `${brand} - ${tagline}` : `${p.title} - ${brand}`;
    const html = [
      "<!doctype html>",
      '<html lang="en">',
      "<head>",
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>${escapeHtml(pageTitle)}</title>`,
      `<meta name="description" content="${escapeHtml(description)}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:site_name" content="${escapeHtml(brand)}">`,
      `<meta property="og:title" content="${escapeHtml(pageTitle)}">`,
      `<meta property="og:description" content="${escapeHtml(description)}">`,
      `<meta name="twitter:card" content="summary">`,
      `<meta name="generator" content="Decupo site-build">`,
      '<link rel="stylesheet" href="styles.css">',
      "</head>",
      "<body>",
      draftComment.trimEnd(),
      '<a class="skip-link" href="#main">Skip to content</a>',
      "<header class=\"site-header\">",
      `<a class="brand" href="index.html" aria-label="${escapeHtml(brand)} home">${logoMark()}<span>${escapeHtml(brand)}</span></a>`,
      `<nav class="site-nav" aria-label="Main"><ul>${nav}</ul></nav>`,
      "</header>",
      `<main id="main" class="page page-${p.kind}">`,
      body,
      "</main>",
      "<footer class=\"site-footer\">",
      `<p>&copy; <span class="year">${new Date().getUTCFullYear()}</span> ${escapeHtml(brand)}. All rights reserved.</p>`,
      `<nav aria-label="Footer"><ul>${nav}</ul></nav>`,
      "</footer>",
      "</body>",
      "</html>",
      "",
    ].join("\n");
    return { path: p.file, kind: "html", content: html };
  });

  files.push({ path: "styles.css", kind: "css", content: stylesheet() });
  return files;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1).replace(/[.!?]$/, ".");
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

const draftNote = (c: RenderCtx) =>
  c.offline ? `<p class="draft-note" role="note">Draft copy. Written from templates without a connected language model; replace before publishing.</p>` : "";

function renderPage(page: NormPage, c: RenderCtx): string {
  const e = escapeHtml;
  const cta = `<a class="button" href="${c.ctaHref}">${e(c.ctaLabel)}</a>`;
  switch (page.kind) {
    case "home": {
      const intro = paragraphs(c.brief.positioning, [`${c.brand} is getting a new website. This draft was generated for the goal: "${c.goal}".`]);
      const audience = paragraphs(c.brief.audience, ["Tell us who you serve and this section will speak to them directly."]);
      return [
        `<section class="hero">`,
        `<h1>${e(c.brand)}</h1>`,
        `<p class="lead">${e(c.tagline)}</p>`,
        cta,
        draftNote(c),
        `</section>`,
        `<section class="features" aria-labelledby="why">`,
        `<h2 id="why">Why ${e(c.brand)}</h2>`,
        `<div class="cards">`,
        card("Who we are", intro[0]!),
        card("Who we serve", audience[0]!),
        card("How to reach us", "Use the contact page to start a conversation. We reply to every message."),
        `</div>`,
        `</section>`,
      ].join("\n");
    }
    case "about": {
      const story = paragraphs(c.brief.positioning, [
        `${c.brand} was set up with a clear goal: ${lowerFirst(c.goal)}`,
        "This page tells the story behind the business, the people involved and what they stand for. Replace this draft with your own words.",
      ]);
      const voice = paragraphs(c.brief.voice, ["Clear, warm and direct."]);
      return [
        `<section class="prose">`,
        `<h1>About ${e(c.brand)}</h1>`,
        draftNote(c),
        ...story.map((p) => `<p>${e(p)}</p>`),
        `<h2>How we work</h2>`,
        `<p>${e(voice[0]!)}</p>`,
        cta,
        `</section>`,
      ].join("\n");
    }
    case "services": {
      return [
        `<section class="prose">`,
        `<h1>Services</h1>`,
        `<p class="lead">What ${e(c.brand)} offers.</p>`,
        draftNote(c),
        `<div class="cards">`,
        card("Core service", "Describe the main thing you do and the outcome a customer gets."),
        card("Second service", "A complementary offer, or the next step customers usually take."),
        card("Support", "How you look after customers after the work is done."),
        `</div>`,
        cta,
        `</section>`,
      ].join("\n");
    }
    case "pricing": {
      return [
        `<section class="prose">`,
        `<h1>Pricing</h1>`,
        `<p class="lead">Simple, transparent pricing. Figures are not filled in yet, so none are shown.</p>`,
        draftNote(c),
        `<div class="cards tiers">`,
        tier("Starter", "For getting going."),
        tier("Standard", "For most customers."),
        tier("Premium", "For bigger needs."),
        `</div>`,
        `<p>Ask for a quote and we will confirm prices in writing before any work starts.</p>`,
        cta,
        `</section>`,
      ].join("\n");
    }
    case "contact": {
      return [
        `<section class="prose">`,
        `<h1>Contact ${e(c.brand)}</h1>`,
        `<p class="lead">Send a message and we will get back to you.</p>`,
        draftNote(c),
        `<form class="contact-form" method="post" aria-describedby="form-status">`,
        `<p id="form-status" class="form-notice" role="status">${e(CONTACT_FORM_NOTICE)}</p>`,
        `<div class="field"><label for="name">Your name</label><input id="name" name="name" type="text" autocomplete="name" required></div>`,
        `<div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>`,
        `<div class="field"><label for="message">Message</label><textarea id="message" name="message" rows="5" required></textarea></div>`,
        `<button class="button" type="submit" disabled aria-disabled="true">Send (not connected yet)</button>`,
        `</form>`,
        `</section>`,
      ].join("\n");
    }
    default:
      return [
        `<section class="prose">`,
        `<h1>${e(page.title)}</h1>`,
        draftNote(c),
        `<p>This page was listed in the sitemap but has no outline yet. Add the sections you want here.</p>`,
        cta,
        `</section>`,
      ].join("\n");
  }
}

function card(title: string, body: string): string {
  return `<article class="card"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></article>`;
}

function tier(name: string, body: string): string {
  return `<article class="card tier"><h3>${escapeHtml(name)}</h3><p class="price">Price to be confirmed</p><p>${escapeHtml(body)}</p></article>`;
}

function logoMark(): string {
  return '<svg class="logo" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" focusable="false"><circle cx="14" cy="14" r="12" fill="currentColor" opacity="0.15"/><circle cx="14" cy="14" r="6" fill="currentColor"/></svg>';
}

function stylesheet(): string {
  return `/* Generated by Decupo site-build. Edit freely. */
:root {
  --bg: #fffaf4;
  --surface: #ffffff;
  --ink: #1d1b2c;
  --muted: #5d5a6e;
  --line: #e7e1d8;
  --accent: #ff6f61;
  --accent-ink: #1d1b2c;
  --radius: 14px;
  --max: 1080px;
  font-size: 16px;
}
*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  line-height: 1.6;
  color: var(--ink);
  background: var(--bg);
  display: flex;
  min-height: 100vh;
  flex-direction: column;
}
.skip-link { position: absolute; left: -999px; top: 8px; background: var(--ink); color: #fff; padding: 8px 12px; border-radius: 8px; }
.skip-link:focus { left: 8px; z-index: 10; }
.site-header, .site-footer { width: 100%; max-width: var(--max); margin: 0 auto; padding: 16px 20px; }
.site-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.brand { display: inline-flex; align-items: center; gap: 10px; font-weight: 700; font-size: 1.15rem; color: var(--ink); text-decoration: none; }
.logo { color: var(--accent); }
.site-nav ul, .site-footer ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 18px; }
.site-nav a, .site-footer a { color: var(--muted); text-decoration: none; font-weight: 500; padding: 6px 0; display: inline-block; }
.site-nav a:hover, .site-nav a:focus-visible, .site-footer a:hover { color: var(--ink); text-decoration: underline; }
main { flex: 1; width: 100%; max-width: var(--max); margin: 0 auto; padding: 24px 20px 56px; }
h1 { font-size: clamp(2rem, 5vw, 3.2rem); line-height: 1.1; letter-spacing: -0.02em; margin: 0 0 12px; }
h2 { font-size: clamp(1.4rem, 3vw, 1.9rem); margin: 32px 0 12px; }
h3 { font-size: 1.1rem; margin: 0 0 6px; }
p { margin: 0 0 14px; }
.lead { font-size: 1.2rem; color: var(--muted); max-width: 60ch; }
.hero { padding: 40px 0 24px; }
.button {
  display: inline-block; background: var(--accent); color: var(--accent-ink); font-weight: 700;
  padding: 12px 20px; border-radius: 999px; text-decoration: none; border: 0; cursor: pointer; font-size: 1rem;
}
.button:hover, .button:focus-visible { filter: brightness(0.95); }
.button[disabled] { opacity: 0.55; cursor: not-allowed; }
.cards { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); margin: 16px 0 24px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px; }
.card p { margin: 0; color: var(--muted); }
.tier .price { font-weight: 700; color: var(--ink); margin-bottom: 8px; }
.prose { max-width: 72ch; }
.draft-note, .form-notice {
  background: #fff3cd; border: 1px solid #f1d58a; color: #5c4400; border-radius: 10px; padding: 10px 12px; font-size: 0.95rem;
}
.contact-form { display: grid; gap: 14px; max-width: 520px; margin-top: 16px; }
.field { display: grid; gap: 6px; }
.field label { font-weight: 600; }
.field input, .field textarea {
  width: 100%; font: inherit; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink);
}
.field input:focus, .field textarea:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
.site-footer { border-top: 1px solid var(--line); color: var(--muted); font-size: 0.95rem; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; }
@media (max-width: 640px) {
  .site-header { flex-direction: column; align-items: flex-start; }
  main { padding: 16px 16px 40px; }
  .hero { padding: 16px 0; }
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
`;
}
