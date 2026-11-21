/**
 * Connector provider registry (backlog B-30).
 *
 * A provider is a kind of external account a workspace can connect. Each one
 * says how it authenticates (OAuth or an API key the user pastes), which
 * scopes it asks for and why (shown before connecting), and which adapter
 * modes this server has enabled through environment variables.
 *
 * Nothing here talks to a provider. The adapters in ./adapters do, and only
 * when the operator has enabled them (`CONNECTOR_<PROVIDER>_ADAPTER=live|mock`).
 */

export const PROVIDER_IDS = ["data", "mailbox", "whatsapp", "instagram", "youtube"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type AuthKind = "oauth" | "api_key";

export type ScopePreview = {
  /** Provider-side scope string, or a plain id for API-key providers. */
  id: string;
  label: string;
  /** Why Decupo needs it, in the user's words. */
  why: string;
};

export type ProviderCapability = "lead_search" | "send_email" | "send_whatsapp" | "publish_reel";

export type OAuthConfig = {
  authorizeUrl: string;
  tokenUrl: string;
  /** Endpoint that invalidates a token on the provider side (best effort on revoke). */
  revokeUrl?: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  /** Extra query parameters on the authorisation request (offline access etc.). */
  extraAuthorizeParams?: Record<string, string>;
  /** Separator between scopes in the `scope` parameter. */
  scopeSeparator: string;
};

export type ProviderDefinition = {
  id: ProviderId;
  name: string;
  description: string;
  authKind: AuthKind;
  scopes: ScopePreview[];
  capabilities: ProviderCapability[];
  /** Environment variable that selects the adapter: "mock" | "live"; absent means not enabled. */
  adapterEnv: string;
  /** Extra environment the live adapter needs (documented in .env.example). */
  liveEnv: string[];
  oauth?: OAuthConfig;
  /** What the user pastes for API-key providers. */
  apiKey?: { label: string; hint: string };
  /** Honest notes: app review, template rules, quotas. Shown on the Connected apps page. */
  notes: string[];
};

const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  data: {
    id: "data",
    name: "Lead data provider",
    description: "Looks up organisations and contacts for each buyer segment. You bring your own account with a lead-data service that speaks the Decupo lead contract.",
    authKind: "api_key",
    scopes: [
      { id: "leads:search", label: "Search organisations and contacts", why: "So Scout can fill the lead list for your buyer segments." },
    ],
    capabilities: ["lead_search"],
    adapterEnv: "CONNECTOR_DATA_ADAPTER",
    liveEnv: ["LEAD_DATA_API_URL"],
    apiKey: { label: "API key", hint: "Your key with the lead-data service. Stored encrypted, used only for searches you run." },
    notes: [
      "Results come from your provider as returned; Decupo does not add, guess or enrich contacts.",
      "Check the provider's terms for outreach use of the contacts it returns.",
    ],
  },
  mailbox: {
    id: "mailbox",
    name: "Email (Google account)",
    description: "Sends approved outreach from your own Gmail or Google Workspace address, one batch per approval.",
    authKind: "oauth",
    scopes: [
      { id: "https://www.googleapis.com/auth/gmail.send", label: "Send email as you", why: "So Echo can send the approved batch from your address. Decupo cannot read your inbox." },
      { id: "https://www.googleapis.com/auth/userinfo.email", label: "See your email address", why: "To show which account is connected." },
    ],
    capabilities: ["send_email"],
    adapterEnv: "CONNECTOR_MAILBOX_ADAPTER",
    liveEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    oauth: {
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      revokeUrl: "https://oauth2.googleapis.com/revoke",
      clientIdEnv: "GOOGLE_CLIENT_ID",
      clientSecretEnv: "GOOGLE_CLIENT_SECRET",
      extraAuthorizeParams: { access_type: "offline", prompt: "consent" },
      scopeSeparator: " ",
    },
    notes: [
      "Needs a Google Cloud OAuth client; the gmail.send scope is restricted, so Google verifies the app before anyone outside the test users list can connect.",
      "Gmail sending limits apply to your account; a batch that hits them is reported as partially sent.",
    ],
  },
  whatsapp: {
    id: "whatsapp",
    name: "WhatsApp Business (Cloud API)",
    description: "Sends approved WhatsApp messages from your WhatsApp Business number through Meta's Cloud API.",
    authKind: "api_key",
    scopes: [
      { id: "whatsapp_business_messaging", label: "Send messages from your business number", why: "So Echo can send the approved batch. Decupo cannot read incoming chats." },
    ],
    capabilities: ["send_whatsapp"],
    adapterEnv: "CONNECTOR_WHATSAPP_ADAPTER",
    liveEnv: [],
    apiKey: { label: "System user access token and phone number id", hint: "Paste as <phone_number_id>:<access_token> from Meta Business settings. Stored encrypted." },
    notes: [
      "Meta only delivers business-initiated messages to people who have not written to you first when they use an approved message template. Free-form text to a new contact is rejected by Meta and recorded here as failed, never as sent.",
      "Your Meta Business account must be verified and the number registered for the Cloud API.",
    ],
  },
  instagram: {
    id: "instagram",
    name: "Instagram (professional account)",
    description: "Publishes an approved reel to your Instagram professional account through the Instagram Graph API.",
    authKind: "api_key",
    scopes: [
      { id: "instagram_business_content_publish", label: "Publish reels to your account", why: "So Pulse can post the reel you approved. One approval per reel." },
      { id: "instagram_business_basic", label: "See your account id", why: "To address the publish call to your account." },
    ],
    capabilities: ["publish_reel"],
    adapterEnv: "CONNECTOR_INSTAGRAM_ADAPTER",
    liveEnv: [],
    apiKey: { label: "Instagram user id and access token", hint: "Paste as <ig_user_id>:<access_token> from your Meta app. Stored encrypted." },
    notes: [
      "Publishing needs a video that is already hosted at a public URL; Decupo does not render video yet, so give the link to your shot reel when you create the mission.",
      "Meta app review is required for the publish permission before accounts outside your app's testers can connect.",
    ],
  },
  youtube: {
    id: "youtube",
    name: "YouTube (Google account)",
    description: "Uploads an approved reel as a YouTube Short from your own channel.",
    authKind: "oauth",
    scopes: [
      { id: "https://www.googleapis.com/auth/youtube.upload", label: "Upload videos to your channel", why: "So Pulse can post the reel you approved. Decupo cannot delete or edit existing videos." },
    ],
    capabilities: ["publish_reel"],
    adapterEnv: "CONNECTOR_YOUTUBE_ADAPTER",
    liveEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    oauth: {
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      revokeUrl: "https://oauth2.googleapis.com/revoke",
      clientIdEnv: "GOOGLE_CLIENT_ID",
      clientSecretEnv: "GOOGLE_CLIENT_SECRET",
      extraAuthorizeParams: { access_type: "offline", prompt: "consent" },
      scopeSeparator: " ",
    },
    notes: [
      "Uploads count against the YouTube Data API quota of the operator's Google Cloud project (1,600 units per upload by default) and need Google's app verification.",
      "Uploads are private until you change the visibility on YouTube; Decupo never publishes publicly on its own.",
    ],
  },
};

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === "string" && (PROVIDER_IDS as readonly string[]).includes(v);
}

export function getProvider(id: ProviderId): ProviderDefinition {
  return PROVIDERS[id];
}

export function listProviders(): ProviderDefinition[] {
  return PROVIDER_IDS.map((id) => PROVIDERS[id]);
}

export type AdapterMode = "mock" | "live";

export type AdapterStatus =
  | { enabled: true; mode: AdapterMode }
  | { enabled: false; reason: string };

/**
 * Which adapter this server runs for a provider. Read at call time so tests
 * and operators can flip it without restarting. Absent means the provider is
 * listed but cannot be connected here yet.
 */
export function adapterStatus(id: ProviderId): AdapterStatus {
  const p = PROVIDERS[id];
  const mode = (process.env[p.adapterEnv] ?? "").trim().toLowerCase();
  if (!mode) return { enabled: false, reason: `Not enabled on this server (${p.adapterEnv} is not set).` };
  if (mode !== "mock" && mode !== "live") return { enabled: false, reason: `${p.adapterEnv} must be "mock" or "live".` };
  if (mode === "live") {
    const missing = p.liveEnv.filter((k) => !process.env[k]);
    if (missing.length) return { enabled: false, reason: `Live adapter is missing ${missing.join(", ")}.` };
  }
  return { enabled: true, mode };
}

/** Public shape for the API and the Connected apps page. No secrets. */
export function describeProvider(p: ProviderDefinition) {
  const status = adapterStatus(p.id);
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    authKind: p.authKind,
    scopes: p.scopes,
    capabilities: p.capabilities,
    apiKey: p.apiKey ?? null,
    notes: p.notes,
    adapter: status.enabled ? { enabled: true as const, mode: status.mode } : { enabled: false as const, reason: status.reason },
  };
}

export type ProviderSummary = ReturnType<typeof describeProvider>;
