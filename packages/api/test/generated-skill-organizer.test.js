/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';

const tempRoots = [];
const previousOfficeClawRoot = process.env.OFFICE_CLAW_CONFIG_ROOT;

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
  if (previousOfficeClawRoot === undefined) delete process.env.OFFICE_CLAW_CONFIG_ROOT;
  else process.env.OFFICE_CLAW_CONFIG_ROOT = previousOfficeClawRoot;
});

test('promoteGeneratedSkills moves a valid generated skill into office-claw-skills', async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'generated-skill-organizer-'));
  tempRoots.push(tempRoot);
  process.env.OFFICE_CLAW_CONFIG_ROOT = tempRoot;

  const workspaceRoot = join(tempRoot, 'workspace');
  const sourceSkillDir = join(workspaceRoot, 'scratch', 'skill-lab', 'meeting-notes');
  mkdirSync(join(sourceSkillDir, 'scripts'), { recursive: true });
  writeFileSync(
    join(sourceSkillDir, 'SKILL.md'),
    '---\ndescription: summarize meeting notes into action items\ntriggers:\n  - meeting notes\n---\n\n# Meeting Notes\n',
    'utf-8',
  );
  writeFileSync(join(sourceSkillDir, 'scripts', 'helper.py'), 'print("ok")\n', 'utf-8');

  const { promoteGeneratedSkills } = await import(
    `../dist/domains/cats/services/skillhub/GeneratedSkillOrganizer.js?case=${Date.now()}`
  );

  const results = await promoteGeneratedSkills({
    hostRoot: tempRoot,
    workingDirectory: workspaceRoot,
    changedPaths: ['scratch/skill-lab/meeting-notes/SKILL.md', 'scratch/skill-lab/meeting-notes/scripts/helper.py'],
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.status, 'moved');
  assert.equal(results[0]?.skillName, 'meeting-notes');
  assert.equal(existsSync(join(tempRoot, 'office-claw-skills', 'meeting-notes', 'SKILL.md')), true);
  assert.equal(existsSync(sourceSkillDir), false);
  assert.equal(
    readFileSync(join(tempRoot, 'office-claw-skills', 'meeting-notes', 'scripts', 'helper.py'), 'utf-8'),
    'print("ok")\n',
  );
});

test('promoteGeneratedSkills skips invalid generated skills that do not satisfy the naming rule', async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'generated-skill-invalid-'));
  tempRoots.push(tempRoot);
  process.env.OFFICE_CLAW_CONFIG_ROOT = tempRoot;

  const workspaceRoot = join(tempRoot, 'workspace');
  const sourceSkillDir = join(workspaceRoot, 'drafts', 'bad_skill');
  mkdirSync(sourceSkillDir, { recursive: true });
  writeFileSync(join(sourceSkillDir, 'SKILL.md'), '# invalid skill\n', 'utf-8');

  const { promoteGeneratedSkills } = await import(
    `../dist/domains/cats/services/skillhub/GeneratedSkillOrganizer.js?case=${Date.now()}`
  );

  const results = await promoteGeneratedSkills({
    hostRoot: tempRoot,
    workingDirectory: workspaceRoot,
    changedPaths: ['drafts/bad_skill/SKILL.md'],
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.status, 'skipped');
  assert.equal(results[0]?.reason, 'invalid_name');
  assert.equal(existsSync(join(tempRoot, 'office-claw-skills', 'bad_skill')), false);
  assert.equal(existsSync(sourceSkillDir), true);
});

test('promoteGeneratedSkills skips when the target official skill already exists', async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'generated-skill-conflict-'));
  tempRoots.push(tempRoot);
  process.env.OFFICE_CLAW_CONFIG_ROOT = tempRoot;

  const workspaceRoot = join(tempRoot, 'workspace');
  const sourceSkillDir = join(workspaceRoot, 'drafts', 'daily-briefing');
  mkdirSync(sourceSkillDir, { recursive: true });
  mkdirSync(join(tempRoot, 'office-claw-skills', 'daily-briefing'), { recursive: true });
  writeFileSync(join(sourceSkillDir, 'SKILL.md'), '# generated\n', 'utf-8');
  writeFileSync(join(tempRoot, 'office-claw-skills', 'daily-briefing', 'SKILL.md'), '# existing\n', 'utf-8');

  const { promoteGeneratedSkills } = await import(
    `../dist/domains/cats/services/skillhub/GeneratedSkillOrganizer.js?case=${Date.now()}`
  );

  const results = await promoteGeneratedSkills({
    hostRoot: tempRoot,
    workingDirectory: workspaceRoot,
    changedPaths: ['drafts/daily-briefing/SKILL.md'],
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.status, 'skipped');
  assert.equal(results[0]?.reason, 'conflict');
  assert.equal(readFileSync(join(tempRoot, 'office-claw-skills', 'daily-briefing', 'SKILL.md'), 'utf-8'), '# existing\n');
  assert.equal(existsSync(sourceSkillDir), true);
});
