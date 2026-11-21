import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { appOrigin } from "../auth/csrf";
import type { Db } from "../db/client";
import { authConnections, connectionAccessLog, oauthStates, type AuthConnection, type ConnectionAccessLogEntry } from "../db/schema";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { decryptSecret, encryptSecret } from "../secrets/crypto";
import { requirePermission, type TenantContext } from "../tenancy/rbac";
import { getAdapter, ProviderError, type Credentials, type Lead, type LeadQuery, type OutboundMessage, type PublishResult, type ReelToPublish, type SendResult } from "./adapters";
import { adapterStatus, describeProvider, getProvider, isProviderId, listProviders, type ProviderCapability, type ProviderId } from "./providers";

/**
 * Connections service (backlog B-30).
 *
 * Tokens are encrypted with the secrets envelope (AAD = organisation id) and
 * decrypted only inside this module, for an adapter call. Nothing exported
 * here returns a token, and every connect, revoke and external call writes a
 * row to `connection_access_log`.
 */

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const REFRESH_SKEW_MS = 60 * 1000;

const aadFor = (orgId: string) => `conn:${orgId}`;

// ---------------------------------------------------------------------------
// Safe views
// ---------------------------------------------------------------------------
export type ConnectionView = {
  id: string;
  provider: ProviderId;
  kind: string;
  label: string | null;
  externalAccountId: string | null;
  scopes: string[];
  status: string;
  createdAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
};

function toView(c: AuthConnection): ConnectionView {
  return {
    id: c.id,
    provider: c.provider as ProviderId,
    kind: c.kind,
    label: c.label,
    externalAccountId: c.externalAccountId,
    scopes: c.scopes,
    status: c.status,
    createdAt: c.createdAt,
    revokedAt: c.revokedAt,
    lastUsedAt: c.lastUsedAt,
  };
}

export async function listConnections(db: Db, ctx: TenantContext): Promise<ConnectionView[]> {
  const rows = await db.select().from(authConnections).where(eq(authConnections.orgId, ctx.orgId)).orderBy(desc(authConnections.createdAt));
  return rows.map(toView);
}

/** Providers with adapter status, plus this tenant's connections. */
export async function connectionsOverview(db: Db, ctx: TenantContext) {
  return { providers: listProviders().map(describeProvider), connections: await listConnections(db, ctx) };
}

export async function listAccessLog(db: Db, ctx: TenantContext, opts: { connectionId?: string; limit?: number } = {}): Promise<ConnectionAccessLogEntry[]> {
  const conds = [eq(connectionAccessLog.orgId, ctx.orgId)];
  if (opts.connectionId) conds.push(eq(connectionAccessLog.connectionId, opts.connectionId));
  return db
    .select()
    .from(connectionAccessLog)
    .where(and(...conds))
    .orderBy(desc(connectionAccessLog.createdAt))
    .limit(Math.min(opts.limit ?? 200, 500));
}

// ---------------------------------------------------------------------------
// Access log
// ---------------------------------------------------------------------------
export type AccessLogInput = {
  orgId: string;
  connectionId: string | null;
  provider: ProviderId;
  action: "connect" | "scope_preview" | "revoke" | "refresh" | "lead_search" | "send" | "publish";
  actor: string;
  outcome: "ok" | "failed" | "denied";
  missionId?: string | null;
  stepId?: string | null;
  detail?: Record<string, unknown>;
};

export async function logAccess(db: Db, e: AccessLogInput): Promise<void> {
  await db.insert(connectionAccessLog).values({
    orgId: e.orgId,
    connectionId: e.connectionId,
    provider: e.provider,
    action: e.action,
    actor: e.actor,
    missionId: e.missionId ?? null,
    stepId: e.stepId ?? null,
    outcome: e.outcome,
    detail: e.detail ?? {},
  });
}

// ---------------------------------------------------------------------------
// Connect: API key
// ---------------------------------------------------------------------------
export const apiKeyConnectSchema = z.object({
  apiKey: z.string().trim().min(4, "Paste the full key").max(4096),
  label: z.string().trim().max(120).optional(),
});

function parseProvider(raw: unknown): ProviderId {
  if (!isProviderId(raw)) throw new NotFoundError("Provider");
  return raw;
}

function requireAdapter(provider: ProviderId) {
  const status = adapterStatus(provider);
  if (!status.enabled) throw new ConflictError(`${getProvider(provider).name} cannot be connected on this server yet: ${status.reason}`);
  const adapter = getAdapter(provider);
  if (!adapter) throw new ConflictError(`${getProvider(provider).name} has no adapter.`);
  return adapter;
}

async function retireActive(db: Db, orgId: string, provider: ProviderId, actor: string, keepId?: string) {
  const active = await db
    .select({ id: authConnections.id })
    .from(authConnections)
    .where(and(eq(authConnections.orgId, orgId), eq(authConnections.provider, provider), eq(authConnections.status, "active")));
  const ids = active.map((a) => a.id).filter((id) => id !== keepId);
  if (!ids.length) return;
  await db.update(authConnections).set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() }).where(inArray(authConnections.id, ids));
  for (const id of ids) await logAccess(db, { orgId, connectionId: id, provider, action: "revoke", actor, outcome: "ok", detail: { reason: "replaced by a new connection" } });
}

export async function connectWithApiKey(db: Db, ctx: TenantContext, providerRaw: unknown, raw: unknown): Promise<ConnectionView> {
  requirePermission(ctx, "connection:manage");
  const provider = parseProvider(providerRaw);
  const def = getProvider(provider);
  if (def.authKind !== "api_key") throw new ValidationError(`${def.name} connects with OAuth, not an API key.`);
  const parsed = apiKeyConnectSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid input");
  const adapter = requireAdapter(provider);
  const actor = `user:${ctx.userId}`;
  const creds: Credentials = { kind: "api_key", apiKey: parsed.data.apiKey };

  let verified: { label: string; externalAccountId: string | null };
  try {
    verified = await adapter.verify(creds);
  } catch (err) {
    await logAccess(db, { orgId: ctx.orgId, connectionId: null, provider, action: "connect", actor, outcome: "failed", detail: { error: safeError(err) } });
    throw new ValidationError(`${def.name} did not accept the key: ${safeError(err)}`);
  }
  await retireActive(db, ctx.orgId, provider, actor);
  const [row] = await db
    .insert(authConnections)
    .values({
      orgId: ctx.orgId,
      userId: ctx.userId,
      provider,
      kind: "api_key",
      label: parsed.data.label || verified.label,
      externalAccountId: verified.externalAccountId,
      scopes: def.scopes.map((s) => s.id),
      encryptedTokens: encryptSecret(JSON.stringify(creds), aadFor(ctx.orgId)),
      status: "active",
    })
    .returning();
  await logAccess(db, { orgId: ctx.orgId, connectionId: row!.id, provider, action: "connect", actor, outcome: "ok", detail: { kind: "api_key", adapter: adapter.mode, scopes: row!.scopes } });
  return toView(row!);
}

// ---------------------------------------------------------------------------
// Connect: OAuth (authorisation code + PKCE)
// ---------------------------------------------------------------------------
export function oauthRedirectUri(): string {
  return `${appOrigin()}/api/connections/callback`;
}

export async function startOAuth(db: Db, ctx: TenantContext, providerRaw: unknown): Promise<{ authorizeUrl: string; scopes: string[] }> {
  requirePermission(ctx, "connection:manage");
  const provider = parseProvider(providerRaw);
  const def = getProvider(provider);
  if (def.authKind !== "oauth" || !def.oauth) throw new ValidationError(`${def.name} connects with an API key, not OAuth.`);
  requireAdapter(provider);
  const clientId = process.env[def.oauth.clientIdEnv];
  if (!clientId) throw new ConflictError(`${def.name} cannot be connected on this server yet: ${def.oauth.clientIdEnv} is not set.`);

  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  await db.insert(oauthStates).values({
    orgId: ctx.orgId,
    userId: ctx.userId,
    provider,
    state,
    encryptedVerifier: encryptSecret(verifier, aadFor(ctx.orgId)),
    expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
  });
  const scopes = def.scopes.map((s) => s.id);
  const url = new URL(def.oauth.authorizeUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", oauthRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes.join(def.oauth.scopeSeparator));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  for (const [k, v] of Object.entries(def.oauth.extraAuthorizeParams ?? {})) url.searchParams.set(k, v);
  await logAccess(db, { orgId: ctx.orgId, connectionId: null, provider, action: "scope_preview", actor: `user:${ctx.userId}`, outcome: "ok", detail: { scopes } });
  return { authorizeUrl: url.toString(), scopes };
}

const tokenResponse = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

async function postForm(url: string, form: Record<string, string>): Promise<z.infer<typeof tokenResponse>> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString() });
  const text = await res.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  if (!res.ok) {
    const b = body as { error_description?: string; error?: string };
    throw new Error(b.error_description ?? b.error ?? `HTTP ${res.status}`);
  }
  const parsed = tokenResponse.safeParse(body);
  if (!parsed.success) throw new Error("Token endpoint returned an unexpected response");
  return parsed.data;
}

/**
 * Finish an OAuth flow. `ctx` is the signed-in user hitting the callback; the
 * state row must have been created by that same user, so a leaked redirect
 * cannot attach someone else's account to this workspace.
 */
export async function completeOAuth(db: Db, ctx: TenantContext, q: { state?: string | null; code?: string | null; error?: string | null }): Promise<ConnectionView> {
  if (!q.state) throw new ValidationError("Missing OAuth state");
  const [st] = await db.select().from(oauthStates).where(and(eq(oauthStates.state, q.state), gt(oauthStates.expiresAt, new Date()))).limit(1);
  // Single use: consume this state and any other flow the same user left half-finished for this provider.
  if (st) await db.delete(oauthStates).where(and(eq(oauthStates.userId, st.userId), eq(oauthStates.provider, st.provider)));
  if (!st || st.userId !== ctx.userId || st.orgId !== ctx.orgId) throw new ValidationError("This sign-in link has expired or belongs to another session. Start again from Connected apps.");
  const provider = st.provider as ProviderId;
  const def = getProvider(provider);
  const actor = `user:${ctx.userId}`;
  if (q.error || !q.code) {
    await logAccess(db, { orgId: ctx.orgId, connectionId: null, provider, action: "connect", actor, outcome: "denied", detail: { error: q.error ?? "no code" } });
    throw new ValidationError(q.error === "access_denied" ? "You declined the connection." : `The provider returned an error: ${q.error ?? "no code"}`);
  }
  const adapter = requireAdapter(provider);
  const oauth = def.oauth!;
  let token: z.infer<typeof tokenResponse>;
  try {
    token = await postForm(oauth.tokenUrl, {
      grant_type: "authorization_code",
      code: q.code,
      redirect_uri: oauthRedirectUri(),
      client_id: process.env[oauth.clientIdEnv] ?? "",
      client_secret: process.env[oauth.clientSecretEnv] ?? "",
      code_verifier: decryptSecret(st.encryptedVerifier, aadFor(ctx.orgId)),
    });
  } catch (err) {
    await logAccess(db, { orgId: ctx.orgId, connectionId: null, provider, action: "connect", actor, outcome: "failed", detail: { error: safeError(err) } });
    throw new ValidationError(`Could not finish connecting ${def.name}: ${safeError(err)}`);
  }
  const creds: Credentials = {
    kind: "oauth",
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
    tokenType: token.token_type ?? null,
    scope: token.scope ?? null,
  };
  let verified: { label: string; externalAccountId: string | null };
  try {
    verified = await adapter.verify(creds);
  } catch (err) {
    await logAccess(db, { orgId: ctx.orgId, connectionId: null, provider, action: "connect", actor, outcome: "failed", detail: { error: safeError(err) } });
    throw new ValidationError(`${def.name} connected but the account check failed: ${safeError(err)}`);
  }
  await retireActive(db, ctx.orgId, provider, actor);
  const granted = token.scope ? token.scope.split(/[\s,]+/).filter(Boolean) : def.scopes.map((s) => s.id);
  const [row] = await db
    .insert(authConnections)
    .values({
      orgId: ctx.orgId,
      userId: ctx.userId,
      provider,
      kind: "oauth",
      label: verified.label,
      externalAccountId: verified.externalAccountId,
      scopes: granted,
      encryptedTokens: encryptSecret(JSON.stringify(creds), aadFor(ctx.orgId)),
      status: "active",
    })
    .returning();
  await logAccess(db, { orgId: ctx.orgId, connectionId: row!.id, provider, action: "connect", actor, outcome: "ok", detail: { kind: "oauth", adapter: adapter.mode, scopes: granted, refreshable: !!creds.refreshToken } });
  return toView(row!);
}

// ---------------------------------------------------------------------------
// Revoke
// ---------------------------------------------------------------------------
export async function revokeConnection(db: Db, ctx: TenantContext, id: string): Promise<ConnectionView> {
  requirePermission(ctx, "connection:manage");
  const [c] = await db.select().from(authConnections).where(and(eq(authConnections.id, id), eq(authConnections.orgId, ctx.orgId))).limit(1);
  if (!c) throw new NotFoundError("Connection");
  const provider = c.provider as ProviderId;
  const actor = `user:${ctx.userId}`;
  if (c.status === "revoked") return toView(c);
  let providerSide: "ok" | "skipped" | "failed" = "skipped";
  const adapter = isProviderId(provider) ? getAdapter(provider) : null;
  if (adapter?.revoke) {
    try {
      await adapter.revoke(JSON.parse(decryptSecret(c.encryptedTokens, aadFor(ctx.orgId))) as Credentials);
      providerSide = "ok";
    } catch {
      providerSide = "failed";
    }
  }
  const [row] = await db.update(authConnections).set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() }).where(eq(authConnections.id, c.id)).returning();
  if (isProviderId(provider)) await logAccess(db, { orgId: ctx.orgId, connectionId: c.id, provider, action: "revoke", actor, outcome: "ok", detail: { providerSide } });
  return toView(row!);
}

// ---------------------------------------------------------------------------
// Use (worker side)
// ---------------------------------------------------------------------------
export type ConnectorScope = { orgId: string; missionId: string; stepId: string; actor: string };

export type Connector =
  | {
      status: "ready";
      provider: ProviderId;
      connectionId: string;
      label: string | null;
      mode: "mock" | "live";
      can(cap: ProviderCapability): boolean;
      searchLeads(q: LeadQuery): Promise<Lead[]>;
      sendMessage(m: OutboundMessage): Promise<SendResult>;
      publishReel(r: ReelToPublish): Promise<PublishResult>;
    }
  | { status: "needs_connection"; provider: ProviderId; code: "no_connection" | "not_enabled"; reason: string };

async function freshCredentials(db: Db, c: AuthConnection, scope: ConnectorScope): Promise<Credentials> {
  const provider = c.provider as ProviderId;
  const creds = JSON.parse(decryptSecret(c.encryptedTokens, aadFor(c.orgId))) as Credentials;
  if (creds.kind !== "oauth" || !creds.refreshToken || !creds.expiresAt || creds.expiresAt - REFRESH_SKEW_MS > Date.now()) return creds;
  const def = getProvider(provider);
  const status = adapterStatus(provider);
  if (!def.oauth || !status.enabled || status.mode === "mock") return creds;
  try {
    const token = await postForm(def.oauth.tokenUrl, {
      grant_type: "refresh_token",
      refresh_token: creds.refreshToken,
      client_id: process.env[def.oauth.clientIdEnv] ?? "",
      client_secret: process.env[def.oauth.clientSecretEnv] ?? "",
    });
    const next: Credentials = { ...creds, accessToken: token.access_token, refreshToken: token.refresh_token ?? creds.refreshToken, expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : null };
    await db.update(authConnections).set({ encryptedTokens: encryptSecret(JSON.stringify(next), aadFor(c.orgId)), updatedAt: new Date() }).where(eq(authConnections.id, c.id));
    await logAccess(db, { ...scope, connectionId: c.id, provider, action: "refresh", outcome: "ok" });
    return next;
  } catch (err) {
    await logAccess(db, { ...scope, connectionId: c.id, provider, action: "refresh", outcome: "failed", detail: { error: safeError(err) } });
    throw new ProviderError(provider, `The ${def.name} token could not be refreshed; reconnect the account. (${safeError(err)})`, 401);
  }
}

/**
 * Open a provider for a mission step. Returns `needs_connection` with a
 * user-facing reason when the workspace has no active connection or this
 * server has no adapter; otherwise an object whose every call is logged.
 */
export async function openConnector(db: Db, scope: ConnectorScope, provider: ProviderId): Promise<Connector> {
  const def = getProvider(provider);
  const [c] = await db
    .select()
    .from(authConnections)
    .where(and(eq(authConnections.orgId, scope.orgId), eq(authConnections.provider, provider), eq(authConnections.status, "active")))
    .orderBy(desc(authConnections.createdAt))
    .limit(1);
  if (!c) return { status: "needs_connection", provider, code: "no_connection", reason: `No ${def.name} connection is configured for this workspace. Connect it under Connected apps, then retry.` };
  const status = adapterStatus(provider);
  const adapter = getAdapter(provider);
  if (!status.enabled || !adapter) {
    return { status: "needs_connection", provider, code: "not_enabled", reason: `${def.name} is connected but not enabled on this server: ${status.enabled ? "no adapter" : status.reason}` };
  }
  const base = { orgId: scope.orgId, connectionId: c.id, provider, actor: scope.actor, missionId: scope.missionId, stepId: scope.stepId } as const;

  async function logged<T>(action: AccessLogInput["action"], detail: Record<string, unknown>, fn: (creds: Credentials) => Promise<T>, after: (out: T) => Record<string, unknown>): Promise<T> {
    let creds: Credentials;
    try {
      creds = await freshCredentials(db, c!, scope);
    } catch (err) {
      await logAccess(db, { ...base, action, outcome: "failed", detail: { ...detail, error: safeError(err) } });
      throw err;
    }
    try {
      const out = await fn(creds);
      await logAccess(db, { ...base, action, outcome: "ok", detail: { ...detail, ...after(out) } });
      await db.update(authConnections).set({ lastUsedAt: new Date() }).where(eq(authConnections.id, c!.id));
      return out;
    } catch (err) {
      await logAccess(db, { ...base, action, outcome: "failed", detail: { ...detail, error: safeError(err) } });
      throw err;
    }
  }

  const unsupported = (what: string) => {
    throw new ProviderError(provider, `${def.name} cannot ${what}.`);
  };
  return {
    status: "ready",
    provider,
    connectionId: c.id,
    label: c.label,
    mode: adapter.mode,
    can: (cap) => def.capabilities.includes(cap),
    searchLeads: (q) =>
      adapter.searchLeads
        ? logged("lead_search", { product: q.product, market: q.market, segments: q.segments.map((s) => s.key), limit: q.limit, adapter: adapter.mode }, (creds) => adapter.searchLeads!(creds, q), (leads) => ({ leads: leads.length }))
        : unsupported("search for leads"),
    sendMessage: (m) =>
      adapter.sendMessage
        ? logged("send", { channel: m.channel, to: m.to, subject: m.subject, adapter: adapter.mode }, (creds) => adapter.sendMessage!(creds, m), (r) => ({ providerMessageId: r.providerMessageId }))
        : unsupported("send messages"),
    publishReel: (r) =>
      adapter.publishReel
        ? logged("publish", { title: r.title, videoUrl: r.videoUrl, adapter: adapter.mode }, (creds) => adapter.publishReel!(creds, r), (p) => ({ postId: p.postId, url: p.url, visibility: p.visibility }))
        : unsupported("publish reels"),
  };
}

function safeError(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  // Never let a token that a provider echoed back land in the log.
  return m.replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]").slice(0, 300);
}
