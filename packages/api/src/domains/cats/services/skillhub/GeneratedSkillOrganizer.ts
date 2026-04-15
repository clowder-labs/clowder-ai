/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { parseFrontmatterString } from './frontmatter-parser.js';
import { resolveOfficialSkillsRoot, resolveUserSkillsRoot } from './SkillPaths.js';

const SKILL_NAME_ALLOWED_RE = /^[A-Za-z0-9-]+$/;
const SKIP_SEGMENTS = new Set(['.git', '.next', 'dist', 'node_modules']);

export interface GeneratedSkillPromotionResult {
  skillName: string;
  sourceDir: string;
  targetDir: string;
  status: 'moved' | 'skipped';
  reason?:
    | 'already_managed'
    | 'conflict'
    | 'invalid_name'
    | 'missing_skill_md'
    | 'empty_skill_md'
    | 'missing_description'
    | 'outside_workspace';
}

interface PromoteGeneratedSkillsOptions {
  hostRoot: string;
  workingDirectory?: string;
  changedPaths: readonly string[];
}

function normalizeSeparators(path: string): string {
  return path.replace(/\\/g, '/');
}

function isPathInside(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith('..') && !rel.includes(`..${sep}`));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

async function hasReadableSkillMd(skillDir: string): Promise<boolean> {
  return pathExists(resolve(skillDir, 'SKILL.md'));
}

function isManagedSkillDir(skillDir: string, officialSkillsRoot: string, userSkillsRoot: string): boolean {
  return isPathInside(skillDir, officialSkillsRoot) || isPathInside(skillDir, userSkillsRoot);
}

function hasSkippedSegment(skillDir: string, workspaceRoot: string): boolean {
  const rel = normalizeSeparators(relative(workspaceRoot, skillDir));
  if (!rel || rel.startsWith('../') || rel === '..') return false;
  return rel
    .split('/')
    .filter(Boolean)
    .some((segment) => SKIP_SEGMENTS.has(segment));
}

async function collectCandidateSkillDirs(workspaceRoot: string, changedPaths: readonly string[]): Promise<string[]> {
  const candidates = new Set<string>();

  for (const changedPath of changedPaths) {
    const trimmed = changedPath.trim();
    if (!trimmed) continue;

    const absolutePath = resolve(workspaceRoot, trimmed);
    if (!isPathInside(absolutePath, workspaceRoot)) continue;

    let cursor = absolutePath;
    while (isPathInside(cursor, workspaceRoot)) {
      if (await hasReadableSkillMd(cursor)) {
        candidates.add(cursor);
      }
      const parent = dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
    }
  }

  return [...candidates].sort((a, b) => a.length - b.length);
}

function dedupeNestedCandidates(skillDirs: readonly string[]): string[] {
  const selected: string[] = [];
  for (const skillDir of skillDirs) {
    if (selected.some((existing) => isPathInside(skillDir, existing))) continue;
    selected.push(skillDir);
  }
  return selected;
}

async function validateSkillCandidate(
  skillDir: string,
  workspaceRoot: string,
  officialSkillsRoot: string,
  userSkillsRoot: string,
): Promise<GeneratedSkillPromotionResult> {
  const skillName = basename(skillDir);
  const targetDir = resolve(officialSkillsRoot, skillName);

  if (!isPathInside(skillDir, workspaceRoot)) {
    return { skillName, sourceDir: skillDir, targetDir, status: 'skipped', reason: 'outside_workspace' };
  }

  if (isManagedSkillDir(skillDir, officialSkillsRoot, userSkillsRoot)) {
    return { skillName, sourceDir: skillDir, targetDir, status: 'skipped', reason: 'already_managed' };
  }

  if (hasSkippedSegment(skillDir, workspaceRoot)) {
    return { skillName, sourceDir: skillDir, targetDir, status: 'skipped', reason: 'already_managed' };
  }

  if (!SKILL_NAME_ALLOWED_RE.test(skillName)) {
    return { skillName, sourceDir: skillDir, targetDir, status: 'skipped', reason: 'invalid_name' };
  }

  const skillMdPath = resolve(skillDir, 'SKILL.md');
  if (!existsSync(skillMdPath)) {
    return { skillName, sourceDir: skillDir, targetDir, status: 'skipped', reason: 'missing_skill_md' };
  }

  const content = await readFile(skillMdPath, 'utf-8');
  if (content.trim().length === 0) {
    return { skillName, sourceDir: skillDir, targetDir, status: 'skipped', reason: 'empty_skill_md' };
  }

  const meta = parseFrontmatterString(content);
  if (!meta.description?.trim()) {
    return { skillName, sourceDir: skillDir, targetDir, status: 'skipped', reason: 'missing_description' };
  }

  if (existsSync(targetDir)) {
    return { skillName, sourceDir: skillDir, targetDir, status: 'skipped', reason: 'conflict' };
  }

  return { skillName, sourceDir: skillDir, targetDir, status: 'moved' };
}

async function moveSkillDirectory(sourceDir: string, targetDir: string): Promise<void> {
  await mkdir(dirname(targetDir), { recursive: true });
  try {
    await rename(sourceDir, targetDir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EXDEV') throw error;
    await cp(sourceDir, targetDir, { recursive: true, force: false, errorOnExist: true });
    await rm(sourceDir, { recursive: true, force: true });
  }
}

export async function promoteGeneratedSkills(
  options: PromoteGeneratedSkillsOptions,
): Promise<GeneratedSkillPromotionResult[]> {
  const hostRoot = resolve(options.hostRoot);
  const workspaceRoot = resolve(options.workingDirectory ?? hostRoot);
  const officialSkillsRoot = resolveOfficialSkillsRoot(hostRoot);
  const userSkillsRoot = resolveUserSkillsRoot(hostRoot);

  const candidates = dedupeNestedCandidates(await collectCandidateSkillDirs(workspaceRoot, options.changedPaths));
  const results: GeneratedSkillPromotionResult[] = [];

  for (const skillDir of candidates) {
    const validation = await validateSkillCandidate(skillDir, workspaceRoot, officialSkillsRoot, userSkillsRoot);
    if (validation.status !== 'moved') {
      results.push(validation);
      continue;
    }

    await moveSkillDirectory(validation.sourceDir, validation.targetDir);
    results.push(validation);
  }

  return results;
}
