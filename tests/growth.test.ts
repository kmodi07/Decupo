import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/server/db/client";
import { closeTestDb, makeTenant, makeTestDb } from "./helpers/db";
import { composePromoPlan } from "@/server/skills/growth";
import { businessFromGoal } from "@/server/skills/social";
import { getPlanner, MAX_QUESTIONS } from "@/server/planner/rule-based";
import { renderMarkdown } from "@/lib/markdown";
import { readOfPlan } from "@/lib/plan-read";
import { authorizeMission, createMission, decideApproval, getMission, listApprovals, listArtifacts, listSteps } from "@/server/missions/service";
import { getBalance } from "@/server/ledger/service";
import { drain } from "@/server/worker/runner";

const GOAL = "Help Sri Ganesh Agency in Bharuch sell more LG fridges and TVs this season";

describe("growth planning (pure)", () => {
  it("reads the shop, the town and the products from one sentence", () => {
    expect(businessFromGoal(GOAL, {})).toEqual({ business: "Sri Ganesh Agency", place: "Bharuch", products: "LG fridges and TVs" });
    expect(businessFromGoal("Post Instagram reels for my electronics shop in Bharuch", {})).toMatchObject({ business: "electronics shop", place: "Bharuch" });
  });

  it("writes a four-week plan with broadcasts that carry the shop's own words and no invented numbers", () => {
    const plan = composePromoPlan(GOAL, { contact: "+91 98765 00000" });
    expect(plan.archetype).toBe("electronics");
    expect(plan.business).toBe("Sri Ganesh Agency");
    expect(plan.markdown).toContain("# Four-week sales plan: Sri Ganesh Agency (Bharuch)");
    expect(plan.markdown).toContain("Exchange offer");
    expect(plan.markdown).toContain("LG fridges and TVs");
    expect(plan.markdown).toContain("+91 98765 00000");
    expect(plan.markdown).toContain("| Week | Focus | Do this | Measure |");
    expect(plan.markdown).not.toMatch(/\d+\s?%/);
    expect(plan.broadcasts).toBe(4);
  });

  it("asks only what the goal did not answer, never more than three things", async () => {
    const planner = getPlanner();
    const grow = await planner.plan({ goal: GOAL });
    expect(grow.templateId).toBe("grow");
    expect(grow.prefilled).toEqual({ business: "Sri Ganesh Agency", market: "Bharuch", products: "LG fridges and TVs" });
    expect(grow.questions.map((q) => q.key)).toEqual(["contact"]);
    expect(grow.steps.map((s) => s.key)).toEqual(["research-memo", "promo-plan", "reel-plan", "qa-review", "social-publish"]);
    expect(grow.steps[1]!.input).toMatchObject({ business: "Sri Ganesh Agency", market: "Bharuch" });
    expect(readOfPlan(grow, { withQuestion: true })).toContain("I read the business, the area and what you sell from what you wrote.");

    const buyers = await planner.plan({ goal: "Find buyers in Delhi for 500 kg of ashwagandha root at Rs 450 per kg" });
    expect(buyers.templateId).toBe("buyers");
    expect(buyers.prefilled).toMatchObject({ quantity: "500 kg", market: "Delhi" });
    expect(buyers.questions.map((q) => q.key)).toEqual(["contact", "location", "terms"]);
    expect(buyers.questions.length).toBeLessThanOrEqual(MAX_QUESTIONS);

    const site = await planner.plan({ goal: "Make a website for my tutoring company", answers: { look: "green" } });
    expect(site.prefilled).toEqual({});
    expect(site.questions.map((q) => q.key)).toEqual(["brandName", "audience", "tone"]);

    const named = await planner.plan({ goal: 'Make a website for a bakery called "Crumbs"' });
    expect(named.prefilled).toEqual({ brandName: "Crumbs" });
    expect(named.questions.map((q) => q.key)).toEqual(["audience", "look", "tone"]);
  });
});

describe("markdown renderer", () => {
  it("renders tables, fenced code, lists and quotes and escapes HTML", () => {
    const html = renderMarkdown(["# T", "", "| A | B |", "|---|---|", "| 1 | <b>x</b> |", "", "```", "line one", "line two", "```", "", "> note", "> more", "", "- a", "- b", "", "1. one", "2. two", "", "para **bold** `code`"].join("\n"));
    expect(html).toContain("<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>&lt;b&gt;x&lt;/b&gt;</td></tr></tbody></table>");
    expect(html).toContain("<pre><code>line one\nline two</code></pre>");
    expect(html).toContain("<blockquote>note more</blockquote>");
    expect(html).toContain("<ul><li>a</li><li>b</li></ul>");
    expect(html).toContain("<ol><li>one</li><li>two</li></ol>");
    expect(html).toContain("<p>para <strong>bold</strong> <code>code</code></p>");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("`");
  });
});

describe("growth mission end to end", () => {
  let h: DbHandle;
  beforeAll(async () => {
    h = await makeTestDb();
  });
  afterAll(async () => closeTestDb(h));

  it("researches, plans the month and the reels, waits for approval to post, and charges nothing for the blocked post", async () => {
    const t = await makeTenant(h, { credits: 500 });
    const { mission, plan } = await createMission(h.db, t.ctx, { goal: GOAL, answers: { contact: "+91 98765 00000" } });
    expect(plan.templateId).toBe("grow");
    expect(plan.estimateCredits).toBe(200);

    await authorizeMission(h.db, t.ctx, mission.id);
    await drain(h.db);
    let m = await getMission(h.db, t.ctx, mission.id);
    expect(m.status).toBe("awaiting_review");
    const arts = await listArtifacts(h.db, t.ctx, mission.id);
    expect(arts.map((a) => a.title)).toContain("Four-week sales plan");
    expect(arts.map((a) => a.title)).toContain("Reel plan");
    const promo = arts.find((a) => a.title === "Four-week sales plan")!.contentText!;
    expect(promo).toContain("Sri Ganesh Agency");
    expect(promo).toContain("WhatsApp broadcasts");

    const [appr] = await listApprovals(h.db, t.ctx, { missionId: mission.id, status: "pending" });
    expect(appr!.actionClass).toBe("publish");
    await decideApproval(h.db, t.ctx, appr!.id, { decision: "approved" });
    await drain(h.db);
    m = await getMission(h.db, t.ctx, mission.id);
    expect(m.status).toBe("partially_completed");
    const steps = await listSteps(h.db, t.ctx, mission.id);
    const post = steps.find((s) => s.key === "social-publish")!;
    expect(post.status).toBe("blocked");
    // A step that could not run costs nothing: only the four steps that did work are settled.
    expect(post.actualCredits).toBe(0);
    expect(m.settledCredits).toBe(180);
    expect(await getBalance(h.db, t.org.id)).toEqual({ balance: 320, reserved: 0, available: 320 });
  });
});
