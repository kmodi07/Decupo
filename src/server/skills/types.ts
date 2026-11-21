import type { z } from "zod";
import type { ActionClass } from "../policy/actions";
import type { LlmProvider } from "../llm/provider";
import type { Artifact } from "../db/schema";

export const AGENTS = ["Cupi", "Scout", "Nova", "Forge", "Motion", "Echo", "Atlas", "Pulse", "Vale"] as const;
export type AgentName = (typeof AGENTS)[number];

export const AGENT_ROLES: Record<AgentName, string> = {
  Cupi: "Intake, planning and updates",
  Scout: "Research and source verification",
  Nova: "Brand, writing and design",
  Forge: "Software: build, test, deploy on approval",
  Motion: "Scripts and media production",
  Echo: "Outreach and customer communication",
  Atlas: "Research-heavy documents and decks",
  Pulse: "SEO, analytics and recurring workflows",
  Vale: "Independent quality and safety validation",
};

export type Availability = "supported" | "needs_connection" | "needs_approval" | "not_available";

export type SkillManifest = {
  id: string;
  version: string;
  name: string;
  description: string;
  agent: AgentName;
  actionClass: ActionClass;
  /** Tools/resources the skill may touch. Enforced by what the context exposes. */
  permissionScopes: readonly ("llm:complete" | "artifact:write" | "artifact:read" | "connection:hosting" | "connection:data" | "connection:mailbox")[];
  privacy: "internal" | "user_content" | "third_party";
  cost: {
    /** Flat cost charged on every run. */
    baseCredits: number;
    /** Typical variable usage, added to the base for the up-front estimate. */
    variableAllowanceCredits: number;
    /** Variable component applied to real token usage at settlement. */
    creditsPerThousandTokens: number;
  };
  timeoutMs: number;
  maxAttempts: number;
  availability: Availability;
  inputSchema: z.ZodType;
};

export type SkillUsage = { provider: string; sku: string; unit: string; quantity: number };

export type ArtifactKind = "markdown" | "json" | "html" | "css";

export type SkillContext = {
  orgId: string;
  missionId: string;
  stepId: string;
  stepKey: string;
  goal: string;
  input: Record<string, unknown>;
  /** Outputs of upstream steps keyed by step key. */
  upstream: Record<string, Record<string, unknown>>;
  llm: LlmProvider;
  /** Run a side effect at most once per step, even across retries. */
  once<T>(key: string, tool: string, fn: () => Promise<T>): Promise<T>;
  writeArtifact(a: { kind: ArtifactKind; title: string; content: string; path?: string }): Promise<Artifact>;
  /** Read an artifact of this mission. Requires the `artifact:read` scope; returns null when it does not exist. */
  readArtifact(artifactId: string): Promise<Artifact | null>;
  recordUsage(u: SkillUsage): Promise<void>;
  log(message: string, payload?: Record<string, unknown>): Promise<void>;
  /** True when a hosting/publishing connection exists for the tenant (Phase 5). */
  hasConnection(provider: string): Promise<boolean>;
};

export type SkillResult =
  | { status: "succeeded"; output: Record<string, unknown>; summary: string }
  | { status: "blocked"; reason: string; output?: Record<string, unknown> };

export interface Skill {
  manifest: SkillManifest;
  run(ctx: SkillContext): Promise<SkillResult>;
}
