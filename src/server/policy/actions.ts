/**
 * Action classes and autonomy tiers (PRODUCT_BLUEPRINT.md section 7).
 *
 * Tier 1: read / research / draft inside the user's own workspace.
 * Tier 2: limited execution inside an approved policy (not yet implemented;
 *         every Tier 2 action is treated as Tier 3 until policies exist).
 * Tier 3: explicit approval every time.
 */
export type ActionClass =
  | "read"
  | "draft"
  | "generate"
  | "publish"
  | "send"
  | "deploy"
  | "spend"
  | "delete"
  | "external_contact";

export const ACTION_TIER: Record<ActionClass, 1 | 2 | 3> = {
  read: 1,
  draft: 1,
  generate: 1,
  publish: 3,
  send: 3,
  deploy: 3,
  spend: 3,
  delete: 3,
  external_contact: 3,
};

export const ACTION_LABELS: Record<ActionClass, string> = {
  read: "Read and research",
  draft: "Draft content",
  generate: "Generate an artifact",
  publish: "Publish publicly",
  send: "Send a message",
  deploy: "Deploy to production",
  spend: "Spend money",
  delete: "Delete data",
  external_contact: "Contact someone new",
};

/** Phase 1 rule: anything above Tier 1 needs a human approval row. */
export function requiresApproval(action: ActionClass): boolean {
  return ACTION_TIER[action] >= 2;
}
