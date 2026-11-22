import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/server/db/client";
import { closeTestDb, makeTenant, makeTestDb } from "./helpers/db";
import { reelPlan } from "@/server/skills/social";
import { detectLanguage, draftsFor, parseOffer, segmentsFor } from "@/server/skills/sales";
import { authorizeMission, createMission, decideApproval, getMission, listApprovals, listArtifacts, listSteps } from "@/server/missions/service";
import { drain } from "@/server/worker/runner";

describe("languages (pure)", () => {
  it("detects Hindi and Gujarati from an answer or from the goal, defaulting to English", () => {
    expect(detectLanguage("Find buyers for basmati in Bharuch")).toBe("en");
    expect(detectLanguage("Find buyers for basmati in Bharuch, message them in Gujarati")).toBe("gu");
    expect(detectLanguage("Find buyers", "hindi")).toBe("hi");
    expect(detectLanguage("नमस्ते")).toBe("hi");
  });

  it("writes WhatsApp and call drafts in the chosen language and keeps an English email alongside", () => {
    const goal = "Find buyers in Bharuch for 200 bags of Daawat basmati rice at Rs 95 per kg, WhatsApp +91 90000 11111, in Gujarati";
    const offer = parseOffer(goal, {});
    expect(offer.product).toBe("Daawat basmati rice");
    expect(offer.language).toBe("gu");
    expect(offer.contact.whatsapp).toBe("+91 90000 11111");
    const fam = segmentsFor(offer.product, offer.market);
    expect(fam.family).toBe("packaged foods and grains");
    expect(fam.segments.map((s) => s.key)).toEqual(["horeca", "kirana", "supermarkets", "distributors", "institutions", "online"]);
    const d = draftsFor(offer, fam.segments)[0]!;
    expect(d.language).toBe("gu");
    expect(d.whatsapp).toMatch(/[઀-૿]/);
    expect(d.whatsapp).toContain("200 bags");
    expect(d.whatsapp).toContain("+91 90000 11111");
    expect(d.call).toMatch(/[઀-૿]/);
    expect(d.email.body).toMatch(/[઀-૿]/);
    expect(d.englishEmail?.body).toContain("Rs 95 per kg");
    const hi = draftsFor(parseOffer(goal, { language: "Hindi" }), fam.segments)[0]!;
    expect(hi.language).toBe("hi");
    expect(hi.whatsapp).toMatch(/[ऀ-ॿ]/);
  });

  it("plans seven reels with captions in the chosen language", () => {
    const plan = reelPlan("Sri Ganesh Agency", "Bharuch", "LG fridges, washing machines and TVs", "gu");
    expect(plan).toHaveLength(7);
    expect(plan.map((r) => r.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const r of plan) {
      expect(r.shots).toHaveLength(3);
      expect(r.caption).toMatch(/[઀-૿]/);
      expect(r.cta).toContain("Sri Ganesh Agency");
    }
  });
});

describe("social mission", () => {
  let h: DbHandle;
  beforeAll(async () => {
    h = await makeTestDb();
  });
  afterAll(async () => closeTestDb(h));

  it("researches, plans reels, reviews, then waits for approval to post and reports blocked without an account", async () => {
    const t = await makeTenant(h, { credits: 1000 });
    const { mission, plan } = await createMission(h.db, t.ctx, {
      goal: "Post Instagram reels for Sri Ganesh Agency in Bharuch selling LG fridges, washing machines and TVs",
      answers: { language: "Gujarati" },
    });
    expect(plan.templateId).toBe("social");
    expect(plan.steps.map((s) => s.key)).toEqual(["research-memo", "reel-plan", "qa-review", "social-publish"]);
    expect(plan.steps.at(-1)).toMatchObject({ requiresApproval: true, actionClass: "publish" });
    expect(plan.capabilities.find((c) => c.label === "Video rendering")?.status).toBe("not_available");

    await authorizeMission(h.db, t.ctx, mission.id);
    await drain(h.db);
    let m = await getMission(h.db, t.ctx, mission.id);
    expect(m.status).toBe("awaiting_review");
    const arts = await listArtifacts(h.db, t.ctx, mission.id);
    const reel = arts.find((a) => a.title === "Reel plan")!.contentText!;
    expect(reel).toContain("Sri Ganesh Agency");
    expect(reel).toContain("Bharuch");
    expect(reel).toContain("proven formats for shops like yours");
    expect(reel).toMatch(/[઀-૿]/);
    expect(reel).toContain("Nothing is posted by this step");
    const review = arts.find((a) => a.title === "Quality review")!.contentText!;
    expect(review).toContain("needs_work");

    const [appr] = await listApprovals(h.db, t.ctx, { missionId: mission.id, status: "pending" });
    expect(appr!.actionClass).toBe("publish");
    const publish = (await listSteps(h.db, t.ctx, mission.id)).find((s) => s.key === "social-publish")!;
    expect(publish.attempts).toBe(0);

    await decideApproval(h.db, t.ctx, appr!.id, { decision: "approved" });
    await drain(h.db);
    m = await getMission(h.db, t.ctx, mission.id);
    expect(m.status).toBe("partially_completed");
    expect(m.summary).toBe("3/4 steps done, 1 blocked");
    const after = (await listSteps(h.db, t.ctx, mission.id)).find((s) => s.key === "social-publish")!;
    expect(after.error).toMatch(/No Instagram or YouTube connection/);
  });
});
