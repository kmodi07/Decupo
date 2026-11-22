/**
 * Template-based static site generator (backlog B-21).
 *
 * Pure and deterministic: no network, no LLM, no user-provided code is ever
 * executed. The output is a flat file tree (index.html, one page per sitemap
 * entry, styles.css) that works from any directory because every link is
 * relative. Nothing is invented (no fake prices, testimonials or statistics).
 *
 * Every site is built for a business archetype (see ./archetype.ts): a
 * tutoring company and an electronics shop get different hero layouts, logo
 * marks, cursors, page textures, motion tempos and copy. The brand brief
 * contributes the positioning sentence and the audience; its internal notes
 * (voice rules, visual direction, what to decide next) never reach a page.
 *
 * Motion is CSS-only because the preview serves pages with `script-src
 * 'none'`, and everything is off under `prefers-reduced-motion`.
 */

import { ARCHETYPES, detectArchetype, fill, type Archetype, type CursorStyle, type HeroLayout, type MarkStyle, type MotionTempo, type Texture } from "./archetype";
import { deriveTheme, SHAPE_RADII, TYPE_STACKS, type SiteTheme } from "./theme";

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
  /** Optional short tagline; derived from the archetype when omitted. */
  tagline?: string;
  /** The user's answer to "Any colours or a look you have in mind?". */
  look?: string;
  /** The user's tone hint from the plan questions. */
  tone?: string;
  /** The user's answer to "Who is the site for?". Falls back to the brief's audience. */
  audience?: string;
  /** What the business sells, if the user said. Helps pick the archetype. */
  products?: string;
  /** Town or area, if known. */
  place?: string;
  /** Pre-derived theme; when omitted it is derived from look, brief, tone and goal. */
  theme?: SiteTheme;
  /** Pre-chosen archetype; when omitted it is detected from the goal and answers. */
  archetype?: Archetype;
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
 * when the brief has no sections, so templates fall back to archetype copy.
 */
export function parseBrief(markdown: string): BriefSections {
  const out: BriefSections = {};
  const chunks = markdown.split(/^##\s+/m).slice(1);
  for (const chunk of chunks) {
    const nl = chunk.indexOf("\n");
    const heading = (nl === -1 ? chunk : chunk.slice(0, nl)).trim().toLowerCase();
    const body = (nl === -1 ? "" : chunk.slice(nl + 1)).trim();
    if (!body) continue;
    if (heading.startsWith("positioning")) out.positioning = body;
    else if (heading.startsWith("audience")) out.audience = body;
    else if (heading.startsWith("voice")) out.voice = body;
    else if (heading.startsWith("visual")) out.visual = body;
  }
  return out;
}

/** Best-effort brand name from a goal such as "Build a website for my tutoring company". */
export function brandNameFromGoal(goal: string): string {
  const g = goal.trim();
  const named = /\b(?:called|named)\s+"?([^".,]+?)"?\s*(?:[.,!]|$)/i.exec(g)?.[1]?.trim();
  if (named) return titleCase(named);
  // "Help Sri Ganesh Agency in Bharuch sell more": a capitalised name after a verb.
  const proper = /^(?:[Hh]elp|[Gg]row|[Pp]romote|[Mm]arket|[Bb]uild (?:a )?(?:website|site) for)\s+((?:[A-Z][\w&'-]*)(?:\s+(?:[A-Z][\w&'-]*|&|and|of))*?)\s+(?:in|at|near|sell|get|find|reach|grow|to)\b/.exec(g)?.[1]?.trim();
  if (proper && proper.split(/\s+/).length <= 5) return proper;
  const m = /\bfor\s+(?:my|our|a|an|the)?\s*([a-z0-9][a-z0-9' &-]{1,60}?)\s*(?:[.,!]|$)/i.exec(g);
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

function firstParagraph(md: string | undefined): string | undefined {
  if (!md) return undefined;
  const para = md
    .split(/\n\s*\n/)
    .map(plainText)
    .find(Boolean);
  return para?.slice(0, 240);
}

function sentenceCase(s: string): string {
  const t = s.trim().replace(/[.!?]+$/, "");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) + "." : "";
}

/** Brief text that merely echoes the goal or carries brief-only notes is not site copy. */
function usablePositioning(p: string | undefined, goal: string): string | undefined {
  if (!p) return undefined;
  const lower = p.toLowerCase();
  const g = goal.trim().replace(/[.!?]+$/, "").toLowerCase();
  if (g && lower.includes(g)) return undefined;
  if (/what to decide next|not been stated|see audience/.test(lower)) return undefined;
  return p;
}

type PageKind = "home" | "about" | "services" | "pricing" | "contact" | "generic";

function classify(title: string, path: string): PageKind {
  const t = `${title} ${path}`.toLowerCase();
  if (path.trim() === "/" || /\bhome\b|\bindex\b/.test(t)) return "home";
  if (/about|story|team/.test(t)) return "about";
  if (/service|offer|product|what we do|menu|collection/.test(t)) return "services";
  if (/pric|plan|rate|fees?/.test(t)) return "pricing";
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
  out.sort((a, b) => Number(b.file === "index.html") - Number(a.file === "index.html"));
  return out;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
type RenderCtx = {
  brand: string;
  initial: string;
  headline: string;
  tagline: string;
  purpose: string;
  positioning?: string;
  audience?: string;
  goal: string;
  ctaHref: string;
  ctaLabel: string;
  secondaryHref?: string;
  secondaryLabel: string;
  pages: NormPage[];
  theme: SiteTheme;
  a: Archetype;
};

const e = escapeHtml;

export function generateSite(spec: SiteSpec): SiteFile[] {
  const pages = normalisePages(spec.pages);
  const brand = spec.brandName.trim() || "Your Business";
  const a = spec.archetype ?? detectArchetype({ goal: spec.goal, brandName: brand, products: spec.products, audience: spec.audience });
  const theme = spec.theme ?? deriveTheme({ look: spec.look, visual: spec.brief?.visual, tone: spec.tone, goal: spec.goal, fallback: a.defaults });
  const audience = spec.audience?.trim() || firstParagraph(spec.brief?.audience);
  const audienceLine = audience && !/^not specified/i.test(audience) ? audience.replace(/[.!?]+$/, "") : undefined;
  const positioning = usablePositioning(firstParagraph(spec.brief?.positioning), spec.goal);
  const purpose = fill(a.purpose, { brand, place: spec.place ?? null });
  const headline = a.headline;
  const tagline = spec.tagline?.trim() || fill(a.tagline, { brand, audience: audienceLine ? `For ${lowerFirst(audienceLine)}.` : null });
  const contact = pages.find((p) => p.kind === "contact");
  const about = pages.find((p) => p.kind === "about");
  const services = pages.find((p) => p.kind === "services");
  const ctaHref = contact ? contact.file : (pages[0]?.file ?? "index.html");
  const ctaLabel = contact ? a.cta.primary : "Learn more";
  const secondary = services ?? about;
  const c: RenderCtx = {
    brand,
    initial: initialOf(brand),
    headline,
    tagline,
    purpose,
    positioning,
    audience: audienceLine,
    goal: spec.goal,
    ctaHref,
    ctaLabel,
    secondaryHref: secondary?.file,
    secondaryLabel: services ? a.cta.secondary : "Our story",
    pages,
    theme,
    a,
  };
  const description = [positioning ?? purpose, audienceLine ? `For ${lowerFirst(audienceLine)}.` : ""].filter(Boolean).join(" ").slice(0, 300);
  const generatedComment = `<!-- Generated by Decupo for ${a.label}. Review before publishing. -->`;

  const files: SiteFile[] = pages.map((p) => {
    const pageTitle = p.kind === "home" ? `${brand} - ${headline.replace(/[.!?]+$/, "")}` : `${p.title} - ${brand}`;
    const html = [
      "<!doctype html>",
      '<html lang="en">',
      "<head>",
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>${e(pageTitle)}</title>`,
      `<meta name="description" content="${e(description)}">`,
      `<meta name="theme-color" content="${theme.colors.brand}">`,
      '<meta property="og:type" content="website">',
      `<meta property="og:site_name" content="${e(brand)}">`,
      `<meta property="og:title" content="${e(pageTitle)}">`,
      `<meta property="og:description" content="${e(description)}">`,
      '<meta name="twitter:card" content="summary">',
      `<meta name="generator" content="Decupo site-build (${a.id})">`,
      '<link rel="stylesheet" href="styles.css">',
      "</head>",
      `<body class="page-${p.kind} arch-${a.id} layout-${a.hero}">`,
      generatedComment,
      '<a class="skip-link" href="#main">Skip to content</a>',
      '<div class="masthead">',
      '<div class="aurora" aria-hidden="true"></div>',
      '<header class="site-header">',
      `<a class="brand" href="index.html" aria-label="${e(brand)} home">${logoMark(a.mark, c.initial)}<span>${e(brand)}</span></a>`,
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

  files.push({ path: "styles.css", kind: "css", content: stylesheet(theme, a) });
  return files;
}

function initialOf(brand: string): string {
  const m = /[A-Za-z0-9]/.exec(brand);
  return m ? m[0]!.toUpperCase() : "";
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function navItems(pages: NormPage[], current: NormPage): string {
  return pages
    .map((p) => (p.file === current.file ? `<li><a href="${p.file}" aria-current="page">${e(p.title)}</a></li>` : `<li><a href="${p.file}">${e(p.title)}</a></li>`))
    .join("");
}

function buttons(c: RenderCtx): string {
  const primary = `<a class="button button-primary" href="${c.ctaHref}"><span>${e(c.ctaLabel)}</span></a>`;
  const secondary = c.secondaryHref ? `<a class="button button-ghost" href="${c.secondaryHref}">${e(c.secondaryLabel)}</a>` : "";
  return `<div class="hero-actions">${primary}${secondary}</div>`;
}

/** The band at the top of every page: the hero on home (one of four layouts), a page title elsewhere. */
function renderMasthead(page: NormPage, c: RenderCtx): string {
  if (page.kind === "home") return [renderHero(c), renderStrip(c)].join("\n");
  const intro: Record<Exclude<PageKind, "home">, string> = {
    about: c.positioning ?? c.purpose,
    services: `What ${c.brand} offers, and what you get at the end of it.`,
    pricing: c.a.pricingIntro.split(". ")[0] + ".",
    contact: "Tell us what you need. We reply to every message.",
    generic: `A page from the ${c.brand} site.`,
  };
  const heading = page.kind === "about" ? `About ${c.brand}` : page.kind === "contact" ? `Contact ${c.brand}` : page.title;
  return [
    '<section class="page-hero">',
    `<p class="eyebrow">${e(c.brand)}</p>`,
    `<h1>${e(heading)}</h1>`,
    `<p class="lead">${e(intro[page.kind])}</p>`,
    "</section>",
  ].join("\n");
}

function renderHero(c: RenderCtx): string {
  const { a } = c;
  switch (a.hero) {
    case "editorial":
      return [
        '<section class="hero hero-editorial">',
        `<p class="eyebrow">${e(c.brand)}<span class="eyebrow-sep" aria-hidden="true"></span>${e(a.label.replace(/^an? /, ""))}</p>`,
        `<h1>${e(c.headline)}</h1>`,
        '<div class="hero-row">',
        `<p class="lead">${e(c.tagline)}</p>`,
        buttons(c),
        "</div>",
        `<div class="hero-rule" aria-hidden="true">${heroLine(c.theme)}</div>`,
        "</section>",
      ].join("\n");
    case "poster":
      return [
        '<section class="hero hero-poster">',
        `<div class="hero-glow" aria-hidden="true">${heroGlow(c.theme)}</div>`,
        `<p class="eyebrow">${e(c.brand)}</p>`,
        `<h1>${e(c.headline)}</h1>`,
        `<p class="lead">${e(c.tagline)}</p>`,
        buttons(c),
        "</section>",
      ].join("\n");
    case "shelf":
      return [
        '<section class="hero hero-shelf">',
        '<div class="hero-copy">',
        `<p class="eyebrow">${e(c.brand)}</p>`,
        `<h1>${e(c.headline)}</h1>`,
        `<p class="lead">${e(c.tagline)}</p>`,
        buttons(c),
        "</div>",
        '<div class="hero-art shelf" aria-hidden="true">',
        heroGlow(c.theme),
        ...a.services.slice(0, 3).map((s, i) => `<div class="shelf-card shelf-card-${i + 1}"><span class="shelf-icon">${SHELF_ICONS[i]}</span><b>${e(s.title)}</b><span>${e(firstClause(s.body))}</span></div>`),
        "</div>",
        "</section>",
      ].join("\n");
    case "split":
    default:
      return [
        '<section class="hero hero-split">',
        '<div class="hero-copy">',
        `<p class="eyebrow">${e(c.brand)}</p>`,
        `<h1>${e(c.headline)}</h1>`,
        `<p class="lead">${e(c.tagline)}</p>`,
        buttons(c),
        "</div>",
        '<div class="hero-art" aria-hidden="true">',
        heroArt(c.theme, a.mark, c.initial),
        "</div>",
        "</section>",
      ].join("\n");
  }
}

function firstClause(s: string): string {
  const m = /^(.+?)[,.;](\s|$)/.exec(s);
  return (m?.[1] ?? s).slice(0, 60);
}

/** Slow, pausable strip under the hero built from the archetype's own words, so it is true to the business. */
function renderStrip(c: RenderCtx): string {
  const words = c.a.strip;
  if (words.length < 3) return "";
  const live = words.map((w) => `<li>${e(w)}</li>`).join("");
  return `<div class="marquee" aria-label="What ${e(c.brand)} does"><ul class="marquee-track">${live}</ul><ul class="marquee-track" aria-hidden="true">${live}</ul></div>`;
}

function renderBody(page: NormPage, c: RenderCtx): string {
  const { a } = c;
  const cta = `<a class="button button-primary" href="${c.ctaHref}"><span>${e(c.ctaLabel)}</span></a>`;
  switch (page.kind) {
    case "home": {
      const who = c.positioning ?? c.purpose;
      const tiles = [
        bentoTile("wide", "Who we are", who, iconSpark()),
        c.audience ? bentoTile("tall", "Who we serve", sentenceCase(c.audience), iconPeople()) : bentoTile("tall", a.reasons[0]!.title, a.reasons[0]!.body, iconPeople()),
        ...(c.audience ? a.reasons.slice(0, 2) : a.reasons.slice(1, 3)).map((r, i) => bentoTile("", r.title, r.body, i === 0 ? iconShield() : iconQuote())),
      ];
      return [
        section("why", `Why ${c.brand}`, ['<div class="bento">', ...tiles, "</div>"]),
        section("offer", "What we do", [
          '<div class="cards cards-3">',
          ...a.services.slice(0, 3).map((s) => card(s.title, s.body)),
          "</div>",
          c.pages.find((p) => p.kind === "services") ? `<p class="section-more"><a href="${c.pages.find((p) => p.kind === "services")!.file}">See everything we offer</a></p>` : "",
        ]),
        section("process", "How it works", ['<ol class="steps">', ...a.steps.map((s, i) => step(i + 1, s.title, s.body)), "</ol>"]),
        section("faq", "Questions people ask", a.faq.map((f) => faq(f.title, f.body))),
        ctaBand(c, cta),
      ].join("\n");
    }
    case "about": {
      const story = [c.positioning ?? c.purpose, c.audience ? `${c.brand} is for ${lowerFirst(c.audience)}, and every page and message speaks to them first.` : a.tagline.replace(/\s*\{audience\}/, "")];
      return [
        section("story", "The story", ['<div class="prose">', ...story.map((p) => `<p>${e(p)}</p>`), "</div>"]),
        section("values", "What we stand for", ['<div class="cards">', ...a.reasons.map((r) => card(r.title, r.body)), "</div>"]),
        ctaBand(c, cta),
      ].join("\n");
    }
    case "services": {
      const icons = [iconSpark(), iconLayers(), iconShield(), iconMail()];
      return [
        section("offer", `What ${c.brand} offers`, [
          '<div class="bento">',
          ...a.services.map((s, i) => bentoTile(i === 0 ? "wide" : i === 1 ? "tall" : "", s.title, s.body, icons[i]!)),
          "</div>",
        ]),
        ctaBand(c, cta),
      ].join("\n");
    }
    case "pricing": {
      return [
        section("tiers", "Choose a starting point", [
          `<p class="section-intro">${e(a.pricingIntro)}</p>`,
          '<div class="tiers">',
          ...a.tiers.map((t, i) => tier(t.name, t.body, t.points, i === 1)),
          "</div>",
        ]),
        ctaBand(c, cta, "Ask for a quote and we will confirm prices in writing before any work starts."),
      ].join("\n");
    }
    case "contact": {
      const icons = [iconMail(), iconPin(), iconClock()];
      return [
        '<section class="section contact-grid" aria-labelledby="contact-heading">',
        '<div class="contact-aside">',
        '<h2 id="contact-heading">Send a message</h2>',
        '<p class="section-intro">A few lines is enough. Say what you need and roughly when, and we will come back with a next step.</p>',
        '<ul class="contact-points">',
        ...a.contactPoints.map((p, i) => `<li>${icons[i] ?? iconSpark()}<span>${e(p)}</span></li>`),
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
        section("content", page.title, ['<div class="prose">', "<p>This page was listed in the sitemap but has no outline yet. Add the sections you want here.</p>", "</div>"]),
        ctaBand(c, cta),
      ].join("\n");
  }
}

function renderFooter(c: RenderCtx): string {
  const links = c.pages.map((p) => `<li><a href="${p.file}">${e(p.title)}</a></li>`).join("");
  return [
    '<footer class="site-footer">',
    '<div class="footer-inner">',
    `<a class="brand" href="index.html">${logoMark(c.a.mark, c.initial)}<span>${e(c.brand)}</span></a>`,
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
  return [`<section class="section" aria-labelledby="${id}-heading">`, `<h2 id="${id}-heading" class="reveal">${e(heading)}</h2>`, ...body.filter(Boolean), "</section>"].join("\n");
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

function ctaBand(c: RenderCtx, cta: string, note?: string): string {
  return [
    '<section class="cta-band" aria-labelledby="cta-heading">',
    '<div class="cta-glow" aria-hidden="true"></div>',
    `<h2 id="cta-heading">Ready when you are.</h2>`,
    `<p>${e(note ?? `Start a conversation with ${c.brand}. No forms to fight, no commitment.`)}</p>`,
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
const SHELF_ICONS = [svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 10h14M9 7h.01M9 14h.01"/>', 22), svg('<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/>', 22), svg('<path d="M3 9h18l-1.5 10h-15L3 9Z"/><path d="M8 9V6a4 4 0 0 1 8 0v3"/>', 22)];

/** A logo mark in the archetype's style with the brand's initial. */
function logoMark(style: MarkStyle, initial: string): string {
  const letter = initial ? `<text x="15" y="19.6" text-anchor="middle" font-family="inherit" font-size="13" font-weight="700" fill="currentColor">${e(initial)}</text>` : "";
  const shapes: Record<MarkStyle, string> = {
    ruled: `<rect x="2" y="2" width="26" height="26" rx="5" fill="currentColor" opacity="0.16"/><path d="M6 10h18M6 15h18M6 20h18" stroke="currentColor" stroke-width="1" opacity="0.45"/><rect x="2.5" y="2.5" width="25" height="25" rx="4.5" stroke="currentColor" stroke-width="1.5"/>`,
    chip: `<rect x="5" y="5" width="20" height="20" rx="4" fill="currentColor" opacity="0.16"/><rect x="5.5" y="5.5" width="19" height="19" rx="3.5" stroke="currentColor" stroke-width="1.5"/><path d="M10 2v3M15 2v3M20 2v3M10 25v3M15 25v3M20 25v3M2 10h3M2 15h3M2 20h3M25 10h3M25 15h3M25 20h3" stroke="currentColor" stroke-width="1.5"/>`,
    sack: `<path d="M8 11c-3 4-4 8-4 11a6 6 0 0 0 6 6h10a6 6 0 0 0 6-6c0-3-1-7-4-11Z" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.5"/><path d="M10 11c0-3 1-5 5-5s5 2 5 5" stroke="currentColor" stroke-width="1.5"/><path d="M8 11h14" stroke="currentColor" stroke-width="1.5"/>`,
    leaf: `<path d="M26 4C14 4 5 11 5 23c0 1 0 2 .3 3C17 27 26 19 26 4Z" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.5"/><path d="M6 26C10 19 16 13 23 8" stroke="currentColor" stroke-width="1.5"/>`,
    wheel: `<circle cx="15" cy="15" r="12" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.5"/><circle cx="15" cy="15" r="7.5" stroke="currentColor" stroke-width="1.2" opacity="0.7"/><path d="M15 3v24M3 15h24" stroke="currentColor" stroke-width="1" opacity="0.5"/>`,
    flame: `<path d="M15 3c2 5 8 8 8 15a8 8 0 0 1-16 0c0-4 2-6 3-8 1 2 2 3 3 3 0-4 1-7 2-10Z" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.5"/>`,
    petal: `<path d="M15 3c4 3 4 9 0 12-4-3-4-9 0-12ZM15 27c-4-3-4-9 0-12 4 3 4 9 0 12ZM3 15c3-4 9-4 12 0-3 4-9 4-12 0ZM27 15c-3 4-9 4-12 0 3-4 9-4 12 0Z" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.3"/>`,
    cross: `<path d="M11 3h8v8h8v8h-8v8h-8v-8H3v-8h8V3Z" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>`,
    bolt: `<path d="M15 2 26 8.5v13L15 28 4 21.5v-13L15 2Z" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M16 8 10 17h5l-1 6 6-9h-5l1-6Z" fill="currentColor"/>`,
    lens: `<circle cx="15" cy="15" r="12" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.5"/><circle cx="15" cy="15" r="6" stroke="currentColor" stroke-width="1.5"/><circle cx="20" cy="10" r="1.6" fill="currentColor"/>`,
    shield: `<path d="M15 3 26 7v8c0 6-4.5 10.5-11 12C8.5 25.5 4 21 4 15V7l11-4Z" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>`,
    grid: `<rect x="3" y="3" width="24" height="24" rx="5" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.5"/><path d="M11 3v24M19 3v24M3 11h24M3 19h24" stroke="currentColor" stroke-width="1" opacity="0.5"/>`,
    hex: `<path d="M15 2.5 26 9v12l-11 6.5L4 21V9l11-6.5Z" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>`,
    ring: `<circle cx="15" cy="15" r="12" fill="currentColor" opacity="0.16" stroke="currentColor" stroke-width="1.5"/>`,
  };
  const fill = style === "bolt" ? "" : letter;
  return `<svg class="logo" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true" focusable="false">${shapes[style]}${fill}</svg>`;
}

function gradientDefs(theme: SiteTheme): string {
  const { highlight, accent } = theme.colors;
  return `<defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${highlight}"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs>`;
}

/** Split layout: a large version of the mark orbited by the archetype's own geometry. */
function heroArt(theme: SiteTheme, mark: MarkStyle, initial: string): string {
  const letter = initial ? `<text x="240" y="268" text-anchor="middle" font-family="inherit" font-size="96" font-weight="700" fill="url(#g1)">${e(initial)}</text>` : "";
  const lines: Record<MarkStyle, string> = {
    ruled: '<path d="M90 150h300M90 200h300M90 250h300M90 300h300M90 350h300" stroke="rgba(255,255,255,0.16)" stroke-width="1.5"/>',
    chip: '<rect x="120" y="120" width="240" height="240" rx="28" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/><path d="M160 80v40M240 80v40M320 80v40M160 360v40M240 360v40M320 360v40M80 160h40M80 240h40M80 320h40M360 160h40M360 240h40M360 320h40" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>',
    sack: '<path d="M130 190c-40 60-50 110-50 140a70 70 0 0 0 70 70h180a70 70 0 0 0 70-70c0-30-10-80-50-140Z" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>',
    leaf: '<path d="M400 70C230 70 90 170 90 340c0 14 1 27 3 40C260 380 400 260 400 70Z" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>',
    wheel: '<circle cx="240" cy="240" r="200" stroke="rgba(255,255,255,0.16)" stroke-width="1.25"/><circle cx="240" cy="240" r="140" stroke="rgba(255,255,255,0.16)" stroke-width="1.25"/>',
    flame: '<path d="M240 60c30 80 130 120 130 230a130 130 0 0 1-260 0c0-60 30-90 50-120 10 30 30 50 50 50 0-60 10-110 30-160Z" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>',
    petal: '<circle cx="240" cy="240" r="190" stroke="rgba(255,255,255,0.14)"/><circle cx="240" cy="240" r="120" stroke="rgba(255,255,255,0.18)"/>',
    cross: '<path d="M180 60h120v120h120v120H300v120H180V300H60V180h120V60Z" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>',
    bolt: '<path d="M240 40 420 140v200L240 440 60 340V140L240 40Z" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>',
    lens: '<circle cx="240" cy="240" r="200" stroke="rgba(255,255,255,0.16)"/><circle cx="240" cy="240" r="110" stroke="rgba(255,255,255,0.2)"/>',
    shield: '<path d="M240 40 420 100v150c0 100-80 170-180 200C140 420 60 350 60 250V100l180-60Z" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>',
    grid: '<path d="M80 80h320v320H80zM187 80v320M293 80v320M80 187h320M80 293h320" stroke="rgba(255,255,255,0.16)" stroke-width="1.25"/>',
    hex: '<path d="M240 50 410 145v190L240 430 70 335V145L240 50Z" stroke="rgba(255,255,255,0.2)" stroke-width="1.5"/>',
    ring: '<circle cx="240" cy="240" r="210"/><circle cx="240" cy="240" r="165"/><circle cx="240" cy="240" r="120"/><circle cx="240" cy="240" r="75"/>',
  };
  return [
    '<svg class="hero-svg" viewBox="0 0 480 480" fill="none" aria-hidden="true" focusable="false">',
    gradientDefs(theme),
    `<g class="hero-rings" stroke="rgba(255,255,255,0.18)" stroke-width="1.25">${lines[mark]}</g>`,
    '<path class="hero-arc" d="M60 240a180 180 0 0 1 180-180" stroke="url(#g1)" stroke-width="6" stroke-linecap="round"/>',
    `<circle class="hero-orb" cx="240" cy="60" r="14" fill="${theme.colors.highlight}"/>`,
    letter,
    "</svg>",
  ].join("");
}

/** Editorial layout: a drawn rule with a gradient tip. */
function heroLine(theme: SiteTheme): string {
  return `<svg viewBox="0 0 800 24" preserveAspectRatio="none" aria-hidden="true" focusable="false">${gradientDefs(theme)}<path class="hero-arc" d="M0 12H800" stroke="url(#g1)" stroke-width="3" stroke-linecap="round"/></svg>`;
}

/** Poster and shelf layouts: a soft glow behind the type. */
function heroGlow(theme: SiteTheme): string {
  return `<svg class="hero-glow-svg" viewBox="0 0 400 400" aria-hidden="true" focusable="false">${gradientDefs(theme)}<circle cx="200" cy="200" r="160" fill="url(#g1)" opacity="0.35"/><circle class="hero-orb" cx="200" cy="40" r="10" fill="${theme.colors.highlight}"/></svg>`;
}

// ---------------------------------------------------------------------------
// Cursor, texture and tempo: small things that make a site feel made for the business
// ---------------------------------------------------------------------------
function cursorCss(style: CursorStyle, accent: string): string {
  if (style === "arrow") return "";
  const enc = (s: string) => encodeURIComponent(s).replace(/'/g, "%27").replace(/\(/g, "%28").replace(/\)/g, "%29");
  const shapes: Record<Exclude<CursorStyle, "arrow">, { idle: string; hot: string; x: number; y: number }> = {
    chalk: {
      idle: `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><path d='M4 24 20 8l4 4L8 28z' fill='${accent}' stroke='white' stroke-width='1.5'/><path d='M20 8l4-4 4 4-4 4z' fill='white' stroke='${accent}' stroke-width='1.5'/></svg>`,
      hot: `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><circle cx='14' cy='14' r='10' fill='none' stroke='${accent}' stroke-width='2.5'/><circle cx='14' cy='14' r='3' fill='${accent}'/></svg>`,
      x: 4,
      y: 24,
    },
    ring: {
      idle: `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><circle cx='14' cy='14' r='10' fill='none' stroke='${accent}' stroke-width='2'/><circle cx='14' cy='14' r='2.5' fill='${accent}'/></svg>`,
      hot: `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><circle cx='14' cy='14' r='12' fill='${accent}' fill-opacity='0.25' stroke='${accent}' stroke-width='2'/><circle cx='14' cy='14' r='3' fill='${accent}'/></svg>`,
      x: 14,
      y: 14,
    },
    dot: {
      idle: `<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'><circle cx='10' cy='10' r='6' fill='${accent}' stroke='white' stroke-width='2'/></svg>`,
      hot: `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><circle cx='14' cy='14' r='11' fill='${accent}' fill-opacity='0.3'/><circle cx='14' cy='14' r='5' fill='${accent}' stroke='white' stroke-width='2'/></svg>`,
      x: 10,
      y: 10,
    },
    plus: {
      idle: `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M12 2v20M2 12h20' stroke='${accent}' stroke-width='2'/><path d='M12 4v16M4 12h16' stroke='white' stroke-width='0.75'/></svg>`,
      hot: `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><rect x='3' y='3' width='18' height='18' fill='none' stroke='${accent}' stroke-width='2'/><path d='M12 7v10M7 12h10' stroke='${accent}' stroke-width='2'/></svg>`,
      x: 12,
      y: 12,
    },
  };
  const s = shapes[style];
  const hotX = style === "chalk" ? 14 : s.x;
  const hotY = style === "chalk" ? 14 : s.y;
  return `
/* Cursor: ${style}. Only on devices with a fine pointer; touch screens never see it. */
@media (pointer: fine) {
  body { cursor: url("data:image/svg+xml,${enc(s.idle)}") ${s.x} ${s.y}, auto; }
  a, button, summary, label, input, textarea { cursor: url("data:image/svg+xml,${enc(s.hot)}") ${hotX} ${hotY}, pointer; }
  input, textarea { cursor: text; }
  .button[disabled] { cursor: not-allowed; }
}`;
}

function textureCss(texture: Texture): string {
  const patterns: Record<Texture, string> = {
    ruled: "repeating-linear-gradient(180deg, transparent 0, transparent 31px, color-mix(in srgb, var(--accent) 9%, transparent) 31px, color-mix(in srgb, var(--accent) 9%, transparent) 32px)",
    grid: "linear-gradient(color-mix(in srgb, var(--ink) 5%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--ink) 5%, transparent) 1px, transparent 1px)",
    weave:
      "repeating-linear-gradient(45deg, color-mix(in srgb, var(--accent) 5%, transparent) 0, color-mix(in srgb, var(--accent) 5%, transparent) 2px, transparent 2px, transparent 12px), repeating-linear-gradient(-45deg, color-mix(in srgb, var(--accent) 5%, transparent) 0, color-mix(in srgb, var(--accent) 5%, transparent) 2px, transparent 2px, transparent 12px)",
    dots: "radial-gradient(color-mix(in srgb, var(--ink) 9%, transparent) 1px, transparent 1.5px)",
    paper: "radial-gradient(60% 40% at 10% 0%, color-mix(in srgb, var(--highlight) 22%, transparent), transparent 70%), radial-gradient(50% 40% at 100% 100%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 70%)",
    none: "none",
  };
  const sizes: Record<Texture, string> = { ruled: "auto", grid: "28px 28px", weave: "auto", dots: "22px 22px", paper: "auto", none: "auto" };
  if (texture === "none") return "";
  return `
/* Texture: ${texture} */
body::before { content: ""; position: fixed; inset: 0; z-index: -1; pointer-events: none; background: ${patterns[texture]}; background-size: ${sizes[texture]}; opacity: 0.9; }`;
}

function tempo(m: MotionTempo): { t: string; fast: string; slow: string; lift: string; aurora: string; scale: string } {
  switch (m) {
    case "snappy":
      return { t: "220ms", fast: "120ms", slow: "520ms", lift: "-4px", aurora: "14s", scale: "1.02" };
    case "drift":
      return { t: "520ms", fast: "240ms", slow: "1100ms", lift: "-2px", aurora: "34s", scale: "1" };
    case "steady":
      return { t: "300ms", fast: "160ms", slow: "600ms", lift: "-1px", aurora: "0s", scale: "1" };
    case "calm":
    default:
      return { t: "400ms", fast: "200ms", slow: "800ms", lift: "-3px", aurora: "22s", scale: "1" };
  }
}

// ---------------------------------------------------------------------------
// Stylesheet
// ---------------------------------------------------------------------------
function stylesheet(theme: SiteTheme, a: Archetype): string {
  const k = theme.colors;
  const r = SHAPE_RADII[theme.shape];
  const tp = tempo(a.motion);
  const displayWeight = theme.type === "serif" ? 500 : theme.type === "mono" ? 600 : 700;
  const displayTracking = theme.type === "sans" ? "-0.03em" : theme.type === "mono" ? "-0.01em" : "-0.015em";
  const heroCss = heroLayoutCss(a.hero);
  return `/* Generated by Decupo site-build for ${a.label}. Edit freely. */
/* ${theme.description} */
/* Hero: ${a.hero}. Mark: ${a.mark}. Cursor: ${a.cursor}. Texture: ${a.texture}. Motion: ${a.motion} (base ${tp.t}, ease cubic-bezier(.4,0,.2,1)). */
:root {
  --brand: ${k.brand};
  --brand-deep: ${k.brandDeep};
  --canvas: ${k.canvas};
  --surface: ${k.surface};
  --ink: ${k.ink};
  --muted: ${k.muted};
  --line: ${k.line};
  --accent: ${k.accent};
  --accent-deep: ${k.accentDeep};
  --highlight: ${k.highlight};
  --on-brand: ${k.onBrand};
  --on-brand-muted: ${k.onBrandMuted};
  --radius-l: ${r.l};
  --radius-m: ${r.m};
  --radius-s: ${r.s};
  --radius-pill: ${r.pill};
  --max: 1120px;
  --gutter: clamp(20px, 4vw, 40px);
  --ease: cubic-bezier(0.4, 0, 0.2, 1);
  --t: ${tp.t};
  --t-fast: ${tp.fast};
  --t-slow: ${tp.slow};
  --lift: ${tp.lift};
  --hover-scale: ${tp.scale};
  --display-weight: ${displayWeight};
  --display-tracking: ${displayTracking};
  --font-display: ${TYPE_STACKS[theme.type]};
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
  background: var(--canvas);
  display: flex;
  min-height: 100vh;
  flex-direction: column;
  position: relative;
}
h1, h2, h3 { font-family: var(--font-display); font-weight: var(--display-weight); letter-spacing: var(--display-tracking); margin: 0; text-wrap: balance; }
h1 { font-size: clamp(2.4rem, 6vw, 4.6rem); line-height: 1.02; }
h2 { font-size: clamp(1.9rem, 3.6vw, 2.75rem); line-height: 1.1; }
h3 { font-size: 1.3rem; line-height: 1.25; }
p { margin: 0; }
a { color: inherit; }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; border-radius: 4px; }
${textureCss(a.texture)}
${cursorCss(a.cursor, k.accent)}

/* Skip link */
.skip-link { position: absolute; left: -999px; top: 12px; background: var(--ink); color: #fff; padding: 10px 14px; border-radius: var(--radius-s); z-index: 20; }
.skip-link:focus { left: 12px; }

/* Masthead: brand band shared by every page */
.masthead { position: relative; background: var(--brand); color: var(--on-brand); overflow: hidden; isolation: isolate; }
.aurora {
  position: absolute; inset: -30% -10%; z-index: -1; pointer-events: none;
  background:
    radial-gradient(40% 50% at 15% 30%, color-mix(in srgb, var(--accent) 55%, transparent), transparent 70%),
    radial-gradient(35% 45% at 80% 20%, color-mix(in srgb, var(--highlight) 28%, transparent), transparent 70%),
    radial-gradient(45% 55% at 70% 85%, color-mix(in srgb, var(--accent-deep) 50%, transparent), transparent 70%);
  filter: blur(40px);
  ${tp.aurora === "0s" ? "" : `animation: aurora ${tp.aurora} var(--ease) infinite alternate;`}
}
.site-header {
  width: 100%; max-width: var(--max); margin: 0 auto; padding: 22px var(--gutter);
  display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;
}
.brand { display: inline-flex; align-items: center; gap: 10px; font-family: var(--font-display); font-size: 1.25rem; text-decoration: none; }
.logo { color: var(--highlight); flex: none; }
.site-nav ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 2px 6px; }
.site-nav a {
  position: relative; display: inline-block; padding: 8px 12px; border-radius: var(--radius-pill);
  color: var(--on-brand-muted); text-decoration: none; font-size: 0.95rem; font-weight: 500;
  transition: color var(--t-fast) var(--ease), background-color var(--t-fast) var(--ease);
}
.site-nav a:hover, .site-nav a:focus-visible { color: var(--on-brand); background: rgba(255, 255, 255, 0.08); }
.site-nav a[aria-current="page"] { color: var(--brand); background: var(--highlight); }

/* Hero (home) */
.eyebrow { display: inline-flex; align-items: center; gap: 10px; font-size: 0.85rem; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--highlight); margin-bottom: 18px; }
.eyebrow-sep { width: 22px; height: 1px; background: currentColor; opacity: 0.6; }
.hero { position: relative; width: 100%; max-width: var(--max); margin: 0 auto; padding: clamp(40px, 7vw, 96px) var(--gutter) clamp(48px, 7vw, 88px); }
.hero-copy > *, .hero-poster > *, .hero-editorial > * { animation: rise var(--t-slow) var(--ease) both; }
.hero-copy > :nth-child(1), .hero-poster > :nth-child(2), .hero-editorial > :nth-child(1) { animation-delay: 60ms; }
.hero-copy > :nth-child(2), .hero-poster > :nth-child(3), .hero-editorial > :nth-child(2) { animation-delay: 140ms; }
.hero-copy > :nth-child(3), .hero-poster > :nth-child(4), .hero-editorial > :nth-child(3) { animation-delay: 220ms; }
.hero-copy > :nth-child(4), .hero-poster > :nth-child(5), .hero-editorial > :nth-child(4) { animation-delay: 300ms; }
.hero .lead, .page-hero .lead { margin-top: 20px; font-size: clamp(1.1rem, 1.7vw, 1.35rem); line-height: 1.5; color: var(--on-brand-muted); max-width: 40ch; }
.hero-actions { margin-top: 32px; display: flex; flex-wrap: wrap; gap: 12px; }
${heroCss}
.hero-art { display: flex; justify-content: center; animation: fade var(--t-slow) var(--ease) 240ms both; }
.hero-svg { width: min(100%, 420px); height: auto; }
.hero-rings { transform-origin: 240px 240px; ${a.motion === "steady" ? "" : "animation: spin 90s linear infinite;"} }
.hero-orb { transform-origin: 240px 240px; animation: spin 18s linear infinite; }
.hero-glow-svg .hero-orb { transform-origin: 200px 200px; }
.hero-arc { stroke-dasharray: 800; stroke-dashoffset: 800; animation: draw 1.4s var(--ease) 500ms forwards; }

/* Page hero (inner pages) */
.page-hero { width: 100%; max-width: var(--max); margin: 0 auto; padding: clamp(32px, 6vw, 72px) var(--gutter) clamp(40px, 6vw, 64px); }
.page-hero > * { animation: rise var(--t-slow) var(--ease) both; }
.page-hero > :nth-child(2) { animation-delay: 80ms; }
.page-hero > :nth-child(3) { animation-delay: 160ms; }
.page-hero h1 { font-size: clamp(2.2rem, 5vw, 3.75rem); max-width: 18ch; }

/* Strip under the hero */
.marquee {
  display: flex; overflow: hidden; border-top: 1px solid rgba(255, 255, 255, 0.12);
  mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
}
.marquee:hover .marquee-track, .marquee:focus-within .marquee-track { animation-play-state: paused; }
.marquee-track {
  flex: none; display: flex; list-style: none; margin: 0; padding: 14px 0; gap: 0; min-width: 100%; justify-content: space-around;
  animation: marquee ${a.motion === "snappy" ? "22s" : "36s"} linear infinite;
}
.marquee-track li { flex: none; padding: 0 28px; font-family: var(--font-display); font-size: 1.05rem; color: var(--on-brand-muted); position: relative; }
.marquee-track li + li::before { content: ""; position: absolute; left: -3px; top: 50%; width: 6px; height: 6px; margin-top: -3px; border-radius: 50%; background: var(--highlight); opacity: 0.7; }

/* Buttons */
.button {
  position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 8px; overflow: hidden;
  padding: 14px 24px; border-radius: var(--radius-pill); font: 600 1rem var(--font-body); text-decoration: none; border: 1px solid transparent;
  transition: transform var(--t) var(--ease), box-shadow var(--t) var(--ease), background-color var(--t) var(--ease), color var(--t) var(--ease);
}
.button > span { position: relative; }
.button-primary { background: var(--accent); color: #fff; box-shadow: 0 10px 30px -12px color-mix(in srgb, var(--accent) 80%, transparent); }
.button-primary::after {
  content: ""; position: absolute; inset: 0; transform: translateX(-120%) skewX(-18deg);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.32), transparent);
  transition: transform var(--t-slow) var(--ease);
}
.button-primary:hover::after, .button-primary:focus-visible::after { transform: translateX(120%) skewX(-18deg); }
.button-primary:hover, .button-primary:focus-visible { background: var(--accent-deep); transform: translateY(var(--lift)) scale(var(--hover-scale)); box-shadow: 0 16px 36px -14px color-mix(in srgb, var(--accent) 90%, transparent); }
.button-ghost { color: var(--on-brand); border-color: rgba(255, 255, 255, 0.28); background: transparent; }
.button-ghost:hover, .button-ghost:focus-visible { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.5); }
main .button-ghost { color: var(--ink); border-color: var(--line); }
.button[disabled] { opacity: 0.55; transform: none; box-shadow: none; }
.button[disabled]::after { display: none; }

/* Content sections */
main { flex: 1; width: 100%; }
.section { width: 100%; max-width: var(--max); margin: 0 auto; padding: clamp(56px, 8vw, 104px) var(--gutter) 0; }
.section > h2 { max-width: 20ch; margin-bottom: clamp(24px, 4vw, 40px); }
.section-intro { color: var(--muted); max-width: 58ch; margin: -8px 0 28px; font-size: 1.1rem; }
.section-more { margin-top: 20px; font-weight: 600; }
.section-more a { color: var(--accent-deep); text-decoration: none; }
.section-more a:hover { text-decoration: underline; text-underline-offset: 4px; }
.prose { max-width: 66ch; display: grid; gap: 18px; font-size: 1.125rem; line-height: 1.7; }

/* Bento grid with spotlight borders */
.bento { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); grid-auto-rows: minmax(190px, auto); grid-auto-flow: dense; }
.tile {
  position: relative; display: flex; flex-direction: column; gap: 12px; padding: 26px; border-radius: var(--radius-l);
  background: var(--surface); border: 1px solid var(--line);
  transition: transform var(--t) var(--ease), box-shadow var(--t) var(--ease), border-color var(--t) var(--ease);
}
.tile::before {
  content: ""; position: absolute; inset: -1px; border-radius: inherit; padding: 1px; pointer-events: none; opacity: 0;
  background: linear-gradient(135deg, var(--accent), var(--highlight) 60%, transparent);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude;
  transition: opacity var(--t) var(--ease);
}
.tile:hover { transform: translateY(var(--lift)); box-shadow: 0 24px 48px -28px color-mix(in srgb, var(--brand) 45%, transparent); }
.tile:hover::before { opacity: 1; }
.tile-wide { grid-column: span 2; }
.tile-tall { grid-row: span 2; }
.tile-icon { display: inline-grid; place-items: center; width: 42px; height: 42px; border-radius: 12px; background: var(--canvas); color: var(--accent); }
.tile h3 { margin-top: auto; }
.tile p { color: var(--muted); }

/* Plain cards */
.cards { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-m); padding: 24px; display: grid; gap: 8px; align-content: start; transition: transform var(--t) var(--ease), box-shadow var(--t) var(--ease); }
.card:hover { transform: translateY(var(--lift)); box-shadow: 0 18px 40px -28px color-mix(in srgb, var(--brand) 40%, transparent); }
.card p { color: var(--muted); }

/* Steps (a genuine sequence) */
.steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); counter-reset: step; }
.step { display: flex; gap: 18px; align-items: flex-start; padding: 22px 22px 22px 18px; border-radius: var(--radius-m); background: var(--surface); border: 1px solid var(--line); }
.step-number { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: var(--brand); color: var(--highlight); font-family: var(--font-display); font-size: 1.15rem; }
.step h3 { margin-bottom: 6px; }
.step p { color: var(--muted); }

/* FAQ accordion (native details, animated chevron) */
.faq { border-top: 1px solid var(--line); }
.faq:last-of-type { border-bottom: 1px solid var(--line); }
.faq summary {
  list-style: none; display: flex; justify-content: space-between; align-items: center; gap: 16px;
  padding: 20px 4px; font-family: var(--font-display); font-size: 1.25rem;
}
.faq summary::-webkit-details-marker { display: none; }
.faq-chevron { display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; color: var(--accent); background: var(--surface); border: 1px solid var(--line); transition: transform var(--t) var(--ease), background-color var(--t) var(--ease), color var(--t) var(--ease); }
.faq[open] .faq-chevron { transform: rotate(180deg); background: var(--accent); color: #fff; }
.faq p { padding: 0 4px 22px; color: var(--muted); max-width: 64ch; animation: rise var(--t) var(--ease) both; }

/* Pricing tiers */
.tiers { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); align-items: stretch; }
.tier { position: relative; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-l); padding: 28px; display: grid; gap: 10px; align-content: start; transition: transform var(--t) var(--ease), box-shadow var(--t) var(--ease); }
.tier:hover { transform: translateY(var(--lift)); box-shadow: 0 24px 48px -28px color-mix(in srgb, var(--brand) 40%, transparent); }
.tier-featured { background: var(--brand); color: var(--on-brand); border-color: var(--brand); }
.tier-featured p, .tier-featured .price { color: var(--on-brand); }
.tier-featured .tier-points li { color: var(--on-brand-muted); }
.tier-featured .tier-points svg { color: var(--highlight); }
.tier-flag { position: absolute; top: 18px; right: 18px; font-size: 0.8rem; font-weight: 600; padding: 4px 10px; border-radius: var(--radius-pill); background: var(--highlight); color: var(--brand); }
.tier h3 { font-size: 1.6rem; }
.price { font-weight: 600; color: var(--ink); }
.tier > p:not(.price) { color: var(--muted); }
.tier-points { list-style: none; margin: 10px 0 0; padding: 14px 0 0; border-top: 1px solid rgba(128, 140, 160, 0.25); display: grid; gap: 10px; }
.tier-points li { display: flex; gap: 10px; align-items: center; color: var(--muted); }
.tier-points svg { color: var(--accent); flex: none; }

/* CTA band */
.cta-band {
  position: relative; overflow: hidden; isolation: isolate; width: min(100% - 2 * var(--gutter), var(--max)); margin: clamp(56px, 8vw, 104px) auto;
  padding: clamp(36px, 6vw, 64px); border-radius: var(--radius-l); background: var(--brand); color: var(--on-brand); display: grid; gap: 14px; justify-items: start;
}
.cta-band p { color: var(--on-brand-muted); max-width: 52ch; font-size: 1.1rem; }
.cta-band .button { margin-top: 10px; }
.cta-glow { position: absolute; inset: auto -10% -60% auto; width: 60%; aspect-ratio: 1; border-radius: 50%; z-index: -1; background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 70%, transparent), transparent); filter: blur(30px); animation: pulse 9s var(--ease) infinite alternate; }

/* Contact */
.contact-grid { display: grid; gap: clamp(28px, 5vw, 64px); grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); padding-bottom: clamp(56px, 8vw, 104px); }
.contact-aside h2 { margin-bottom: 14px; }
.contact-points { list-style: none; margin: 28px 0 0; padding: 0; display: grid; gap: 14px; color: var(--muted); }
.contact-points li { display: flex; gap: 12px; align-items: center; }
.contact-points svg { color: var(--accent); flex: none; }
.contact-form { display: grid; gap: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-l); padding: clamp(22px, 3vw, 32px); align-self: start; }
.form-notice { font-size: 0.95rem; color: var(--muted); padding: 10px 14px; border-radius: var(--radius-s); background: var(--canvas); border: 1px dashed var(--line); }
.field { position: relative; }
.field input, .field textarea {
  width: 100%; font: inherit; padding: 22px 14px 10px; border: 1px solid var(--line); border-radius: var(--radius-s); background: var(--surface); color: var(--ink);
  transition: border-color var(--t-fast) var(--ease), box-shadow var(--t-fast) var(--ease);
}
.field textarea { resize: vertical; min-height: 140px; }
.field label {
  position: absolute; left: 14px; top: 16px; color: var(--muted); pointer-events: none; transform-origin: left top;
  transition: transform var(--t-fast) var(--ease), color var(--t-fast) var(--ease);
}
.field input:focus, .field textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 15%, transparent); }
.field input:focus + label, .field input:not(:placeholder-shown) + label,
.field textarea:focus + label, .field textarea:not(:placeholder-shown) + label { transform: translateY(-10px) scale(0.78); color: var(--accent); }

/* Footer */
.site-footer { background: var(--brand-deep); color: var(--on-brand-muted); margin-top: auto; }
.footer-inner { width: 100%; max-width: var(--max); margin: 0 auto; padding: 36px var(--gutter) 40px; display: grid; gap: 20px; grid-template-columns: 1fr auto; align-items: center; }
.site-footer .brand { color: var(--on-brand); }
.site-footer nav ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px 20px; }
.site-footer a { text-decoration: none; }
.site-footer nav a:hover { color: var(--on-brand); text-decoration: underline; text-underline-offset: 4px; }
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
@keyframes shelf-in { from { opacity: 0; transform: translateY(24px) rotate(0deg); } }

/* Responsive */
@media (max-width: 900px) {
  .hero-split, .hero-shelf { grid-template-columns: 1fr; }
  .hero-split .hero-art { order: -1; }
  .hero-svg { width: min(60%, 280px); }
  .shelf { min-height: 0; margin-top: 24px; }
  .tile-wide { grid-column: span 1; }
  .tile-tall { grid-row: span 1; }
  .hero-editorial h1 { font-size: clamp(2.4rem, 9vw, 4rem); }
}
@media (max-width: 640px) {
  .site-header { flex-direction: column; align-items: flex-start; }
  .site-nav ul { gap: 0; }
  .site-nav a { padding: 6px 10px; font-size: 0.9rem; }
  .hero-actions .button { width: 100%; }
  .hero-row { grid-template-columns: 1fr; }
  .footer-inner { grid-template-columns: 1fr; }
  .shelf-card { position: static; transform: none; width: 100%; margin-bottom: 10px; }
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

function heroLayoutCss(layout: HeroLayout): string {
  switch (layout) {
    case "editorial":
      return `
/* Editorial hero: the headline runs the full width; the tagline and actions sit in a two-column row under it */
.hero-editorial h1 { font-size: clamp(2.8rem, 8.5vw, 6.6rem); max-width: 16ch; line-height: 0.96; }
.hero-row { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr); gap: 24px; align-items: end; margin-top: 28px; }
.hero-row .hero-actions { margin-top: 0; justify-content: flex-end; }
.hero-rule { margin-top: 40px; height: 24px; }
.hero-rule svg { width: 100%; height: 24px; display: block; }`;
    case "poster":
      return `
/* Poster hero: everything centred, the biggest type, a glow behind it */
.hero-poster { text-align: center; display: grid; justify-items: center; padding-top: clamp(56px, 9vw, 120px); }
.hero-poster h1 { font-size: clamp(2.8rem, 9vw, 7rem); max-width: 14ch; line-height: 0.95; }
.hero-poster .lead { max-width: 48ch; }
.hero-poster .hero-actions { justify-content: center; }
.hero-glow { position: absolute; inset: 0; z-index: -1; display: grid; place-items: center; pointer-events: none; }
.hero-glow-svg { width: min(90vw, 620px); height: auto; filter: blur(2px); animation: fade var(--t-slow) var(--ease) both; }`;
    case "shelf":
      return `
/* Shelf hero: copy left, three stacked product cards right */
.hero-shelf { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr); gap: clamp(24px, 5vw, 64px); align-items: center; }
.shelf { position: relative; min-height: 500px; display: block; }
.shelf .hero-glow-svg { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.6; }
.shelf-card {
  position: absolute; width: min(100%, 280px); padding: 18px 20px; border-radius: var(--radius-m); background: var(--surface); color: var(--ink);
  box-shadow: 0 30px 60px -30px rgba(0, 0, 0, 0.55); display: grid; gap: 4px; animation: shelf-in var(--t-slow) var(--ease) both;
  transition: transform var(--t) var(--ease), box-shadow var(--t) var(--ease);
}
.shelf-card b { font-family: var(--font-display); font-size: 1.1rem; }
.shelf-card span:last-child { color: var(--muted); font-size: 0.92rem; }
.shelf-icon { display: inline-grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--canvas); color: var(--accent); margin-bottom: 6px; }
.shelf-card-1 { left: 0; top: 0; transform: rotate(-3deg); animation-delay: 200ms; }
.shelf-card-2 { right: 0; top: 38%; transform: rotate(2deg); animation-delay: 340ms; }
.shelf-card-3 { left: 10%; bottom: 0; transform: rotate(-1deg); animation-delay: 480ms; }
.shelf-card:hover { transform: translateY(var(--lift)) rotate(0deg); z-index: 2; }`;
    case "split":
    default:
      return `
/* Split hero: copy left, the mark's geometry right */
.hero-split { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr); gap: clamp(24px, 5vw, 64px); align-items: center; }`;
  }
}

export { ARCHETYPES, detectArchetype };
