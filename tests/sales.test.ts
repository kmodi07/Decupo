import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { DbHandle } from "@/server/db/client";
import { closeTestDb, makeTenant, makeTestDb } from "./helpers/db";
import { draftsFor, parseOffer, segmentsFor } from "@/server/skills/sales";
import { authorizeMission, createMission, getMission, listApprovals, listArtifacts, listSteps } from "@/server/missions/service";
import { listEvents } from "@/server/missions/events";
import { drain } from "@/server/worker/runner";
import { getBalance } from "@/server/ledger/service";
import { authConnections } from "@/server/db/schema";

const GOAL = "Find buyers in Delhi for 500 kg of ashwagandha root at Rs 450 per kg, contact mohit@example.test or +91 98765 43210";

describe("offer parsing and buyer map (pure)", () => {
  it("reads product, quantity, price, market and contact from the goal and never guesses the rest", () => {
    const o = parseOffer(GOAL, {});
    expect(o.product).toBe("ashwagandha root");
    expect(o.quantity).toBe("500 kg");
    expect(o.price).toMatch(/^Rs 450 per kg$/i);
    expect(o.market).toBe("Delhi");
    expect(o.contact.email).toBe("mohit@example.test");
    expect(o.contact.phone).toBe("+91 98765 43210");
    expect(o.missing).toEqual([]);
    const sparse = parseOffer("Sell my ashwagandha to buyers", {});
    expect(sparse.product).toBe("ashwagandha");
    expect(sparse.missing).toEqual(["quantity", "price", "a way for buyers to reach you"]);
  });

  it("answers override the goal", () => {
    const o = parseOffer("Find buyers for my harvest", { product: "turmeric fingers", quantity: "2 tonnes", price: "₹90/kg", contact: "WhatsApp +91 90000 00000", market: "Mumbai" });
    expect(o).toMatchObject({ product: "turmeric fingers", quantity: "2 tonnes", price: "₹90/kg", market: "Mumbai" });
    expect(o.contact.phone).toBe("+91 90000 00000");
    expect(o.contact.whatsapp).toBe("+91 90000 00000");
    expect(o.missing).toEqual([]);
  });

  it("maps herbs, produce and general goods to different buyer segments without inventing contacts", () => {
    const herbs = segmentsFor("ashwagandha root", "Delhi");
    expect(herbs.family).toBe("medicinal herbs and botanicals");
    expect(herbs.segments.map((s) => s.key)).toEqual(["manufacturers", "wholesale", "exporters", "aggregators", "marketplaces", "brands"]);
    expect(segmentsFor("wheat", null).family).toBe("agricultural produce");
    expect(segmentsFor("steel shelving", "Pune").family).toBe("general goods");
    for (const s of herbs.segments) {
      expect(s.findVia).not.toMatch(/@/);
      expect(s.findVia).not.toMatch(/\+91/);
    }
  });

  it("drafts carry the seller's figures and contact, and placeholders only where facts are missing", () => {
    const full = draftsFor(parseOffer(GOAL, {}), segmentsFor("ashwagandha root", "Delhi").segments);
    expect(full).toHaveLength(6);
    expect(full[0]!.email.body).toContain("500 kg");
    expect(full[0]!.email.body).toContain("Rs 450 per kg");
    expect(full[0]!.email.body).toContain("mohit@example.test");
    expect(full[0]!.whatsapp).toContain("+91 98765 43210");
    expect(full[0]!.email.body).not.toMatch(/\[/);
    const sparse = draftsFor(parseOffer("Sell my ashwagandha to buyers", {}), segmentsFor("ashwagandha", null).segments);
    expect(sparse[0]!.email.body).toContain("[quantity]");
    expect(sparse[0]!.email.body).toContain("[asking price]");
    expect(sparse[0]!.email.body).toContain("[your contact details]");
  });
});

describe("buyer-finding mission", () => {
  let h: DbHandle;
  beforeAll(async () => {
    h = await makeTestDb();
  });
  afterAll(async () => closeTestDb(h));

  it("prepares the offer, buyer map and drafts, then stops honestly: no leads, nothing sent, no approval created", async () => {
    const t = await makeTenant(h, { credits: 1000 });
    const { mission, plan } = await createMission(h.db, t.ctx, { goal: GOAL });
    expect(plan.templateId).toBe("buyers");
    expect(plan.steps.map((s) => s.key)).toEqual(["offer-sheet", "buyer-map", "outreach-sequence", "qa-review", "lead-search", "outreach-send"]);
    expect(plan.steps.find((s) => s.key === "outreach-send")).toMatchObject({ requiresApproval: true, actionClass: "external_contact" });
    expect(plan.capabilities.map((c) => c.status)).toEqual(["supported", "needs_connection", "needs_connection"]);

    await authorizeMission(h.db, t.ctx, mission.id);
    await drain(h.db);

    const m = await getMission(h.db, t.ctx, mission.id);
    expect(m.status).toBe("partially_completed");
    expect(m.summary).toBe("4/6 steps done, 1 blocked, 1 skipped");
    const steps = await listSteps(h.db, t.ctx, mission.id);
    const byKey = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(byKey["offer-sheet"]!.status).toBe("succeeded");
    expect(byKey["buyer-map"]!.status).toBe("succeeded");
    expect(byKey["outreach-sequence"]!.status).toBe("succeeded");
    expect(byKey["qa-review"]!.status).toBe("succeeded");
    expect(byKey["lead-search"]!.status).toBe("blocked");
    expect(byKey["lead-search"]!.error).toMatch(/No lead-data or web-search connection/);
    // Sending never ran, never asked for approval, never counted an attempt.
    expect(byKey["outreach-send"]!.status).toBe("skipped");
    expect(byKey["outreach-send"]!.attempts).toBe(0);
    expect(await listApprovals(h.db, t.ctx, { missionId: mission.id })).toHaveLength(0);
    const events = await listEvents(h.db, t.org.id, mission.id);
    expect(events.some((e) => e.type === "step.started" && (e.payload as { key?: string }).key === "outreach-send")).toBe(false);

    const arts = await listArtifacts(h.db, t.ctx, mission.id);
    expect(arts.map((a) => a.title)).toEqual([
      "Offer sheet",
      "Offer (structured)",
      "Buyer map",
      "Lead list template",
      "Outreach drafts",
      "Outreach drafts (structured)",
      "Quality review",
    ]);
    const offer = arts.find((a) => a.title === "Offer sheet")!.contentText!;
    expect(offer).toContain("| Quantity available | 500 kg |");
    expect(offer).toContain("| Asking price | Rs 450 per kg |");
    expect(offer).toContain("**Complete.**");
    const map = arts.find((a) => a.title === "Buyer map")!.contentText!;
    expect(map).toContain("Khari Baoli");
    expect(map).toContain("No buyer names or contact details were retrieved");
    const drafts = arts.find((a) => a.title === "Outreach drafts")!.contentText!;
    expect(drafts).toContain("Decupo sends nothing without a connected account");
    expect(drafts).toContain("mohit@example.test");
    const review = arts.find((a) => a.title === "Quality review")!.contentText!;
    expect(review).toContain("needs_work");
    expect(review).toContain("No buyer contacts have been retrieved");
    expect((await getBalance(h.db, t.org.id)).reserved).toBe(0);
  });

  it("flags missing offer facts in the quality review instead of filling them in", async () => {
    const t = await makeTenant(h, { credits: 1000 });
    const { mission } = await createMission(h.db, t.ctx, { goal: "Sell my ashwagandha to buyers" });
    await authorizeMission(h.db, t.ctx, mission.id);
    await drain(h.db);
    const arts = await listArtifacts(h.db, t.ctx, mission.id);
    const review = arts.find((a) => a.title === "Quality review")!.contentText!;
    expect(review).toContain("offer-sheet is missing: quantity, price, a way for buyers to reach you");
    const offer = arts.find((a) => a.title === "Offer sheet")!.contentText!;
    expect(offer).toContain("| Asking price | to be confirmed |");
  });

  it("with a data connection but no leads, sending still reports blocked after approval rather than pretending", async () => {
    const t = await makeTenant(h, { credits: 1000 });
    await h.db.insert(authConnections).values({ orgId: t.org.id, userId: t.user.id, provider: "data", status: "active", encryptedTokens: "test" });
    const { mission } = await createMission(h.db, t.ctx, { goal: GOAL });
    await authorizeMission(h.db, t.ctx, mission.id);
    await drain(h.db);
    const lead = (await listSteps(h.db, t.ctx, mission.id)).find((s) => s.key === "lead-search")!;
    expect(lead.status).toBe("blocked");
    expect(lead.error).toMatch(/not implemented yet/);
    const send = (await listSteps(h.db, t.ctx, mission.id)).find((s) => s.key === "outreach-send")!;
    expect(send.status).toBe("skipped");
    await h.db.delete(authConnections).where(eq(authConnections.orgId, t.org.id));
  });
});
