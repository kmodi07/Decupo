import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbHandle } from "@/server/db/client";
import { closeTestDb, makeTestDb } from "./helpers/db";
import { drain } from "@/server/worker/runner";
import { POST as signup } from "@/app/api/auth/signup/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { GET as me } from "@/app/api/auth/me/route";
import { GET as listMissionsRoute, POST as createMissionRoute } from "@/app/api/missions/route";
import { GET as getMissionRoute } from "@/app/api/missions/[id]/route";
import { POST as authorizeRoute } from "@/app/api/missions/[id]/authorize/route";
import { GET as eventsRoute } from "@/app/api/missions/[id]/events/route";
import { GET as artifactRoute } from "@/app/api/artifacts/[id]/route";
import { GET as ledgerRoute } from "@/app/api/credits/ledger/route";
import { GET as healthRoute } from "@/app/api/health/route";

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
const params = (id: string) => ({ params: Promise.resolve({ id }) });
function cookieOf(res: Response) {
  const sc = res.headers.get("set-cookie") ?? "";
  return sc.split(";")[0]!;
}

describe("HTTP API", () => {
  it("rejects unauthenticated and cross-origin requests", async () => {
    expect((await me(req("/api/auth/me"))).status).toBe(401);
    const cross = new Request(`${ORIGIN}/api/missions`, { method: "POST", headers: { origin: "https://evil.example" } });
    expect((await createMissionRoute(cross)).status).toBe(403);
  });

  it("runs the full flow: sign up, create, authorize, worker, events, artifact download, ledger", async () => {
    const su = await signup(req("/api/auth/signup", { json: { email: "api@example.test", name: "Api", password: "a strong password 123", orgName: "Api Org" } }));
    expect(su.status).toBe(201);
    const cookie = cookieOf(su);
    expect(cookie.startsWith("decupo_session=")).toBe(true);

    const meRes = await me(req("/api/auth/me", { cookie }));
    expect(meRes.status).toBe(200);
    const meBody = await meRes.json();
    expect(meBody.org.role).toBe("owner");
    expect(meBody.credits.balance).toBe(100);
    expect(meBody.providers.llm.mock).toBe(true);

    const bad = await createMissionRoute(req("/api/missions", { cookie, json: { goal: "short" } }));
    expect(bad.status).toBe(400);

    const created = await createMissionRoute(req("/api/missions", { cookie, json: { goal: "Create a presentation about renewable energy" } }));
    expect(created.status).toBe(201);
    const { mission, plan } = await created.json();
    expect(plan.capabilities.some((c: { status: string }) => c.status === "not_available")).toBe(true);

    const auth = await authorizeRoute(req(`/api/missions/${mission.id}/authorize`, { cookie, json: {} }), params(mission.id));
    expect(auth.status).toBe(402); // 100 credits < 160 estimate
    const body = await auth.json();
    expect(body.error.code).toBe("insufficient_credits");

    // Top up by signing up a richer org is not possible via API yet; grant directly for the test.
    const { grant } = await import("@/server/ledger/service");
    await grant(h.db, { orgId: meBody.org.id, amount: 400, kind: "purchase", idempotencyKey: "test-topup" });
    const auth2 = await authorizeRoute(req(`/api/missions/${mission.id}/authorize`, { cookie, json: {} }), params(mission.id));
    expect(auth2.status).toBe(200);

    await drain(h.db);

    const detail = await getMissionRoute(req(`/api/missions/${mission.id}`, { cookie }), params(mission.id));
    const d = await detail.json();
    expect(d.mission.status).toBe("completed");
    expect(d.steps).toHaveLength(3);
    expect(d.artifacts).toHaveLength(3);
    expect(d.artifacts[0].contentText).toBeUndefined();
    expect(d.credits.reservedRemaining).toBe(0);

    const ev = await eventsRoute(req(`/api/missions/${mission.id}/events?after=2`, { cookie }), params(mission.id));
    const evBody = await ev.json();
    expect(evBody.events[0].seq).toBe(3);

    // SSE variant ends with a done event for terminal missions.
    const sse = await eventsRoute(req(`/api/missions/${mission.id}/events`, { cookie, headers: { accept: "text/event-stream" } }), params(mission.id));
    expect(sse.headers.get("content-type")).toContain("text/event-stream");
    const text = await sse.text();
    expect(text).toContain("event: mission.created");
    expect(text).toContain("event: done");

    const art = await artifactRoute(req(`/api/artifacts/${d.artifacts[0].id}?download=1`, { cookie }), params(d.artifacts[0].id));
    expect(art.headers.get("content-disposition")).toContain("attachment");
    expect(await art.text()).toContain("Research memo");

    const ledger = await ledgerRoute(req("/api/credits/ledger", { cookie }));
    const lb = await ledger.json();
    expect(lb.balance.reserved).toBe(0);
    expect(lb.entries.map((e: { kind: string }) => e.kind)).toContain("settle");

    const list = await listMissionsRoute(req("/api/missions", { cookie }));
    expect((await list.json()).missions).toHaveLength(1);

    const health = await healthRoute();
    expect((await health.json()).ok).toBe(true);

    const out = await logout(req("/api/auth/logout", { cookie, method: "POST" }));
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await me(req("/api/auth/me", { cookie }))).status).toBe(401);

    const li = await login(req("/api/auth/login", { json: { email: "API@example.test", password: "a strong password 123" } }));
    expect(li.status).toBe(200);
  });

  it("does not expose another tenant's mission through the API", async () => {
    const a = await signup(req("/api/auth/signup", { json: { email: "a@example.test", name: "A", password: "a strong password 123" } }));
    const b = await signup(req("/api/auth/signup", { json: { email: "b@example.test", name: "B", password: "a strong password 123" } }));
    const ca = cookieOf(a);
    const cb = cookieOf(b);
    const created = await createMissionRoute(req("/api/missions", { cookie: ca, json: { goal: "Research something for tenant A only" } }));
    const { mission } = await created.json();
    expect((await getMissionRoute(req(`/api/missions/${mission.id}`, { cookie: cb }), params(mission.id))).status).toBe(404);
    expect((await authorizeRoute(req(`/api/missions/${mission.id}/authorize`, { cookie: cb, json: {} }), params(mission.id))).status).toBe(404);
    expect((await eventsRoute(req(`/api/missions/${mission.id}/events`, { cookie: cb }), params(mission.id))).status).toBe(404);
  });
});
