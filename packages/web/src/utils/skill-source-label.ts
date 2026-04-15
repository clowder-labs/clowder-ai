export type SkillSource = 'builtin' | 'external';

export function skillSourceToLabel(source: SkillSource | string): string {
  if (source === 'builtin') return '内置技能';
  if (source === 'external') return '用户添加技能';
  return '其他';
}
