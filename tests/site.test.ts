import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/server/db/client";
import { closeTestDb, makeTenant, makeTestDb } from "./helpers/db";
import { brandNameFromGoal, CONTACT_FORM_NOTICE, detectArchetype, generateSite, parseBrief, type SiteFile } from "@/server/skills/site/generate";
import { composeBrandBrief } from "@/server/skills/compose";
import { checkSite, renderReport, resolveHref } from "@/server/skills/site/check";
import { contrastRatio, customPalette, deriveTheme, hexToHsl, hslToHex, TYPE_STACKS } from "@/server/skills/site/theme";
import { authorizeMission, createMission, decideApproval, getMission, listApprovals, listArtifacts, listSteps } from "@/server/missions/service";
import { drain } from "@/server/worker/runner";
import { listEvents } from "@/server/missions/events";
import { getBalance } from "@/server/ledger/service";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as createMissionRoute } from "@/app/api/missions/route";
import { POST as authorizeRoute } from "@/app/api/missions/[id]/authorize/route";
import { GET as previewRoute } from "@/app/api/missions/[id]/preview/[[...path]]/route";
import { GET as artifactRoute } from "@/app/api/artifacts/[id]/route";

const PAGES = [
  { title: "Home", path: "/" },
  { title: "About", path: "/about" },
  { title: "Services", path: "/services" },
  { title: "Pricing", path: "/pricing" },
  { title: "Contact", path: "/contact" },
];

describe("site generator (pure)", () => {
  const files = generateSite({ brandName: "Bright Tutors", goal: "Build a website for my tutoring company", pages: PAGES });

  it("emits index.html, one page per sitemap entry and a shared stylesheet", () => {
    expect(files.map((f) => f.path)).toEqual(["index.html", "about.html", "services.html", "pricing.html", "contact.html", "styles.css"]);
    expect(files.filter((f) => f.kind === "html")).toHaveLength(5);
    expect(files.find((f) => f.path === "styles.css")!.kind).toBe("css");
  });

  it("produces semantic, responsive HTML with metadata and OpenGraph tags", () => {
    const home = files.find((f) => f.path === "index.html")!.content;
    expect(home).toMatch(/^<!doctype html>/i);
    expect(home).toContain('<html lang="en">');
    expect(home).toContain('<meta name="viewport"');
    expect(home).toContain("<title>Bright Tutors - ");
    expect(home).toContain('<meta property="og:title"');
    expect(home).toContain('<link rel="stylesheet" href="styles.css">');
    expect(home).toContain('<main id="main"');
    expect(home).toContain("<header");
    expect(home).toContain("<footer");
    expect(home).toContain('<nav class="site-nav" aria-label="Main">');
    expect(home.match(/<h1\b/g)).toHaveLength(1);
    const css = files.find((f) => f.path === "styles.css")!.content;
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toContain("auto-fit");
  });

  it("marks the contact form as not connected and never invents prices", () => {
    const contact = files.find((f) => f.path === "contact.html")!.content;
    expect(contact).toContain("<form");
    expect(contact).not.toMatch(/<form[^>]*\saction=/);
    expect(contact).toContain(CONTACT_FORM_NOTICE);
    expect(contact).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
    const pricing = files.find((f) => f.path === "pricing.html")!.content;
    expect(pricing).toContain("Price to be confirmed");
    expect(pricing).not.toMatch(/[$£€]\s?\d/);
  });

  it("escapes user text and carries brief copy into the pages", () => {
    expect(files.find((f) => f.path === "about.html")!.content).not.toContain("Draft copy");
    const live = generateSite({
      brandName: "<Evil> & Co",
      goal: "x",
      pages: PAGES.slice(0, 2),
      brief: { positioning: "We help families learn together." },
    });
    const home = live.find((f) => f.path === "index.html")!.content;
    expect(home).not.toContain("Draft copy");
    expect(home).toContain("&lt;Evil&gt; &amp; Co");
    expect(home).not.toContain("<Evil>");
    expect(home).toContain("We help families learn together.");
  });

  it("derives brand names and parses brief sections", () => {
    expect(brandNameFromGoal("Build me a beautiful website for my tutoring company")).toBe("Tutoring Company");
    expect(brandNameFromGoal('Make a site for a bakery called "Crumbs"')).toBe("Crumbs");
    expect(brandNameFromGoal("Website please")).toBe("Your Business");
    const brief = parseBrief("# Brand brief\n\n## Positioning\n\nCalm tutoring.\n\n## Audience\n\nParents.\n\n## Voice\n\nWarm.\n");
    expect(brief).toEqual({ positioning: "Calm tutoring.", audience: "Parents.", voice: "Warm." });
    expect(parseBrief("# Brand brief\n\n> **Offline draft.** nothing\n\nGoal: x")).toEqual({});
  });
});

describe("site archetypes (pure)", () => {
  it("picks the business archetype from the goal and answers", () => {
    expect(detectArchetype({ goal: "Build a website for my tutoring company" }).id).toBe("education");
    expect(detectArchetype({ goal: "Website for Sri Ganesh Agency", products: "LG fridges and TVs" }).id).toBe("electronics");
    expect(detectArchetype({ goal: "A site for my basmati rice trading business in Bharuch" }).id).toBe("grains");
    expect(detectArchetype({ goal: "Website for my pottery studio" }).id).toBe("crafts");
    expect(detectArchetype({ goal: "Website for my law practice" }).id).toBe("professional");
    expect(detectArchetype({ goal: "Make me a website" }).id).toBe("general");
  });

  it("gives each business its own layout, mark, cursor, texture, tempo and copy", () => {
    const tutor = generateSite({ brandName: "Brightpath Tutors", goal: "Make a website for my tutoring company", pages: PAGES, audience: "parents of high-school students in Austin, Texas" });
    const shop = generateSite({ brandName: "Sri Ganesh Agency", goal: "Website for Sri Ganesh Agency in Bharuch", pages: PAGES, products: "LG fridges and TVs", place: "Bharuch" });
    const home = (f: SiteFile[]) => f.find((x) => x.path === "index.html")!.content;
    const css = (f: SiteFile[]) => f.find((x) => x.path === "styles.css")!.content;

    expect(home(tutor)).toContain('class="page-home arch-education layout-split"');
    expect(home(shop)).toContain('class="page-home arch-electronics layout-shelf"');
    expect(home(shop)).toContain("shelf-card-3");
    expect(home(shop)).toContain("Ask for today&#39;s price");
    expect(home(tutor)).toContain("Book a first lesson");
    // Logo marks carry the initial and differ by business.
    expect(home(tutor)).toMatch(/<svg class="logo"[^>]*>.*<text[^>]*>B<\/text>/);
    expect(home(shop)).toMatch(/M10 2v3M15 2v3/); // chip pins
    // Cursor, texture and tempo live in the stylesheet, guarded for fine pointers only.
    expect(css(tutor)).toContain("Cursor: chalk");
    expect(css(tutor)).toContain("@media (pointer: fine)");
    expect(css(tutor)).toContain("Texture: ruled");
    expect(css(shop)).toContain("Cursor: ring");
    expect(css(shop)).toContain("Texture: grid");
    expect(css(shop)).toContain("--t: 220ms;");
    expect(css(tutor)).toContain("--t: 400ms;");
    // Audience and place reach the copy; brief-only notes never do.
    expect(home(tutor)).toContain("For parents of high-school students in Austin, Texas.");
    expect(home(tutor)).toContain("Who we serve");
    expect(tutor.find((x) => x.path === "about.html")!.content).not.toMatch(/Look: |display face|What to decide next/);
    expect(tutor.find((x) => x.path === "services.html")!.content).toContain("Exam preparation");
    expect(shop.find((x) => x.path === "services.html")!.content).toContain("Delivery and installation");
    expect(home(tutor)).toContain("<title>Brightpath Tutors - Lessons that meet each student where they are</title>");
    for (const files of [tutor, shop]) expect(checkSite(files).verdict).toBe("pass");
  });

  it("drops a positioning line that only echoes the goal and keeps a real one", () => {
    const echo = generateSite({ brandName: "Acme Tutors", goal: "Make a website for my tutoring company", pages: PAGES, brief: { positioning: "Acme Tutors exists to make a website for my tutoring company." } });
    expect(echo.find((x) => x.path === "index.html")!.content).not.toContain("exists to make a website");
    const real = generateSite({ brandName: "Acme Tutors", goal: "Make a website for my tutoring company", pages: PAGES, brief: { positioning: "Acme Tutors gets Class 10 students through board exams with weekly one-to-one lessons." } });
    expect(real.find((x) => x.path === "index.html")!.content).toContain("gets Class 10 students through board exams");
  });

  it("the brand brief and the site agree on the look", () => {
    const { markdown } = composeBrandBrief({ goal: "Make a website for my tutoring company", brandName: "Brightpath Tutors", look: "warm, friendly, soft green and cream", tone: "encouraging, clear, no jargon", audience: "parents of high-school students" });
    expect(markdown).toContain("Brightpath Tutors teaches with one-to-one and small-group lessons");
    expect(markdown).not.toContain("exists to make a website");
    expect(markdown).toContain("Brightpath Tutors is for parents of high-school students");
    expect(markdown).toContain("What they are usually trying to get done:");
    const visual = /## Visual direction\n\n(.+)/.exec(markdown)![1]!;
    const built = generateSite({ brandName: "Brightpath Tutors", goal: "Make a website for my tutoring company", pages: PAGES, look: "warm, friendly, soft green and cream", tone: "encouraging, clear, no jargon", brief: parseBrief(markdown) });
    const css = built.find((x) => x.path === "styles.css")!.content;
    const face = /a (sans-serif|serif|monospace) display face/.exec(visual)![1];
    expect(css).toContain(`--font-display: ${TYPE_STACKS[face === "sans-serif" ? "sans" : face === "monospace" ? "mono" : "serif"]};`);
  });
});

describe("site checker (pure)", () => {
  const files = generateSite({ brandName: "Bright Tutors", goal: "Build a website for my tutoring company", pages: PAGES });

  it("passes the generated site", () => {
    const report = checkSite(files);
    expect(report.verdict).toBe("pass");
    expect(report.pagesChecked).toBe(5);
    expect(report.linksChecked).toBeGreaterThan(20);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.findings.filter((f) => f.severity === "warning")).toEqual([]);
    const md = renderReport(report);
    expect(md).toContain("**Verdict:** pass");
  });

  it("fails a deliberately broken page and lists every failure", () => {
    const broken: SiteFile[] = [
      ...files.filter((f) => f.path !== "about.html"),
      {
        path: "about.html",
        kind: "html",
        content: [
          "<!doctype html><html><head><title> </title></head><body>",
          "<h1>One</h1><h1>Two</h1>",
          '<img src="hero.png">',
          '<a href="missing.html">gone</a>',
          '<a href="../escape.html">up</a>',
          '<a href="services.html">ok</a>',
          '<a href="https://example.com">external</a>',
          '<a href="mailto:hi@example.com">mail</a>',
          "</body></html>",
        ].join("\n"),
      },
    ];
    const report = checkSite(broken);
    expect(report.verdict).toBe("needs_work");
    const checks = report.findings.filter((f) => f.file === "about.html").map((f) => f.check).sort();
    expect(checks).toEqual(["h1", "img-alt", "lang", "link", "link", "title", "viewport"]);
    expect(report.findings.filter((f) => f.check === "link").map((f) => f.message)).toEqual([
      "Internal link does not resolve: missing.html",
      "Internal link does not resolve: ../escape.html",
    ]);
    // Other pages still link to about.html, so they stay clean.
    expect(report.findings.filter((f) => f.file === "index.html")).toEqual([]);
    expect(renderReport(report)).toContain("[link] about.html: Internal link does not resolve: missing.html");
  });

  it("resolves relative and absolute hrefs against the page directory", () => {
    expect(resolveHref("index.html", "about.html")).toBe("about.html");
    expect(resolveHref("blog/post.html", "../about.html")).toBe("about.html");
    expect(resolveHref("blog/post.html", "/styles.css")).toBe("styles.css");
    expect(resolveHref("blog/post.html", "./")).toBe("blog/index.html");
    expect(resolveHref("index.html", "about.html?x=1#top")).toBe("about.html");
    expect(resolveHref("index.html", "../x.html")).toBeNull();
  });
});

describe("site theme (pure)", () => {
  const goal = "Build a website for my consulting firm";

  it("falls back to navy when nothing describes a look, and reports that", () => {
    const t = deriveTheme({ goal: "Make me a website" });
    expect(t).toMatchObject({ palette: "navy", type: "sans", shape: "regular", source: "default" });
    expect(t.description).toContain("nothing in the brief or answers described a look");
  });

  it("uses an explicit hex colour as the accent and builds the rest of the palette from it", () => {
    const t = deriveTheme({ look: "our brand colour is #7a1f33", goal });
    expect(t.palette).toBe("custom");
    expect(t.source).toBe("look");
    expect(t.colors.accent.startsWith("#")).toBe(true);
    expect(Math.round(hexToHsl(t.colors.accent).h)).toBe(Math.round(hexToHsl("#7a1f33").h));
    expect(Math.round(hexToHsl(t.colors.brand).h)).toBe(Math.round(hexToHsl("#7a1f33").h));
    expect(t.description).toContain("#7a1f33");
  });

  it("maps colour words and mood words to palettes", () => {
    expect(deriveTheme({ look: "mostly teal please", goal }).palette).toBe("custom");
    // Teal is darkened slightly so white text stays readable, but it keeps its hue.
    expect(Math.round(hexToHsl(deriveTheme({ look: "mostly teal please", goal }).colors.accent).h)).toBe(Math.round(hexToHsl("#0f8b8d").h));
    expect(deriveTheme({ look: "warm terracotta, rounded", goal })).toMatchObject({ palette: "earth", shape: "soft", type: "serif", source: "look" });
    expect(deriveTheme({ look: "luxury, minimal, black and gold", goal })).toMatchObject({ palette: "luxury", shape: "sharp", type: "serif" });
    expect(deriveTheme({ look: "bold and playful for kids", goal })).toMatchObject({ palette: "playful", shape: "soft", type: "sans" });
    expect(deriveTheme({ look: "technical, monospace feel", goal }).type).toBe("mono");
  });

  it("prefers the look answer over the brief, the brief over tone, and tone over the goal", () => {
    expect(deriveTheme({ look: "forest green", visual: "pastel pink", tone: "luxurious", goal: "Website for my pottery studio" }).source).toBe("look");
    expect(deriveTheme({ visual: "pastel pink", tone: "luxurious", goal: "Website for my pottery studio" })).toMatchObject({ palette: "blush", source: "brief" });
    expect(deriveTheme({ tone: "luxurious", goal: "Website for my pottery studio" })).toMatchObject({ palette: "luxury", source: "tone" });
    expect(deriveTheme({ goal: "Website for my pottery studio" })).toMatchObject({ palette: "earth", source: "goal" });
    expect(deriveTheme({ goal: "Website for my law practice" })).toMatchObject({ palette: "navy", source: "goal" });
  });

  it("keeps white text readable on any custom accent", () => {
    for (const hex of ["#ffff00", "#bff3e0", "#ff69b4", "#00ffff", "#123456", "#c8c8c8"]) {
      const p = customPalette(hex);
      expect(contrastRatio(p.accent, "#ffffff")).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.brand, p.onBrand)).toBeGreaterThanOrEqual(7);
    }
    const round = hexToHsl(hslToHex(210, 0.5, 0.5));
    expect(Math.round(round.h)).toBe(210);
    expect(round.s).toBeCloseTo(0.5, 1);
    expect(round.l).toBeCloseTo(0.5, 1);
  });

  it("writes the theme into the generated stylesheet and markup, and the checks still pass", () => {
    const base = { brandName: "Clay & Kiln", goal: "Build a website for my pottery studio", pages: PAGES };
    const earth = generateSite({ ...base, look: "warm terracotta, rounded" });
    const navy = generateSite({ ...base, look: "#2f5bea, clean and modern, sharp" });
    const cssEarth = earth.find((f) => f.path === "styles.css")!.content;
    const cssNavy = navy.find((f) => f.path === "styles.css")!.content;
    expect(cssEarth).toContain("--accent: #b85c38;");
    expect(cssEarth).toContain("--radius-l: 28px;");
    expect(cssEarth).toContain(`--font-display: ${TYPE_STACKS.serif};`);
    expect(cssEarth).toContain("Look: warm earth tones");
    expect(cssNavy).toContain("--radius-l: 6px;");
    expect(cssNavy).toContain(`--font-display: ${TYPE_STACKS.sans};`);
    expect(cssNavy).not.toBe(cssEarth);
    expect(cssEarth).not.toMatch(/--(navy|cobalt|mint|porcelain|paper)\b/);
    const home = earth.find((f) => f.path === "index.html")!.content;
    expect(home).toContain('<meta name="theme-color" content="#3a2a22">');
    expect(home).toContain('stop-color="#f1c27d"');
    expect(checkSite(earth).verdict).toBe("pass");
    expect(checkSite(navy).verdict).toBe("pass");
  });
});

describe("website mission end to end", () => {
  let h: DbHandle;
  beforeAll(async () => {
    h = await makeTestDb();
  });
  afterAll(async () => closeTestDb(h));

  it("builds and checks a real multi-page site, then waits for approval at the deploy step", async () => {
    const t = await makeTenant(h, { credits: 1000 });
    const { mission, plan } = await createMission(h.db, t.ctx, {
      goal: "Build me a beautiful website for my tutoring company",
      answers: { brandName: "Bright Tutors", look: "warm terracotta, rounded" },
    });
    // Answered questions are not asked again; the rest stay optional.
    expect(plan.questions.map((q) => q.key)).not.toContain("look");
    expect(plan.questions.map((q) => q.key)).toContain("audience");
    expect(plan.templateId).toBe("website");
    expect(plan.steps.map((s) => s.key)).toEqual(["brand-brief", "site-outline", "site-build", "site-check", "deploy-preview"]);
    expect(plan.capabilities.find((c) => c.label.startsWith("Generated site code"))?.status).toBe("supported");

    await authorizeMission(h.db, t.ctx, mission.id);
    await drain(h.db);

    const m = await getMission(h.db, t.ctx, mission.id);
    expect(m.status).toBe("awaiting_review");
    const steps = await listSteps(h.db, t.ctx, mission.id);
    expect(steps.map((s) => [s.key, s.status])).toEqual([
      ["brand-brief", "succeeded"],
      ["site-outline", "succeeded"],
      ["site-build", "succeeded"],
      ["site-check", "succeeded"],
      ["deploy-preview", "awaiting_approval"],
    ]);

    const arts = await listArtifacts(h.db, t.ctx, mission.id);
    const siteFiles = arts.filter((a) => a.path);
    expect(siteFiles.map((a) => a.path)).toEqual(["index.html", "about.html", "services.html", "pricing.html", "contact.html", "styles.css"]);
    expect(siteFiles.map((a) => a.kind)).toEqual(["html", "html", "html", "html", "html", "css"]);
    expect(siteFiles.find((a) => a.path === "styles.css")!.mimeType).toBe("text/css");
    // Built as a tutoring business: the brand in the eyebrow, a promise as the headline, no brief notes on the page.
    expect(siteFiles[0]!.contentText).toContain('<p class="eyebrow">Bright Tutors</p>');
    expect(siteFiles[0]!.contentText).toContain("<h1>Lessons that meet each student where they are.</h1>");
    expect(siteFiles[0]!.contentText).toContain("One-to-one lessons");
    expect(siteFiles[0]!.contentText).not.toMatch(/Look: |What to decide next|Short sentences, concrete nouns/);

    const build = steps.find((s) => s.key === "site-build")!;
    expect(build.output).toMatchObject({
      pageCount: 5,
      entry: "index.html",
      brandName: "Bright Tutors",
      theme: { palette: "earth", shape: "soft", source: "look" },
    });
    expect(siteFiles.find((a) => a.path === "styles.css")!.contentText).toContain("--accent: #b85c38;");
    // The step summary names the look and where it came from, so the mission log never hides the choice.
    const events = await listEvents(h.db, t.org.id, mission.id);
    const buildDone = events.find((ev) => ev.type === "step.succeeded" && (ev.payload as { key?: string }).key === "site-build");
    expect(String((buildDone!.payload as { summary?: string }).summary)).toContain("Look: warm earth tones");
    expect(String((buildDone!.payload as { summary?: string }).summary)).toContain("your answer about the look");
    expect((build.output!.artifactIds as string[]).sort()).toEqual(siteFiles.map((a) => a.id).sort());

    const check = steps.find((s) => s.key === "site-check")!;
    expect(check.output).toMatchObject({ verdict: "pass", pagesChecked: 5, findings: [] });
    expect(check.output!.warnings).toEqual([]);
    const review = arts.find((a) => a.title === "Site quality review")!;
    expect(review.contentText).toContain("**Verdict:** pass");
    expect(review.contentText).toContain("## Failures\n\n- None.");

    const pending = await listApprovals(h.db, t.ctx, { missionId: mission.id, status: "pending" });
    expect(pending).toHaveLength(1);
    expect(pending[0]!.actionClass).toBe("deploy");

    await decideApproval(h.db, t.ctx, pending[0]!.id, { decision: "approved" });
    await drain(h.db);
    const done = await getMission(h.db, t.ctx, mission.id);
    expect(done.status).toBe("partially_completed");
    expect(done.summary).toBe("4/5 steps done, 1 blocked");
    expect((await getBalance(h.db, t.org.id)).reserved).toBe(0);
  });

  it("site-check blocks when the build output is missing instead of passing silently", async () => {
    const { siteCheck } = await import("@/server/skills/site-check");
    const res = await siteCheck.run({
      orgId: "o",
      missionId: "m",
      stepId: "s",
      stepKey: "site-check",
      goal: "g",
      input: {},
      upstream: {},
      llm: { name: "none", complete: async () => ({ text: "", usage: { inputTokens: 0, outputTokens: 0 }, provider: "none", model: "none", mock: true }) },
      once: async (_k, _t, fn) => fn(),
      writeArtifact: async () => {
        throw new Error("should not write");
      },
      readArtifact: async () => null,
      recordUsage: async () => {},
      log: async () => {},
      hasConnection: async () => false,
      connector: async (provider) => ({ status: "needs_connection", provider, code: "no_connection", reason: "none" }),
    });
    expect(res.status).toBe("blocked");
  });
});

describe("preview route", () => {
  let h: DbHandle;
  beforeAll(async () => {
    h = await makeTestDb();
  });
  afterAll(async () => closeTestDb(h));

  const ORIGIN = "http://localhost:3000";
  function req(path: string, init: RequestInit & { cookie?: string; json?: unknown } = {}) {
    const headers = new Headers(init.headers);
    headers.set("origin", ORIGIN);
    if (init.cookie) headers.set("cookie", init.cookie);
    let body = init.body;
    if (init.json !== undefined) {
      headers.set("content-type", "application/json");
      body = JSON.stringify(init.json);
    }
    return new Request(`${ORIGIN}${path}`, { ...init, headers, body, method: init.method ?? (body ? "POST" : "GET") });
  }
  const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0]!;
  const params = (id: string, path?: string[]) => ({ params: Promise.resolve({ id, path }) });

  it("serves the generated files to the owning tenant with a script-blocking CSP and denies everyone else", async () => {
    const a = await signup(req("/api/auth/signup", { json: { email: "site-a@example.test", name: "A", password: "a strong password 123" } }));
    const b = await signup(req("/api/auth/signup", { json: { email: "site-b@example.test", name: "B", password: "a strong password 123" } }));
    const ca = cookieOf(a);
    const cb = cookieOf(b);
    const { org } = await (await import("@/app/api/auth/me/route")).GET(req("/api/auth/me", { cookie: ca })).then((r) => r.json());
    const { grant } = await import("@/server/ledger/service");
    await grant(h.db, { orgId: org.id, amount: 1000, kind: "purchase", idempotencyKey: "site-topup" });

    const created = await createMissionRoute(req("/api/missions", { cookie: ca, json: { goal: "Create a website for my bakery" } }));
    const { mission } = await created.json();
    expect((await authorizeRoute(req(`/api/missions/${mission.id}/authorize`, { cookie: ca, json: {} }), params(mission.id))).status).toBe(200);
    await drain(h.db);

    // Entry point: the bare preview URL redirects to index.html so relative links resolve.
    const root = await previewRoute(req(`/api/missions/${mission.id}/preview`, { cookie: ca }), params(mission.id, []));
    expect(root.status).toBe(302);
    expect(root.headers.get("location")).toBe(`${ORIGIN}/api/missions/${mission.id}/preview/index.html`);

    const index = await previewRoute(req(`/api/missions/${mission.id}/preview/index.html`, { cookie: ca }), params(mission.id, ["index.html"]));
    expect(index.status).toBe(200);
    expect(index.headers.get("content-type")).toBe("text/html; charset=utf-8");
    const csp = index.headers.get("content-security-policy")!;
    expect(csp).toContain("script-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("default-src 'none'");
    expect(index.headers.get("x-content-type-options")).toBe("nosniff");
    expect(index.headers.get("cache-control")).toContain("no-store");
    const html = await index.text();
    expect(html).toContain('<p class="eyebrow">Bakery</p>');
    expect(html).toContain('href="styles.css"');

    const css = await previewRoute(req(`/api/missions/${mission.id}/preview/styles.css`, { cookie: ca }), params(mission.id, ["styles.css"]));
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toBe("text/css; charset=utf-8");

    // Only the generated files are servable; other artifacts and unknown paths are 404.
    expect((await previewRoute(req(`/api/missions/${mission.id}/preview/nope.html`, { cookie: ca }), params(mission.id, ["nope.html"]))).status).toBe(404);
    expect((await previewRoute(req(`/api/missions/${mission.id}/preview/../x`, { cookie: ca }), params(mission.id, ["..", "x"]))).status).toBe(404);

    // Another tenant gets 404, not the file; unauthenticated gets 401.
    expect((await previewRoute(req(`/api/missions/${mission.id}/preview/index.html`, { cookie: cb }), params(mission.id, ["index.html"]))).status).toBe(404);
    expect((await previewRoute(req(`/api/missions/${mission.id}/preview/index.html`), params(mission.id, ["index.html"]))).status).toBe(401);

    // The generic artifact download still works for site files and keeps the .css extension.
    const arts = await (await import("@/app/api/missions/[id]/artifacts/route")).GET(req(`/api/missions/${mission.id}/artifacts`, { cookie: ca }), params(mission.id)).then((r) => r.json());
    const cssArtifact = arts.artifacts.find((x: { path: string | null }) => x.path === "styles.css");
    const dl = await artifactRoute(req(`/api/artifacts/${cssArtifact.id}?download=1`, { cookie: ca }), { params: Promise.resolve({ id: cssArtifact.id }) });
    expect(dl.headers.get("content-disposition")).toContain('filename="styles-css.css"');
  });
});
