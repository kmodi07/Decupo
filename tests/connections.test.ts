import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import type { DbHandle } from "@/server/db/client";
import { closeTestDb, makeTenant, makeTestDb } from "./helpers/db";
import { authConnections, connectionAccessLog, jobs, oauthStates } from "@/server/db/schema";
import { decryptSecret } from "@/server/secrets/crypto";
import { adapterStatus, describeProvider, listProviders, PROVIDER_IDS } from "@/server/connections/providers";
import { connectWithApiKey, openConnector } from "@/server/connections/service";
import { mockState, resetMockState } from "@/server/connections/adapters";
import { authorizeMission, createMission, decideApproval, getMission, listApprovals, listArtifacts, listSteps } from "@/server/missions/service";
import { drain } from "@/server/worker/runner";
import { POST as signup } from "@/app/api/auth/signup/route";
import { GET as listRoute } from "@/app/api/connections/route";
import { POST as connectRoute } from "@/app/api/connections/[provider]/connect/route";
import { GET as callbackRoute } from "@/app/api/connections/callback/route";
import { POST as revokeRoute } from "@/app/api/connections/[id]/revoke/route";
import { GET as accessLogRoute } from "@/app/api/connections/access-log/route";

const ORIGIN = "http://localhost:3000";
const ADAPTER_ENVS = ["CONNECTOR_DATA_ADAPTER", "CONNECTOR_MAILBOX_ADAPTER", "CONNECTOR_WHATSAPP_ADAPTER", "CONNECTOR_INSTAGRAM_ADAPTER", "CONNECTOR_YOUTUBE_ADAPTER", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "LEAD_DATA_API_URL"];

function setEnv(values: Record<string, string>) {
  for (const k of ADAPTER_ENVS) delete process.env[k];
  Object.assign(process.env, values);
}

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
const params = <T,>(p: T) => ({ params: Promise.resolve(p) });
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0]!;

let h: DbHandle;
let seq = 0;
async function signUpTenant() {
  seq += 1;
  const res = await signup(req("/api/auth/signup", { json: { email: `conn${seq}-${Date.now()}@example.test`, name: `Conn ${seq}`, password: "a strong password 123", orgName: `Conn Org ${seq}` } }));
  expect(res.status).toBe(201);
  const cookie = cookieOf(res);
  const body = (await res.json()) as { org: { id: string }; user: { id: string } };
  return { cookie, orgId: body.org.id, userId: body.user.id };
}

/** Drive the OAuth flow for a Google-backed provider with a stubbed token endpoint. */
async function connectOAuth(cookie: string, provider: "mailbox" | "youtube", tokenScope: string) {
  const start = await connectRoute(req(`/api/connections/${provider}/connect`, { cookie, json: {} }), params({ provider }));
  expect(start.status).toBe(200);
  const { authorizeUrl } = (await start.json()) as { authorizeUrl: string };
  const state = new URL(authorizeUrl).searchParams.get("state")!;
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url === "https://oauth2.googleapis.com/token") {
      const form = new URLSearchParams(String(init?.body));
      expect(form.get("grant_type")).toBe("authorization_code");
      expect(form.get("code")).toBe("the-code");
      expect(form.get("code_verifier")).toBeTruthy();
      return new Response(JSON.stringify({ access_token: "ya29.secret-access-token", refresh_token: "1//secret-refresh", expires_in: 3600, scope: tokenScope, token_type: "Bearer" }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  try {
    const cb = await callbackRoute(req(`/api/connections/callback?state=${encodeURIComponent(state)}&code=the-code`, { cookie }));
    expect(cb.status).toBe(302);
    expect(cb.headers.get("location")).toBe(`${ORIGIN}/app/connections?connected=${provider}`);
  } finally {
    fetchSpy.mockRestore();
  }
}

beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => closeTestDb(h));
afterEach(() => {
  resetMockState();
  setEnv({});
});

describe("provider registry", () => {
  it("lists the five providers with a scope preview and reports adapters as not enabled by default", () => {
    expect(listProviders().map((p) => p.id)).toEqual([...PROVIDER_IDS]);
    for (const p of listProviders()) {
      expect(p.scopes.length).toBeGreaterThan(0);
      for (const s of p.scopes) expect(s.why.length).toBeGreaterThan(10);
      const d = describeProvider(p);
      expect(d.adapter.enabled).toBe(false);
      expect(JSON.stringify(d)).not.toContain("encryptedTokens");
    }
    expect(adapterStatus("data")).toMatchObject({ enabled: false, reason: expect.stringContaining("CONNECTOR_DATA_ADAPTER") });
  });

  it("a live adapter without its environment stays disabled and names what is missing", () => {
    setEnv({ CONNECTOR_DATA_ADAPTER: "live" });
    expect(adapterStatus("data")).toMatchObject({ enabled: false, reason: expect.stringContaining("LEAD_DATA_API_URL") });
    setEnv({ CONNECTOR_DATA_ADAPTER: "live", LEAD_DATA_API_URL: "https://leads.example.test/search" });
    expect(adapterStatus("data")).toEqual({ enabled: true, mode: "live" });
    setEnv({ CONNECTOR_MAILBOX_ADAPTER: "nonsense" });
    expect(adapterStatus("mailbox").enabled).toBe(false);
  });
});

describe("connect and revoke over HTTP", () => {
  it("refuses to connect a provider this server has not enabled", async () => {
    const t = await signUpTenant();
    const res = await connectRoute(req("/api/connections/data/connect", { cookie: t.cookie, json: { apiKey: "whatever-key" } }), params({ provider: "data" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/CONNECTOR_DATA_ADAPTER/);
    expect((await connectRoute(req("/api/connections/nope/connect", { cookie: t.cookie, json: { apiKey: "whatever-key" } }), params({ provider: "nope" }))).status).toBe(404);
  });

  it("stores the key encrypted, never returns it, logs every step, replaces older connections and revokes", async () => {
    setEnv({ CONNECTOR_DATA_ADAPTER: "mock" });
    mockState.acceptedApiKey = "mock-data-key-1234";
    const t = await signUpTenant();

    const short = await connectRoute(req("/api/connections/data/connect", { cookie: t.cookie, json: { apiKey: "ab" } }), params({ provider: "data" }));
    expect(short.status).toBe(400);
    const wrong = await connectRoute(req("/api/connections/data/connect", { cookie: t.cookie, json: { apiKey: "not-the-right-key" } }), params({ provider: "data" }));
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { error: { message: string } }).error.message).toMatch(/did not accept/);

    const ok = await connectRoute(req("/api/connections/data/connect", { cookie: t.cookie, json: { apiKey: "mock-data-key-1234", label: "Sales key" } }), params({ provider: "data" }));
    expect(ok.status).toBe(201);
    const okText = await ok.text();
    expect(okText).not.toContain("mock-data-key-1234");
    expect(okText).not.toContain("encryptedTokens");
    const first = (JSON.parse(okText) as { connection: { id: string; label: string; status: string; kind: string } }).connection;
    expect(first).toMatchObject({ label: "Sales key", status: "active", kind: "api_key" });

    const list = await listRoute(req("/api/connections", { cookie: t.cookie }));
    const listText = await list.text();
    expect(listText).not.toContain("mock-data-key-1234");
    expect(listText).not.toContain("encryptedTokens");
    const listBody = JSON.parse(listText) as { providers: unknown[]; connections: { id: string; provider: string; status: string }[] };
    expect(listBody.providers).toHaveLength(5);
    expect(listBody.connections).toEqual([expect.objectContaining({ id: first.id, provider: "data", status: "active" })]);

    const [row] = await h.db.select().from(authConnections).where(eq(authConnections.id, first.id));
    expect(row!.encryptedTokens.startsWith("v1:")).toBe(true);
    expect(row!.encryptedTokens).not.toContain("mock-data-key-1234");
    expect(JSON.parse(decryptSecret(row!.encryptedTokens, `conn:${t.orgId}`))).toEqual({ kind: "api_key", apiKey: "mock-data-key-1234" });

    // Connecting again replaces the earlier connection instead of leaving two active.
    const again = await connectRoute(req("/api/connections/data/connect", { cookie: t.cookie, json: { apiKey: "mock-data-key-1234" } }), params({ provider: "data" }));
    expect(again.status).toBe(201);
    const second = ((await again.json()) as { connection: { id: string } }).connection;
    const active = await h.db.select().from(authConnections).where(and(eq(authConnections.orgId, t.orgId), eq(authConnections.status, "active")));
    expect(active.map((a) => a.id)).toEqual([second.id]);

    const rev = await revokeRoute(req(`/api/connections/${second.id}/revoke`, { cookie: t.cookie, json: {} }), params({ id: second.id }));
    expect(rev.status).toBe(200);
    expect(((await rev.json()) as { connection: { status: string } }).connection.status).toBe("revoked");

    const log = await accessLogRoute(req("/api/connections/access-log", { cookie: t.cookie }));
    const logText = await log.text();
    expect(logText).not.toContain("mock-data-key-1234");
    const entries = (JSON.parse(logText) as { entries: { action: string; outcome: string; detail: Record<string, unknown> }[] }).entries;
    expect(entries.map((e) => `${e.action}:${e.outcome}`)).toEqual(["revoke:ok", "connect:ok", "revoke:ok", "connect:ok", "connect:failed"]);
    expect(entries[2]!.detail).toMatchObject({ reason: "replaced by a new connection" });
  });

  it("only owners and admins can connect or revoke", async () => {
    setEnv({ CONNECTOR_DATA_ADAPTER: "mock" });
    const t = await makeTenant(h);
    await expect(connectWithApiKey(h.db, { ...t.ctx, role: "member" }, "data", { apiKey: "mock-key-1234" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(connectWithApiKey(h.db, { ...t.ctx, role: "viewer" }, "data", { apiKey: "mock-key-1234" })).rejects.toMatchObject({ code: "forbidden" });
    const c = await connectWithApiKey(h.db, t.ctx, "data", { apiKey: "mock-key-1234" });
    expect(c.status).toBe("active");
  });
});

describe("tenant isolation", () => {
  it("another tenant cannot see, revoke or use a connection", async () => {
    setEnv({ CONNECTOR_DATA_ADAPTER: "mock" });
    const a = await signUpTenant();
    const b = await signUpTenant();
    const created = await connectRoute(req("/api/connections/data/connect", { cookie: a.cookie, json: { apiKey: "mock-key-for-a" } }), params({ provider: "data" }));
    const { connection } = (await created.json()) as { connection: { id: string } };

    const bList = (await (await listRoute(req("/api/connections", { cookie: b.cookie }))).json()) as { connections: unknown[] };
    expect(bList.connections).toEqual([]);
    expect((await revokeRoute(req(`/api/connections/${connection.id}/revoke`, { cookie: b.cookie, json: {} }), params({ id: connection.id }))).status).toBe(404);
    const bLog = (await (await accessLogRoute(req(`/api/connections/access-log?connectionId=${connection.id}`, { cookie: b.cookie }))).json()) as { entries: unknown[] };
    expect(bLog.entries).toEqual([]);

    const scope = { missionId: "00000000-0000-0000-0000-000000000000", stepId: "00000000-0000-0000-0000-000000000000", actor: "agent:Scout" };
    expect(await openConnector(h.db, { orgId: b.orgId, ...scope }, "data")).toMatchObject({ status: "needs_connection", code: "no_connection" });
    expect(await openConnector(h.db, { orgId: a.orgId, ...scope }, "data")).toMatchObject({ status: "ready", connectionId: connection.id });

    // A's connection is still active after B's attempt.
    const [row] = await h.db.select().from(authConnections).where(eq(authConnections.id, connection.id));
    expect(row!.status).toBe("active");
  });
});

describe("OAuth flow", () => {
  it("builds a PKCE authorisation URL with only the previewed scopes and finishes through the callback", async () => {
    setEnv({ CONNECTOR_MAILBOX_ADAPTER: "mock", GOOGLE_CLIENT_ID: "test-client-id", GOOGLE_CLIENT_SECRET: "test-client-secret" });
    const t = await signUpTenant();
    const start = await connectRoute(req("/api/connections/mailbox/connect", { cookie: t.cookie, json: {} }), params({ provider: "mailbox" }));
    expect(start.status).toBe(200);
    const { authorizeUrl, scopes } = (await start.json()) as { authorizeUrl: string; scopes: string[] };
    const u = new URL(authorizeUrl);
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(u.searchParams.get("client_id")).toBe("test-client-id");
    expect(u.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/connections/callback`);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email");
    expect(scopes).toHaveLength(2);
    expect(authorizeUrl).not.toContain("test-client-secret");

    // A forged or stale state is refused and the user lands back on the page with an error.
    const bad = await callbackRoute(req("/api/connections/callback?state=forged&code=x", { cookie: t.cookie }));
    expect(bad.status).toBe(302);
    expect(bad.headers.get("location")).toContain("/app/connections?error=");
    // Signed-out callbacks go to login, never to a provider error body.
    expect((await callbackRoute(req("/api/connections/callback?state=forged&code=x"))).headers.get("location")).toContain("/login");

    await connectOAuth(t.cookie, "mailbox", "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email");

    const list = (await (await listRoute(req("/api/connections", { cookie: t.cookie }))).text());
    expect(list).not.toContain("ya29.secret-access-token");
    expect(list).not.toContain("secret-refresh");
    const conn = (JSON.parse(list) as { connections: { provider: string; kind: string; label: string; scopes: string[] }[] }).connections[0]!;
    expect(conn).toMatchObject({ provider: "mailbox", kind: "oauth", label: "mock mailbox account" });
    expect(conn.scopes).toContain("https://www.googleapis.com/auth/gmail.send");
    expect(await h.db.select().from(oauthStates).where(eq(oauthStates.orgId, t.orgId))).toEqual([]); // state consumed
  });

  it("the callback must come from the user who started the flow", async () => {
    setEnv({ CONNECTOR_MAILBOX_ADAPTER: "mock", GOOGLE_CLIENT_ID: "test-client-id", GOOGLE_CLIENT_SECRET: "test-client-secret" });
    const a = await signUpTenant();
    const b = await signUpTenant();
    const start = await connectRoute(req("/api/connections/mailbox/connect", { cookie: a.cookie, json: {} }), params({ provider: "mailbox" }));
    const state = new URL(((await start.json()) as { authorizeUrl: string }).authorizeUrl).searchParams.get("state")!;
    const cb = await callbackRoute(req(`/api/connections/callback?state=${encodeURIComponent(state)}&code=the-code`, { cookie: b.cookie }));
    expect(cb.headers.get("location")).toMatch(/error=.*another\+session|error=.*another%20session/);
    expect(await h.db.select().from(authConnections).where(eq(authConnections.orgId, b.orgId))).toEqual([]);
    expect(await h.db.select().from(authConnections).where(eq(authConnections.orgId, a.orgId))).toEqual([]);
  });
});

const GOAL = "Find buyers in Delhi for 500 kg of ashwagandha root at Rs 450 per kg, contact mohit@example.test or +91 98765 43210";

describe("buyer-finding mission with mocked providers", () => {
  it("finds leads, waits for approval before sending, then sends the batch once and records every message", async () => {
    setEnv({ CONNECTOR_DATA_ADAPTER: "mock", CONNECTOR_MAILBOX_ADAPTER: "mock", CONNECTOR_WHATSAPP_ADAPTER: "mock", GOOGLE_CLIENT_ID: "test-client-id", GOOGLE_CLIENT_SECRET: "test-client-secret" });
    const t = await makeTenant(h, { credits: 1000 });
    await connectWithApiKey(h.db, t.ctx, "data", { apiKey: "mock-data-key" });
    await connectWithApiKey(h.db, t.ctx, "whatsapp", { apiKey: "123456:mock-wa-token" });
    const web = await signUpTenant(); // mailbox goes through the OAuth flow for its own tenant below
    void web;
    // Mailbox for this tenant: insert through the service path by running the OAuth flow is HTTP-bound, so use the API-key-free
    // path of the test helper instead: create a second tenant via HTTP is not the same org. Insert via completeOAuth is covered
    // above; here the mock mailbox connection is created directly through the same encrypt path as the service.
    const { encryptSecret } = await import("@/server/secrets/crypto");
    await h.db.insert(authConnections).values({
      orgId: t.org.id,
      userId: t.user.id,
      provider: "mailbox",
      kind: "oauth",
      label: "seller@example.test",
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
      encryptedTokens: encryptSecret(JSON.stringify({ kind: "oauth", accessToken: "mock-at", refreshToken: null, expiresAt: null, tokenType: "Bearer", scope: null }), `conn:${t.org.id}`),
      status: "active",
    });

    const { mission } = await createMission(h.db, t.ctx, { goal: GOAL });
    await authorizeMission(h.db, t.ctx, mission.id);
    await drain(h.db);

    let m = await getMission(h.db, t.ctx, mission.id);
    expect(m.status).toBe("awaiting_review");
    const steps = Object.fromEntries((await listSteps(h.db, t.ctx, mission.id)).map((s) => [s.key, s]));
    expect(steps["lead-search"]!.status).toBe("succeeded");
    expect(steps["lead-search"]!.output).toMatchObject({ leadsRetrieved: 6, mock: true });
    expect(steps["outreach-send"]!.status).toBe("awaiting_approval");
    expect(steps["outreach-send"]!.attempts).toBe(0);
    expect(mockState.sent).toHaveLength(0);
    const arts = await listArtifacts(h.db, t.ctx, mission.id);
    const leadList = arts.find((a) => a.title === "Lead list")!.contentText!;
    expect(leadList).toContain("Test data from the mock adapter");
    expect(leadList).toContain("buyer1@example.test");
    const leadData = JSON.parse(arts.find((a) => a.title === "Lead list (data)")!.contentText!) as { columns: string[]; rows: unknown[] };
    expect(leadData.columns).toEqual(["segment", "organisation", "contact name", "role", "city", "channel", "email", "phone", "source", "notes"]);
    expect(leadData.rows).toHaveLength(6);
    const review = arts.find((a) => a.title === "Quality review")!.contentText!;
    expect(review).not.toContain("No buyer contacts have been retrieved");
    expect(review).toContain("Offline placeholder content in: lead-search");

    const [appr] = await listApprovals(h.db, t.ctx, { missionId: mission.id, status: "pending" });
    expect(appr!.actionClass).toBe("external_contact");
    await decideApproval(h.db, t.ctx, appr!.id, { decision: "approved" });
    await drain(h.db);

    m = await getMission(h.db, t.ctx, mission.id);
    expect(m.status).toBe("completed");
    expect(m.summary).toBe("6/6 steps done");
    const send = (await listSteps(h.db, t.ctx, mission.id)).find((s) => s.key === "outreach-send")!;
    expect(send.status).toBe("succeeded");
    expect(send.output).toMatchObject({ sent: 6, failed: 0, attempted: 6, unreachable: 0, remaining: 0, partial: false, mock: true });
    expect(mockState.sent).toHaveLength(6);
    expect(mockState.sent.filter((s) => s.channel === "email").map((s) => s.provider)).toEqual(["mailbox", "mailbox", "mailbox"]);
    expect(mockState.sent.filter((s) => s.channel === "whatsapp").map((s) => s.provider)).toEqual(["whatsapp", "whatsapp", "whatsapp"]);
    for (const s of mockState.sent) expect(s.body).toContain("500 kg");
    const report = (await listArtifacts(h.db, t.ctx, mission.id)).find((a) => a.title === "Send report")!.contentText!;
    expect(report).toContain("6 of 6 messages sent");
    expect(report).toContain("mock adapter");

    const log = await h.db.select().from(connectionAccessLog).where(and(eq(connectionAccessLog.orgId, t.org.id), eq(connectionAccessLog.missionId, mission.id)));
    expect(log.filter((e) => e.action === "send" && e.outcome === "ok")).toHaveLength(6);
    expect(log.filter((e) => e.action === "lead_search")).toHaveLength(1);
    expect(log.every((e) => e.stepId !== null && e.actor.startsWith("agent:"))).toBe(true);
    expect(JSON.stringify(log)).not.toContain("mock-data-key");
  });

  it("a provider outage mid-batch retries the step and never sends a message twice", async () => {
    setEnv({ CONNECTOR_DATA_ADAPTER: "mock", CONNECTOR_WHATSAPP_ADAPTER: "mock" });
    const t = await makeTenant(h, { credits: 1000 });
    await connectWithApiKey(h.db, t.ctx, "data", { apiKey: "mock-data-key" });
    await connectWithApiKey(h.db, t.ctx, "whatsapp", { apiKey: "123456:mock-wa-token" });
    // Email-only leads are unreachable without a mailbox; the three WhatsApp leads go out, the second one fails once.
    mockState.failNextSendTo = ["+91 90000 00004"];

    const { mission } = await createMission(h.db, t.ctx, { goal: GOAL });
    await authorizeMission(h.db, t.ctx, mission.id);
    await drain(h.db);
    const [appr] = await listApprovals(h.db, t.ctx, { missionId: mission.id, status: "pending" });
    expect(mockState.sent).toHaveLength(0);
    await decideApproval(h.db, t.ctx, appr!.id, { decision: "approved" });
    await drain(h.db);
    // Attempt 1 sent two messages, hit the outage on the second recipient and was re-queued with backoff.
    let send = (await listSteps(h.db, t.ctx, mission.id)).find((s) => s.key === "outreach-send")!;
    expect(send.status).toBe("ready");
    expect(send.attempts).toBe(1);
    expect(send.error).toMatch(/Simulated provider outage/);
    expect(mockState.sent.map((s) => s.to)).toEqual(["+91 90000 00002"]);
    await h.db.update(jobs).set({ runAt: new Date(Date.now() - 1000) }).where(and(eq(jobs.orgId, t.org.id), eq(jobs.status, "queued")));
    await drain(h.db);

    send = (await listSteps(h.db, t.ctx, mission.id)).find((s) => s.key === "outreach-send")!;
    expect(send.status).toBe("succeeded");
    expect(send.attempts).toBe(2);
    expect(send.output).toMatchObject({ sent: 3, failed: 0, attempted: 3, unreachable: 3, partial: false });
    expect(mockState.sent.map((s) => s.to)).toEqual(["+91 90000 00002", "+91 90000 00004", "+91 90000 00006"]);
    const log = await h.db.select().from(connectionAccessLog).where(and(eq(connectionAccessLog.missionId, mission.id), eq(connectionAccessLog.action, "send")));
    expect(log.filter((e) => e.outcome === "ok")).toHaveLength(3);
    expect(log.filter((e) => e.outcome === "failed")).toHaveLength(1);
    expect(log.find((e) => e.outcome === "failed")!.detail).toMatchObject({ to: "+91 90000 00004", error: expect.stringContaining("Simulated provider outage") });
    expect((await getMission(h.db, t.ctx, mission.id)).status).toBe("completed");
  });

  it("with a connection row but no adapter enabled on this server, the step blocks and says why", async () => {
    setEnv({ CONNECTOR_DATA_ADAPTER: "mock" });
    const t = await makeTenant(h, { credits: 1000 });
    await connectWithApiKey(h.db, t.ctx, "data", { apiKey: "mock-data-key" });
    setEnv({});
    const { mission } = await createMission(h.db, t.ctx, { goal: GOAL });
    await authorizeMission(h.db, t.ctx, mission.id);
    await drain(h.db);
    const lead = (await listSteps(h.db, t.ctx, mission.id)).find((s) => s.key === "lead-search")!;
    expect(lead.status).toBe("blocked");
    expect(lead.error).toMatch(/not enabled on this server/);
    expect((await listSteps(h.db, t.ctx, mission.id)).find((s) => s.key === "outreach-send")!.status).toBe("skipped");
    expect(await listApprovals(h.db, t.ctx, { missionId: mission.id })).toHaveLength(0);
  });
});

describe("social mission with a mocked Instagram account", () => {
  const goal = "Post Instagram reels for Sri Ganesh Agency in Bharuch selling LG fridges, washing machines and TVs";

  it("posts exactly one approved reel from the given video link and records it", async () => {
    setEnv({ CONNECTOR_INSTAGRAM_ADAPTER: "mock" });
    const t = await makeTenant(h, { credits: 1000 });
    await connectWithApiKey(h.db, t.ctx, "instagram", { apiKey: "17841400000000000:mock-ig-token" });
    const { mission } = await createMission(h.db, t.ctx, { goal, answers: { language: "Gujarati", videoUrl: "https://cdn.example.test/reel-1.mp4" } });
    await authorizeMission(h.db, t.ctx, mission.id);
    await drain(h.db);
    expect((await getMission(h.db, t.ctx, mission.id)).status).toBe("awaiting_review");
    expect(mockState.published).toHaveLength(0);
    const [appr] = await listApprovals(h.db, t.ctx, { missionId: mission.id, status: "pending" });
    expect(appr!.actionClass).toBe("publish");
    await decideApproval(h.db, t.ctx, appr!.id, { decision: "approved" });
    await drain(h.db);
    const m = await getMission(h.db, t.ctx, mission.id);
    expect(m.status).toBe("completed");
    const pub = (await listSteps(h.db, t.ctx, mission.id)).find((s) => s.key === "social-publish")!;
    expect(pub.output).toMatchObject({ posted: 1, platform: "instagram", mock: true });
    expect(mockState.published).toHaveLength(1);
    expect(mockState.published[0]).toMatchObject({ provider: "instagram", videoUrl: "https://cdn.example.test/reel-1.mp4" });
    expect(mockState.published[0]!.caption).toMatch(/[઀-૿]/);
    const record = (await listArtifacts(h.db, t.ctx, mission.id)).find((a) => a.title === "Post record")!.contentText!;
    expect(record).toContain("mock adapter");
    const log = await h.db.select().from(connectionAccessLog).where(and(eq(connectionAccessLog.missionId, mission.id), eq(connectionAccessLog.action, "publish")));
    expect(log).toHaveLength(1);
    expect(log[0]!.outcome).toBe("ok");
  });

  it("without a video link the connected account is not used and the step blocks", async () => {
    setEnv({ CONNECTOR_INSTAGRAM_ADAPTER: "mock" });
    const t = await makeTenant(h, { credits: 1000 });
    await connectWithApiKey(h.db, t.ctx, "instagram", { apiKey: "17841400000000000:mock-ig-token" });
    const { mission } = await createMission(h.db, t.ctx, { goal });
    await authorizeMission(h.db, t.ctx, mission.id);
    await drain(h.db);
    const [appr] = await listApprovals(h.db, t.ctx, { missionId: mission.id, status: "pending" });
    await decideApproval(h.db, t.ctx, appr!.id, { decision: "approved" });
    await drain(h.db);
    const pub = (await listSteps(h.db, t.ctx, mission.id)).find((s) => s.key === "social-publish")!;
    expect(pub.status).toBe("blocked");
    expect(pub.error).toMatch(/No video to post/);
    expect(mockState.published).toHaveLength(0);
    expect((await getMission(h.db, t.ctx, mission.id)).summary).toBe("3/4 steps done, 1 blocked");
  });
});
