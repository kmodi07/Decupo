import type { AdapterMode, ProviderId } from "../providers";

/** Decrypted credentials. Only adapters and the connections service ever see these. */
export type Credentials =
  | { kind: "api_key"; apiKey: string }
  | { kind: "oauth"; accessToken: string; refreshToken: string | null; expiresAt: number | null; tokenType: string | null; scope: string | null };

export type LeadQuery = {
  product: string;
  market: string | null;
  segments: { key: string; name: string; findVia: string }[];
  limit: number;
};

export type Lead = {
  segment: string;
  organisation: string;
  contactName: string | null;
  role: string | null;
  city: string | null;
  channel: "email" | "whatsapp" | "phone";
  email: string | null;
  phone: string | null;
  source: string;
  notes: string | null;
};

export type OutboundMessage = { channel: "email" | "whatsapp"; to: string; subject: string | null; body: string };
export type SendResult = { providerMessageId: string | null };

export type ReelToPublish = { videoUrl: string; caption: string; title: string };
export type PublishResult = { postId: string; url: string | null; visibility: string | null };

export type VerifiedAccount = { label: string; externalAccountId: string | null };

/**
 * One adapter per provider and mode. Methods are optional because providers
 * differ in capability; the skills check for the one they need.
 */
export interface ConnectorAdapter {
  provider: ProviderId;
  mode: AdapterMode;
  /** Check pasted or exchanged credentials and name the account. Called at connect time. */
  verify(creds: Credentials): Promise<VerifiedAccount>;
  searchLeads?(creds: Credentials, q: LeadQuery): Promise<Lead[]>;
  sendMessage?(creds: Credentials, m: OutboundMessage): Promise<SendResult>;
  publishReel?(creds: Credentials, r: ReelToPublish): Promise<PublishResult>;
  /** Invalidate the credential on the provider side (best effort). */
  revoke?(creds: Credentials): Promise<void>;
}

/** Error raised when the provider rejected the call; message is safe to show. */
export class ProviderError extends Error {
  constructor(
    public readonly provider: ProviderId,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
