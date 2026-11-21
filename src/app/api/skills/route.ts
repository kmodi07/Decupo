import { json, withAuth } from "@/server/http";
import { describeSkill, listSkills } from "@/server/skills/registry";
import { AGENT_ROLES } from "@/server/skills/types";

export const GET = withAuth(async () => {
  return json({ skills: listSkills().map(describeSkill), agents: AGENT_ROLES });
});
