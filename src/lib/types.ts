import type { Approval, Artifact, Mission, MissionEvent, MissionStep } from "@/server/db/schema";
import type { MissionPlan } from "@/server/planner/types";

export type { Approval, Artifact, Mission, MissionEvent, MissionStep, MissionPlan };

export type Me = {
  user: { id: string; email: string; name: string };
  org: { id: string; role: string; permissions: string[] };
  organizations: { id: string; name: string; slug: string; role: string }[];
  credits: { balance: number; reserved: number; available: number };
  providers: { llm: { provider: string; mock: boolean } };
};

export type MissionDetail = {
  mission: Mission;
  steps: MissionStep[];
  approvals: Approval[];
  artifacts: Omit<Artifact, "contentText">[];
  credits: { estimate: number; ceiling: number; settled: number; reservedRemaining: number };
};

export type SkillSummary = {
  id: string;
  version: string;
  name: string;
  description: string;
  agent: string;
  actionClass: string;
  permissionScopes: readonly string[];
  privacy: string;
  availability: "supported" | "needs_connection" | "needs_approval" | "not_available";
  baseCredits: number;
  estimatedCredits: number;
};
