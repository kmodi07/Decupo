import { BUILTIN_SKILLS } from "./builtin";
import type { Skill, SkillManifest } from "./types";

const registry = new Map<string, Skill>();
for (const s of BUILTIN_SKILLS) registry.set(s.manifest.id, s);

export function getSkill(id: string): Skill {
  const s = registry.get(id);
  if (!s) throw new Error(`Unknown skill: ${id}`);
  return s;
}

export function listSkills(): SkillManifest[] {
  return [...registry.values()].map((s) => s.manifest);
}

/** Public shape (no zod schema) for the API/UI. */
export function describeSkill(m: SkillManifest) {
  return {
    id: m.id,
    version: m.version,
    name: m.name,
    description: m.description,
    agent: m.agent,
    actionClass: m.actionClass,
    permissionScopes: m.permissionScopes,
    privacy: m.privacy,
    availability: m.availability,
    baseCredits: m.cost.baseCredits,
    estimatedCredits: m.cost.baseCredits + m.cost.variableAllowanceCredits,
  };
}

/** Test hook: register a skill for the duration of a test. */
export function registerSkillForTests(skill: Skill) {
  registry.set(skill.manifest.id, skill);
}
