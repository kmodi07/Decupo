/**
 * Deterministic composers for the writing skills (brand brief, research memo,
 * page outlines, deck outline). Everything here is built from the goal and
 * the answers the user gave: nothing is invented, no source is cited that was
 * not retrieved, and names are offered as suggestions only. English only by
 * design; sellers who need another language get the facts and translate.
 */
import { brandNameFromGoal } from "./site/generate";
import { deriveTheme } from "./site/theme";

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function goalPhrase(goal: string): string {
  return lowerFirst(goal.trim().replace(/[.!?]+$/, ""));
}

export type BriefInputs = { goal: string; brandName?: unknown; audience?: unknown; tone?: unknown; look?: unknown };

export function composeBrandBrief(i: BriefInputs): { markdown: string; brandName: string } {
  const brand = str(i.brandName) ?? brandNameFromGoal(i.goal);
  const audience = str(i.audience);
  const tone = str(i.tone);
  const look = str(i.look);
  const theme = deriveTheme({ look: look ?? undefined, tone: tone ?? undefined, goal: i.goal });
  const toneWords = tone ? tone.split(/[,;/]|\band\b/).map((w) => w.trim()).filter(Boolean) : ["clear", "warm", "direct"];
  const words = brand.split(/\s+/);
  const core = words[0] ?? brand;
  const naming = [brand, `${core} Studio`, `${core} & Co`, `The ${core} Collective`].filter((v, idx, arr) => arr.indexOf(v) === idx).slice(0, 4);

  const markdown = [
    "# Brand brief",
    "",
    "## Positioning",
    "",
    `${brand} exists to ${goalPhrase(i.goal)}.`,
    audience ? `It is for ${lowerFirst(audience)}, and every page and message should speak to them first.` : "Who it is for has not been stated yet; see Audience.",
    "",
    "What to decide next: the one promise ${brand} makes that a competitor would not, and the proof behind it. Write it in one sentence and use it as the site headline.".replace("${brand}", brand),
    "",
    "## Audience",
    "",
    audience ? audience : "Not specified. Answer \"Who is this for?\" on the mission and the brief, the site copy and the outreach drafts will address them directly.",
    "",
    "- What they are trying to get done",
    "- What they worry about before buying",
    "- Where they look first (search, referrals, marketplaces, social)",
    "",
    "## Voice",
    "",
    `${toneWords.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(", ")}. Short sentences, concrete nouns, no filler. Say what happens next in every call to action.`,
    "",
    "## Naming directions",
    "",
    ...naming.map((n) => `- ${n}`),
    "",
    "Suggestions only: none of these has been checked for trademarks, company registers or domain availability.",
    "",
    "## Visual direction",
    "",
    theme.description,
    "",
  ].join("\n");
  return { markdown, brandName: brand };
}

export type MemoInputs = { goal: string; focus?: unknown; answers?: Record<string, unknown> };

const FOCUS_QUESTIONS: Record<string, string[]> = {
  general: ["Who else serves this need, and how do they price it?", "What do buyers compare before choosing?", "What would make the first ten customers say yes?"],
  "video topics": ["Which topics in this niche get repeat views rather than one spike?", "What format length do viewers finish?", "Which creators already own the obvious angles, and which angles are open?"],
  prospecting: ["Which segment buys most often and at what volume?", "Who signs off the purchase, and who influences it?", "What objection ends most first conversations?"],
};

export function composeResearchMemo(i: MemoInputs): string {
  const focus = str(i.focus) ?? "general";
  const known = Object.entries(i.answers ?? {})
    .filter(([k, v]) => k !== "focus" && str(v))
    .map(([k, v]) => `- ${k}: ${String(v).trim()}`);
  const questions = FOCUS_QUESTIONS[focus] ?? FOCUS_QUESTIONS.general!;
  return [
    "# Research memo",
    "",
    "## Question",
    "",
    i.goal.trim(),
    "",
    `Focus: ${focus}.`,
    "",
    "## What we know",
    "",
    ...(known.length ? known : ["- Only the goal so far. Facts you add as answers appear here and are the only facts this memo treats as given."]),
    "",
    "## What to find out",
    "",
    ...questions.map((q) => `- ${q}`),
    "- What it costs to deliver, and what margin that leaves.",
    "- Which rules or licences apply before selling or publishing.",
    "",
    "## Where to look",
    "",
    "- Trade associations and government registries for the sector",
    "- Marketplaces and directories where buyers already search",
    "- Competitor sites, price lists and reviews",
    "- Five conversations with people who match the audience",
    "",
    "## Sources",
    "",
    "No sources retrieved: web research is not connected to this workspace, so nothing above is cited. Add what you find and the quality review will stop flagging it.",
    "",
  ].join("\n");
}

export type SitemapEntry = { title: string; path: string };

export function composePageOutlines(sitemap: SitemapEntry[], brand: string, goal: string): string {
  const sections: Record<string, { sections: string[]; cta: string }> = {
    home: { sections: ["Headline: the one promise", "Who it is for", "Three reasons to choose " + brand, "How it works in three steps", "Questions people ask"], cta: "Get in touch" },
    about: { sections: ["The story behind " + brand, "Who runs it", "What we stand for", "How we work"], cta: "Get in touch" },
    services: { sections: ["What we offer, one section per service", "What you get at the end", "Who each service suits"], cta: "Ask about a service" },
    pricing: { sections: ["Three starting points", "What each includes", "How quotes are confirmed"], cta: "Ask for a quote" },
    contact: { sections: ["How to reach us", "Where we are and when", "The form"], cta: "Send a message" },
  };
  const kindOf = (p: SitemapEntry) => {
    const t = `${p.title} ${p.path}`.toLowerCase();
    if (p.path === "/" || /home|index/.test(t)) return "home";
    if (/about|story|team/.test(t)) return "about";
    if (/service|offer|product/.test(t)) return "services";
    if (/pric|plan/.test(t)) return "pricing";
    if (/contact|book|enquir/.test(t)) return "contact";
    return "generic";
  };
  return [
    "# Page outlines",
    "",
    `For: ${goal.trim()}`,
    "",
    ...sitemap.flatMap((p) => {
      const k = kindOf(p);
      const spec = sections[k] ?? { sections: ["Introduction", "Details", "Why it matters"], cta: "Get in touch" };
      return [`## ${p.title} (${p.path})`, "", ...spec.sections.map((s) => `- ${s}`), "", `Call to action: ${spec.cta}`, ""];
    }),
  ].join("\n");
}

export function composeDeckOutline(goal: string, opts: { memoPresent: boolean; focus?: unknown; length?: unknown }): { markdown: string; slideCount: number } {
  const topic = goal.trim().replace(/[.!?]+$/, "");
  const focus = str(opts.focus);
  const slides: Array<[string, string[], string]> = [
    ["Title", [topic, focus ? `Angle: ${focus}` : "Angle: to be decided", "Presenter and date"], "Open with the single claim the deck will support."],
    ["Why this matters now", ["What changed recently [citation needed]", "Who is affected", "What happens if nothing is done"], "One concrete example beats three statistics."],
    ["The question", ["The decision the audience has to make", "What a good answer looks like", "What is out of scope"], "Keep it to one sentence on the slide."],
    ["What we know", ["Facts given in the brief", "Facts still to verify [citation needed]", "Assumptions, labelled as such"], opts.memoPresent ? "Pull only from the research memo's What we know section." : "No memo was produced; everything here is an input, not a finding."],
    ["Evidence", ["Data point 1 [citation needed]", "Data point 2 [citation needed]", "Counter-evidence and how it was weighed"], "Every number on this slide needs a source before the deck is shown."],
    ["Options", ["Option A and its cost", "Option B and its cost", "Do nothing"], "Compare on the same three criteria."],
    ["Recommendation", ["The option to take", "Why it beats the others", "What it does not solve"], "State it plainly; the audience should be able to repeat it."],
    ["Plan", ["First 30 days", "First 90 days", "Who owns what"], "Dates and names, not phases."],
    ["Risks and open questions", ["Biggest risk and the mitigation", "What would change the recommendation", "Unknowns to resolve"], "Naming risks builds trust; hiding them loses it."],
    ["The ask", ["The decision needed today", "Resources required", "Next step and date"], "End on the ask, then stop."],
  ];
  const markdown = [
    "# Deck outline",
    "",
    `Topic: ${topic}`,
    "",
    "Claims marked [citation needed] must be sourced before the deck is shown; none were retrieved by this step.",
    "",
    ...slides.flatMap(([title, bullets, note], idx) => [`## Slide ${idx + 1}: ${title}`, "", ...bullets.map((b) => `- ${b}`), "", `Speaker note: ${note}`, ""]),
  ].join("\n");
  return { markdown, slideCount: slides.length };
}
