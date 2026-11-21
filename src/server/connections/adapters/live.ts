import { z } from "zod";
import type { ProviderId } from "../providers";
import { ProviderError, type ConnectorAdapter, type Credentials, type Lead, type OutboundMessage } from "./types";

/**
 * Live adapters, selected with `CONNECTOR_<PROVIDER>_ADAPTER=live`. Each one
 * calls the provider's documented HTTP API with the tenant's own credential.
 * They have not been exercised against the real services from this
 * repository (no provider accounts exist here); every call validates the
 * response shape and raises `ProviderError` on anything unexpected, so a
 * surprise is reported as failed, never as done.
 */

const GRAPH = "https://graph.facebook.com/v21.0";
const MAX_VIDEO_BYTES = 256 * 1024 * 1024;

function bearer(creds: Credentials): string {
  return creds.kind === "api_key" ? creds.apiKey : creds.accessToken;
}

async function call<T>(provider: ProviderId, schema: z.ZodType<T>, url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (err) {
    throw new ProviderError(provider, `Could not reach the provider: ${(err as Error).message}`);
  }
  const text = await res.text();
  let body: unknown = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    const b = body as { error?: { message?: string; status?: string } | string; message?: string };
    const msg = typeof b.error === "string" ? b.error : b.error?.message ?? b.message ?? `HTTP ${res.status}`;
    throw new ProviderError(provider, `Provider rejected the request: ${msg}`, res.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ProviderError(provider, "Provider returned an unexpected response shape.", res.status);
  return parsed.data;
}

const jsonHeaders = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });

/** Split "<id>:<token>" API keys used by the Meta providers. */
function metaKey(provider: ProviderId, creds: Credentials): { id: string; token: string } {
  if (creds.kind !== "api_key") throw new ProviderError(provider, "This provider needs an API key.");
  const i = creds.apiKey.indexOf(":");
  if (i <= 0 || i === creds.apiKey.length - 1) throw new ProviderError(provider, "Paste the key as <id>:<access_token>.", 400);
  return { id: creds.apiKey.slice(0, i).trim(), token: creds.apiKey.slice(i + 1).trim() };
}

// ---------------------------------------------------------------------------
// data: the Decupo lead contract. POST <LEAD_DATA_API_URL> with a bearer key.
// ---------------------------------------------------------------------------
const leadSchema = z.object({
  leads: z.array(
    z.object({
      segment: z.string().min(1),
      organisation: z.string().min(1),
      contactName: z.string().nullish(),
      role: z.string().nullish(),
      city: z.string().nullish(),
      channel: z.enum(["email", "whatsapp", "phone"]).optional(),
      email: z.string().email().nullish(),
      phone: z.string().nullish(),
      source: z.string().min(1),
      notes: z.string().nullish(),
    }),
  ),
});

const dataAdapter: ConnectorAdapter = {
  provider: "data",
  mode: "live",
  async verify(creds) {
    if (creds.kind !== "api_key" || !creds.apiKey.trim()) throw new ProviderError("data", "An API key is required.", 400);
    // The contract has no account endpoint; a search with limit 0 validates the key.
    await call("data", leadSchema, process.env.LEAD_DATA_API_URL!, {
      method: "POST",
      headers: jsonHeaders(creds.apiKey),
      body: JSON.stringify({ product: "ping", market: null, segments: [], limit: 0 }),
    });
    return { label: `lead data key ending ${creds.apiKey.slice(-4)}`, externalAccountId: null };
  },
  async searchLeads(creds, q) {
    const res = await call("data", leadSchema, process.env.LEAD_DATA_API_URL!, {
      method: "POST",
      headers: jsonHeaders(bearer(creds)),
      body: JSON.stringify(q),
    });
    return res.leads.slice(0, q.limit).map<Lead>((l) => ({
      segment: l.segment,
      organisation: l.organisation,
      contactName: l.contactName ?? null,
      role: l.role ?? null,
      city: l.city ?? null,
      channel: l.channel ?? (l.email ? "email" : l.phone ? "whatsapp" : "phone"),
      email: l.email ?? null,
      phone: l.phone ?? null,
      source: l.source,
      notes: l.notes ?? null,
    }));
  },
};

// ---------------------------------------------------------------------------
// mailbox: Gmail API users.messages.send
// ---------------------------------------------------------------------------
const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const encodedWord = (s: string) => `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;

export function rfc822(m: OutboundMessage): string {
  return [
    `To: ${m.to}`,
    `Subject: ${encodedWord(m.subject ?? "")}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(m.body, "utf8").toString("base64"),
  ].join("\r\n");
}

async function googleRevoke(creds: Credentials): Promise<void> {
  if (creds.kind !== "oauth") return;
  const token = creds.refreshToken ?? creds.accessToken;
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
}

const mailboxAdapter: ConnectorAdapter = {
  provider: "mailbox",
  mode: "live",
  async verify(creds) {
    const info = await call("mailbox", z.object({ email: z.string().email() }), "https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { authorization: `Bearer ${bearer(creds)}` },
    });
    return { label: info.email, externalAccountId: info.email };
  },
  async sendMessage(creds, m) {
    if (m.channel !== "email") throw new ProviderError("mailbox", "This connection can only send email.");
    const res = await call("mailbox", z.object({ id: z.string() }), "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: jsonHeaders(bearer(creds)),
      body: JSON.stringify({ raw: b64url(rfc822(m)) }),
    });
    return { providerMessageId: res.id };
  },
  revoke: googleRevoke,
};

// ---------------------------------------------------------------------------
// whatsapp: Meta Cloud API /<phone_number_id>/messages
// ---------------------------------------------------------------------------
const whatsappAdapter: ConnectorAdapter = {
  provider: "whatsapp",
  mode: "live",
  async verify(creds) {
    const { id, token } = metaKey("whatsapp", creds);
    const info = await call("whatsapp", z.object({ display_phone_number: z.string().optional(), verified_name: z.string().optional() }), `${GRAPH}/${id}?fields=display_phone_number,verified_name`, {
      headers: { authorization: `Bearer ${token}` },
    });
    return { label: [info.verified_name, info.display_phone_number].filter(Boolean).join(" ") || `number ${id}`, externalAccountId: id };
  },
  async sendMessage(creds, m) {
    if (m.channel !== "whatsapp") throw new ProviderError("whatsapp", "This connection can only send WhatsApp messages.");
    const { id, token } = metaKey("whatsapp", creds);
    const to = m.to.replace(/[^\d]/g, "");
    if (to.length < 8) throw new ProviderError("whatsapp", `"${m.to}" is not a usable phone number.`, 400);
    const res = await call("whatsapp", z.object({ messages: z.array(z.object({ id: z.string() })).min(1) }), `${GRAPH}/${id}/messages`, {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body: m.body } }),
    });
    return { providerMessageId: res.messages[0]!.id };
  },
};

// ---------------------------------------------------------------------------
// instagram: Graph API media container -> publish
// ---------------------------------------------------------------------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const instagramAdapter: ConnectorAdapter = {
  provider: "instagram",
  mode: "live",
  async verify(creds) {
    const { id, token } = metaKey("instagram", creds);
    const info = await call("instagram", z.object({ username: z.string().optional() }), `${GRAPH}/${id}?fields=username`, { headers: { authorization: `Bearer ${token}` } });
    return { label: info.username ? `@${info.username}` : `account ${id}`, externalAccountId: id };
  },
  async publishReel(creds, r) {
    const { id, token } = metaKey("instagram", creds);
    const container = await call("instagram", z.object({ id: z.string() }), `${GRAPH}/${id}/media`, {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify({ media_type: "REELS", video_url: r.videoUrl, caption: r.caption, share_to_feed: true }),
    });
    // Meta processes the video asynchronously; poll until it is ready (about 1 minute at most here).
    for (let i = 0; i < 20; i += 1) {
      const st = await call("instagram", z.object({ status_code: z.string().optional() }), `${GRAPH}/${container.id}?fields=status_code`, { headers: { authorization: `Bearer ${token}` } });
      if (st.status_code === "FINISHED") break;
      if (st.status_code === "ERROR" || st.status_code === "EXPIRED") throw new ProviderError("instagram", `Instagram could not process the video (${st.status_code}).`);
      await sleep(3000);
    }
    const pub = await call("instagram", z.object({ id: z.string() }), `${GRAPH}/${id}/media_publish`, {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify({ creation_id: container.id }),
    });
    const link = await call("instagram", z.object({ permalink: z.string().optional() }), `${GRAPH}/${pub.id}?fields=permalink`, { headers: { authorization: `Bearer ${token}` } }).catch(() => ({ permalink: undefined }));
    return { postId: pub.id, url: link.permalink ?? null, visibility: "published" };
  },
};

// ---------------------------------------------------------------------------
// youtube: Data API resumable upload, private by default
// ---------------------------------------------------------------------------
const youtubeAdapter: ConnectorAdapter = {
  provider: "youtube",
  mode: "live",
  async verify(creds) {
    const info = await call("youtube", z.object({ items: z.array(z.object({ id: z.string(), snippet: z.object({ title: z.string() }).optional() })).optional() }), "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { authorization: `Bearer ${bearer(creds)}` },
    });
    const ch = info.items?.[0];
    return { label: ch?.snippet?.title ?? "YouTube channel", externalAccountId: ch?.id ?? null };
  },
  async publishReel(creds, r) {
    const token = bearer(creds);
    const video = await fetch(r.videoUrl).catch((err) => {
      throw new ProviderError("youtube", `Could not fetch the video: ${(err as Error).message}`);
    });
    if (!video.ok) throw new ProviderError("youtube", `Could not fetch the video (HTTP ${video.status}).`);
    const bytes = Buffer.from(await video.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_VIDEO_BYTES) throw new ProviderError("youtube", "The video is empty or larger than 256 MB.");
    const start = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: { ...jsonHeaders(token), "x-upload-content-type": video.headers.get("content-type") ?? "video/*", "x-upload-content-length": String(bytes.byteLength) },
      body: JSON.stringify({ snippet: { title: r.title.slice(0, 100), description: r.caption }, status: { privacyStatus: "private", selfDeclaredMadeForKids: false } }),
    });
    const location = start.headers.get("location");
    if (!start.ok || !location) throw new ProviderError("youtube", `YouTube refused to start the upload (HTTP ${start.status}).`, start.status);
    const done = await call("youtube", z.object({ id: z.string(), status: z.object({ privacyStatus: z.string().optional() }).optional() }), location, {
      method: "PUT",
      headers: { "content-type": video.headers.get("content-type") ?? "video/*", "content-length": String(bytes.byteLength) },
      body: bytes,
    });
    return { postId: done.id, url: `https://www.youtube.com/watch?v=${done.id}`, visibility: done.status?.privacyStatus ?? "private" };
  },
  revoke: googleRevoke,
};

const LIVE: Record<ProviderId, ConnectorAdapter> = {
  data: dataAdapter,
  mailbox: mailboxAdapter,
  whatsapp: whatsappAdapter,
  instagram: instagramAdapter,
  youtube: youtubeAdapter,
};

export function liveAdapter(provider: ProviderId): ConnectorAdapter {
  return LIVE[provider];
}
