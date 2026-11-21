import type { ActionClass } from "../policy/actions";
import type { AgentName, Availability } from "../skills/types";

export type PlannedStep = {
  key: string;
  title: string;
  agent: AgentName;
  skillId: string;
  dependsOn: string[];
  input: Record<string, unknown>;
  requiresApproval: boolean;
  actionClass: ActionClass;
  estimatedCredits: number;
};

export type PlanQuestion = { key: string; prompt: string; required: boolean };

export type Capability = { label: string; status: Availability; note?: string };

export type MissionPlan = {
  templateId: string;
  title: string;
  summary: string;
  team: AgentName[];
  steps: PlannedStep[];
  questions: PlanQuestion[];
  capabilities: Capability[];
  estimateCredits: number;
  /** Plain-language caveats Cupi must show before authorisation. */
  caveats: string[];
  plannerName: string;
};

export type PlanInput = { goal: string; answers?: Record<string, string> };

export interface Planner {
  readonly name: string;
  plan(input: PlanInput): Promise<MissionPlan>;
}
