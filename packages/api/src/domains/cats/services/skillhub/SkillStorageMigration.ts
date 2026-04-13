/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { InstalledSkillRecord, InstalledSkillsRegistry } from './InstalledSkillRegistry.js';
import {
  resolveLegacyOfficialSkillsRoot,
  resolveLegacyUserSkillsRoot,
  resolveOfficialSkillsRoot,
  resolveUserSkillsRoot,
} from './SkillPaths.js';

const REGISTRY_FILENAME = 'installed-skills.json';
const EMPTY_REGISTRY: InstalledSkillsRegistry = { version: 1, skills: [] };
const migrationCache = new Map<string, Promise<void>>();

function getRegistryPath(hostRoot: string): string {
  return join(hostRoot, '.office-claw', REGISTRY_FILENAME);
}

function getLegacyRegistryPath(hostRoot: string): string {
  return join(hostRoot, '.cat-cafe', REGISTRY_FILENAME);
}

async function readRegistryFile(filePath: string): Promise<InstalledSkillsRegistry | null> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as InstalledSkillsRegistry;
    if (!parsed || typeof parsed.version !== 'number' || !Array.isArray(parsed.skills)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function copyMissingTopLevelEntries(sourceRoot: string, targetRoot: string): Promise<void> {
  if (!existsSync(sourceRoot)) return;

  const entries = await readdir(sourceRoot, { withFileTypes: true }).catch(() => []);
  if (entries.length === 0) return;

  await mkdir(targetRoot, { recursive: true });

  for (const entry of entries) {
    const sourcePath = join(sourceRoot, entry.name);
    const targetPath = join(targetRoot, entry.name);
    if (existsSync(targetPath)) continue;
    await cp(sourcePath, targetPath, { recursive: true, force: false, errorOnExist: true });
  }
}

function mergeRegistrySkills(
  currentSkills: InstalledSkillRecord[],
  legacySkills: InstalledSkillRecord[],
): InstalledSkillRecord[] {
  const merged = new Map<string, InstalledSkillRecord>();
  for (const record of currentSkills) {
    merged.set(record.name, record);
  }
  for (const record of legacySkills) {
    if (!merged.has(record.name)) {
      merged.set(record.name, record);
    }
  }
  return [...merged.values()];
}

async function migrateInstalledRegistry(hostRoot: string): Promise<void> {
  const currentPath = getRegistryPath(hostRoot);
  const legacyPath = getLegacyRegistryPath(hostRoot);
  const [currentRegistry, legacyRegistry] = await Promise.all([
    readRegistryFile(currentPath),
    readRegistryFile(legacyPath),
  ]);

  if (!legacyRegistry) return;

  const mergedSkills = mergeRegistrySkills(currentRegistry?.skills ?? [], legacyRegistry.skills);
  const hasChanges =
    !currentRegistry ||
    mergedSkills.length !== currentRegistry.skills.length ||
    currentRegistry.version !== legacyRegistry.version;

  if (!hasChanges) return;

  const nextRegistry: InstalledSkillsRegistry = {
    version: currentRegistry?.version ?? legacyRegistry.version ?? EMPTY_REGISTRY.version,
    skills: mergedSkills,
  };

  await mkdir(join(hostRoot, '.office-claw'), { recursive: true });
  await writeFile(currentPath, `${JSON.stringify(nextRegistry, null, 2)}\n`, 'utf-8');
}

async function migrateSkillStorage(hostRoot: string): Promise<void> {
  await Promise.all([
    copyMissingTopLevelEntries(resolveLegacyOfficialSkillsRoot(hostRoot), resolveOfficialSkillsRoot(hostRoot)),
    copyMissingTopLevelEntries(resolveLegacyUserSkillsRoot(hostRoot), resolveUserSkillsRoot(hostRoot)),
    migrateInstalledRegistry(hostRoot),
  ]);
}

export async function ensureSkillStorageMigrated(hostRoot: string): Promise<void> {
  const existing = migrationCache.get(hostRoot);
  if (existing) {
    await existing;
    return;
  }

  const migration = migrateSkillStorage(hostRoot)
    .catch((error) => {
      migrationCache.delete(hostRoot);
      throw error;
    })
    .then(() => {
      migrationCache.set(hostRoot, Promise.resolve());
    });

  migrationCache.set(hostRoot, migration);
  await migration;
}
