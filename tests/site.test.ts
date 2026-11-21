import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/server/db/client";
import { closeTestDb, makeTenant, makeTestDb } from "./helpers/db";
import { brandNameFromGoal, CONTACT_FORM_NOTICE, generateSite, parseBrief, type SiteFile } from "@/server/skills/site/generate";
import { checkSite, renderReport, resolveHref } from "@/server/skills/site/check";
import { authorizeMission, createMission, decideApproval, getMission, listApprovals, listArtifacts, listSteps } from "@/server/missions/service";
import { drain } from "@/server/worker/runner";
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
  const files = generateSite({ brandName: "Bright Tutors", goal: "Build a website for my tutoring company", pages: PAGES, offline: true });

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

  it("labels offline copy and escapes user text", () => {
    expect(files.find((f) => f.path === "about.html")!.content).toContain("Draft copy");
    const live = generateSite({
      brandName: "<Evil> & Co",
      goal: "x",
      pages: PAGES.slice(0, 2),
      offline: false,
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

describe("site checker (pure)", () => {
  const files = generateSite({ brandName: "Bright Tutors", goal: "Build a website for my tutoring company", pages: PAGES, offline: true });

  it("passes the generated site and reports offline copy as a note, not a failure", () => {
    const report = checkSite(files, { offlineCopy: true });
    expect(report.verdict).toBe("pass");
    expect(report.pagesChecked).toBe(5);
    expect(report.linksChecked).toBeGreaterThan(20);
    expect(report.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(report.findings.map((f) => f.check)).toContain("copy");
    const md = renderReport(report);
    expect(md).toContain("**Verdict:** pass");
    expect(md).toContain("drafted offline");
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
      answers: { brandName: "Bright Tutors" },
    });
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
    expect(siteFiles[0]!.contentText).toContain("<h1>Bright Tutors</h1>");

    const build = steps.find((s) => s.key === "site-build")!;
    expect(build.output).toMatchObject({ pageCount: 5, entry: "index.html", brandName: "Bright Tutors", mock: true });
    expect((build.output!.artifactIds as string[]).sort()).toEqual(siteFiles.map((a) => a.id).sort());

    const check = steps.find((s) => s.key === "site-check")!;
    expect(check.output).toMatchObject({ verdict: "pass", pagesChecked: 5, findings: [] });
    expect((check.output!.warnings as string[]).join(" ")).toMatch(/drafted offline/);
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
    expect(html).toContain("<h1>Bakery</h1>");
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
