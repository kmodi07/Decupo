import { z } from "zod";
import { json, readJson, withPublic } from "@/server/http";
import { getPlanner } from "@/server/planner/rule-based";
import { ValidationError } from "@/server/errors";

const schema = z.object({ goal: z.string().trim().min(8).max(500) });

/** Public, non-persisting plan preview for the landing page demo. */
export const POST = withPublic(async (req) => {
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) throw new ValidationError("Tell Cupi a little more about the goal (at least 8 characters).");
  const plan = await getPlanner().plan({ goal: parsed.data.goal });
  return json({ plan });
});
