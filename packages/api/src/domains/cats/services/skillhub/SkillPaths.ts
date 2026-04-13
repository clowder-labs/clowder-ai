import { join } from 'node:path';

export function resolveOfficialSkillsRoot(hostRoot: string): string {
  return join(hostRoot, 'office-claw-skills');
}

export function resolveUserSkillsRoot(hostRoot: string): string {
  return join(hostRoot, '.office-claw', 'skills');
}

export function resolveOfficialSkillPath(hostRoot: string, skillName: string): string {
  return join(resolveOfficialSkillsRoot(hostRoot), skillName);
}

export function resolveInstalledSkillPath(hostRoot: string, skillName: string): string {
  return join(resolveUserSkillsRoot(hostRoot), skillName);
}
