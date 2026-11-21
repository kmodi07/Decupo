import { adapterStatus, type ProviderId } from "../providers";
import { liveAdapter } from "./live";
import { mockAdapter } from "./mock";
import type { ConnectorAdapter } from "./types";

export type { ConnectorAdapter, Credentials, Lead, LeadQuery, OutboundMessage, PublishResult, ReelToPublish, SendResult } from "./types";
export { ProviderError } from "./types";
export { mockState, resetMockState } from "./mock";

/** The adapter this server runs for a provider, or null when none is enabled. */
export function getAdapter(provider: ProviderId): ConnectorAdapter | null {
  const status = adapterStatus(provider);
  if (!status.enabled) return null;
  return status.mode === "mock" ? mockAdapter(provider) : liveAdapter(provider);
}
