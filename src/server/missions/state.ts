import type { MissionStatus, StepStatus } from "../db/schema";
import { InvalidTransitionError } from "../errors";

export const TERMINAL_MISSION: ReadonlySet<MissionStatus> = new Set(["completed", "partially_completed", "failed", "canceled"]);

const MISSION_TRANSITIONS: Record<MissionStatus, readonly MissionStatus[]> = {
  draft: ["estimated", "awaiting_authorization", "canceled"],
  estimated: ["awaiting_authorization", "estimated", "canceled"],
  awaiting_authorization: ["queued", "estimated", "canceled"],
  queued: ["running", "paused", "canceled", "completed", "partially_completed", "failed", "awaiting_review"],
  running: ["awaiting_review", "paused", "canceled", "completed", "partially_completed", "failed", "running"],
  awaiting_review: ["running", "queued", "paused", "canceled", "completed", "partially_completed", "failed"],
  paused: ["queued", "canceled"],
  completed: [],
  partially_completed: [],
  failed: [],
  canceled: [],
};

export function canTransition(from: MissionStatus, to: MissionStatus): boolean {
  return MISSION_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: MissionStatus, to: MissionStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export const TERMINAL_STEP: ReadonlySet<StepStatus> = new Set(["succeeded", "failed", "blocked", "skipped", "canceled"]);
export const ACTIVE_STEP: ReadonlySet<StepStatus> = new Set(["ready", "running"]);

/** Human labels that distinguish ready / in progress / blocked / partial / failed. */
export const MISSION_STATUS_LABEL: Record<MissionStatus, string> = {
  draft: "Draft",
  estimated: "Estimated",
  awaiting_authorization: "Awaiting your go-ahead",
  queued: "Queued",
  running: "In progress",
  awaiting_review: "Awaiting your review",
  completed: "Completed",
  partially_completed: "Partially completed",
  failed: "Failed",
  paused: "Paused",
  canceled: "Canceled",
};

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  pending: "Waiting",
  ready: "Ready",
  running: "In progress",
  awaiting_approval: "Needs approval",
  succeeded: "Done",
  failed: "Failed",
  blocked: "Blocked",
  skipped: "Skipped",
  canceled: "Canceled",
};
