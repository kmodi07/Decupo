import type { ProviderId } from "../providers";
import { ProviderError, type ConnectorAdapter, type Credentials, type Lead, type LeadQuery, type OutboundMessage, type ReelToPublish } from "./types";

/**
 * Deterministic offline adapters, selected with `CONNECTOR_<PROVIDER>_ADAPTER=mock`.
 * They never leave the process. Every result is labelled as test data so a
 * mission run against them can never be mistaken for real outreach.
 */

export type MockState = {
  /** Leads returned by `data.searchLeads`; null means "derive from the query". */
  leads: Lead[] | null;
  sent: Array<OutboundMessage & { provider: ProviderId; id: string }>;
  published: Array<ReelToPublish & { provider: ProviderId; id: string }>;
  /** Recipient addresses whose next send should throw (each entry consumed once). */
  failNextSendTo: string[];
  /** When set, `verify` rejects keys that do not equal this value. */
  acceptedApiKey: string | null;
};

const fresh = (): MockState => ({ leads: null, sent: [], published: [], failNextSendTo: [], acceptedApiKey: null });

/** Shared with tests, which inspect and shape it. */
export const mockState: MockState = fresh();

export function resetMockState(): void {
  Object.assign(mockState, fresh());
}

const MOCK_SOURCE = "mock adapter (test data, not a real contact)";

function derivedLeads(q: LeadQuery): Lead[] {
  const out: Lead[] = [];
  q.segments.forEach((s, i) => {
    if (out.length >= q.limit) return;
    const n = i + 1;
    out.push({
      segment: s.name,
      organisation: `Example ${s.name} ${n}`,
      contactName: `Test Contact ${n}`,
      role: "Purchasing",
      city: q.market,
      channel: n % 2 === 0 ? "whatsapp" : "email",
      email: n % 2 === 0 ? null : `buyer${n}@example.test`,
      phone: n % 2 === 0 ? `+91 90000 0000${n}` : null,
      source: MOCK_SOURCE,
      notes: `Derived from the query for "${q.product}"; carries no information about a real buyer.`,
    });
  });
  return out;
}

function assertKey(provider: ProviderId, creds: Credentials): void {
  if (creds.kind === "api_key") {
    if (!creds.apiKey.trim()) throw new ProviderError(provider, "The API key is empty.", 401);
    if (mockState.acceptedApiKey !== null && creds.apiKey !== mockState.acceptedApiKey) throw new ProviderError(provider, "The provider rejected this API key.", 401);
  } else if (!creds.accessToken) {
    throw new ProviderError(provider, "The access token is empty.", 401);
  }
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}_${String(++seq).padStart(4, "0")}`;

export function mockAdapter(provider: ProviderId): ConnectorAdapter {
  const base: ConnectorAdapter = {
    provider,
    mode: "mock",
    async verify(creds) {
      assertKey(provider, creds);
      return { label: `mock ${provider} account`, externalAccountId: `mock-${provider}` };
    },
    async revoke() {
      /* nothing to invalidate */
    },
  };
  if (provider === "data") {
    base.searchLeads = async (creds, q) => {
      assertKey(provider, creds);
      return (mockState.leads ?? derivedLeads(q)).slice(0, q.limit);
    };
  }
  if (provider === "mailbox" || provider === "whatsapp") {
    base.sendMessage = async (creds, m) => {
      assertKey(provider, creds);
      const idx = mockState.failNextSendTo.indexOf(m.to);
      if (idx >= 0) {
        mockState.failNextSendTo.splice(idx, 1);
        throw new ProviderError(provider, `Simulated provider outage while sending to ${m.to}`, 503);
      }
      const id = nextId(provider === "mailbox" ? "mockmail" : "mockwa");
      mockState.sent.push({ ...m, provider, id });
      return { providerMessageId: id };
    };
  }
  if (provider === "instagram" || provider === "youtube") {
    base.publishReel = async (creds, r) => {
      assertKey(provider, creds);
      const id = nextId(provider === "instagram" ? "mockig" : "mockyt");
      mockState.published.push({ ...r, provider, id });
      return { postId: id, url: null, visibility: provider === "youtube" ? "private" : "published" };
    };
  }
  return base;
}
