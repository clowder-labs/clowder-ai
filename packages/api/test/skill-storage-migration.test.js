/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import Fastify from 'fastify';

const AUTH_HEADERS = { 'x-office-claw-user': 'test-user' };

function createMockRegistry() {
  return {
    verify(invocationId, callbackToken) {
      if (invocationId !== 'inv-1' || callbackToken !== 'tok-1') return null;
      return {
        invocationId,
        catId: 'agentteams',
        userId: 'user-1',
        threadId: 'thread-1',
        callbackToken,
      };
    },
  };
}

describe('skill storage migration', () => {
  const tempRoots = [];
  const previousOfficeClawRoot = process.env.OFFICE_CLAW_CONFIG_ROOT;

  afterEach(() => {
    for (const tempRoot of tempRoots.splice(0)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
    if (previousOfficeClawRoot === undefined) delete process.env.OFFICE_CLAW_CONFIG_ROOT;
    else process.env.OFFICE_CLAW_CONFIG_ROOT = previousOfficeClawRoot;
  });

  it('migrates legacy skill directories and registry into office-claw storage without overwriting existing data', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'skill-storage-migration-'));
    tempRoots.push(tempRoot);

    const legacyOfficialRoot = join(tempRoot, 'cat-cafe-skills');
    const legacyUserRoot = join(tempRoot, '.cat-cafe', 'skills');
    const currentOfficialRoot = join(tempRoot, 'office-claw-skills');
    const currentUserRoot = join(tempRoot, '.office-claw', 'skills');

    mkdirSync(join(legacyOfficialRoot, 'legacy-official'), { recursive: true });
    writeFileSync(join(legacyOfficialRoot, 'legacy-official', 'SKILL.md'), '# legacy official\n', 'utf-8');

    mkdirSync(join(legacyUserRoot, 'legacy-user'), { recursive: true });
    writeFileSync(join(legacyUserRoot, 'legacy-user', 'SKILL.md'), '# legacy user\n', 'utf-8');

    mkdirSync(join(currentOfficialRoot, 'same-name-skill'), { recursive: true });
    writeFileSync(join(currentOfficialRoot, 'same-name-skill', 'SKILL.md'), '# keep current official\n', 'utf-8');
    mkdirSync(join(legacyOfficialRoot, 'same-name-skill'), { recursive: true });
    writeFileSync(join(legacyOfficialRoot, 'same-name-skill', 'SKILL.md'), '# legacy official duplicate\n', 'utf-8');

    mkdirSync(join(currentUserRoot, 'same-user-skill'), { recursive: true });
    writeFileSync(join(currentUserRoot, 'same-user-skill', 'SKILL.md'), '# keep current user\n', 'utf-8');
    mkdirSync(join(legacyUserRoot, 'same-user-skill'), { recursive: true });
    writeFileSync(join(legacyUserRoot, 'same-user-skill', 'SKILL.md'), '# legacy user duplicate\n', 'utf-8');

    writeFileSync(
      join(tempRoot, '.cat-cafe', 'installed-skills.json'),
      `${JSON.stringify(
        {
          version: 1,
          skills: [
            {
              name: 'legacy-user',
              source: 'skillhub',
              skillhubUrl: 'https://example.com/legacy-user',
              owner: 'legacy',
              repo: 'skills',
              remoteSkillName: 'legacy-user',
              installedAt: '2026-04-01T00:00:00.000Z',
            },
          ],
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );

    writeFileSync(
      join(tempRoot, '.office-claw', 'installed-skills.json'),
      `${JSON.stringify(
        {
          version: 1,
          skills: [
            {
              name: 'current-user',
              source: 'local',
              skillhubUrl: '',
              owner: 'local',
              repo: 'upload',
              remoteSkillName: 'current-user',
              installedAt: '2026-04-02T00:00:00.000Z',
            },
          ],
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );

    const { ensureSkillStorageMigrated } = await import(
      `../dist/domains/cats/services/skillhub/SkillStorageMigration.js?case=${Date.now()}`
    );

    await ensureSkillStorageMigrated(tempRoot);
    await ensureSkillStorageMigrated(tempRoot);

    assert.equal(existsSync(join(currentOfficialRoot, 'legacy-official', 'SKILL.md')), true);
    assert.equal(existsSync(join(currentUserRoot, 'legacy-user', 'SKILL.md')), true);
    assert.equal(readFileSync(join(currentOfficialRoot, 'same-name-skill', 'SKILL.md'), 'utf-8'), '# keep current official\n');
    assert.equal(readFileSync(join(currentUserRoot, 'same-user-skill', 'SKILL.md'), 'utf-8'), '# keep current user\n');

    const migratedRegistry = JSON.parse(
      readFileSync(join(tempRoot, '.office-claw', 'installed-skills.json'), 'utf-8'),
    );
    assert.deepEqual(
      migratedRegistry.skills.map((record) => record.name).sort(),
      ['current-user', 'legacy-user'],
    );
  });

  it('callback skill routes can load skills that only exist in legacy storage', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'skill-storage-callback-'));
    tempRoots.push(tempRoot);
    process.env.OFFICE_CLAW_CONFIG_ROOT = tempRoot;

    const legacyOfficialRoot = join(tempRoot, 'cat-cafe-skills');
    const legacyUserRoot = join(tempRoot, '.cat-cafe', 'skills');
    mkdirSync(legacyOfficialRoot, { recursive: true });
    mkdirSync(join(legacyUserRoot, 'legacy-remote', 'scripts'), { recursive: true });

    writeFileSync(
      join(legacyOfficialRoot, 'BOOTSTRAP.md'),
      '# Bootstrap\n\n### General\n| Skill | Trigger |\n|-------|---------|\n',
      'utf-8',
    );
    writeFileSync(join(legacyOfficialRoot, 'manifest.yaml'), 'skills: {}\n', 'utf-8');
    writeFileSync(
      join(legacyUserRoot, 'legacy-remote', 'SKILL.md'),
      '---\nname: legacy-remote\ndescription: legacy remote skill\ntriggers:\n  - legacy remote\n---\n\n# legacy remote\n',
      'utf-8',
    );
    writeFileSync(join(legacyUserRoot, 'legacy-remote', 'scripts', 'helper.sh'), '#!/usr/bin/env bash\n', 'utf-8');
    writeFileSync(
      join(tempRoot, '.cat-cafe', 'installed-skills.json'),
      `${JSON.stringify(
        {
          version: 1,
          skills: [
            {
              name: 'legacy-remote',
              source: 'skillhub',
              skillhubUrl: 'https://example.com/legacy-remote',
              owner: 'legacy',
              repo: 'skills',
              remoteSkillName: 'legacy-remote',
              installedAt: '2026-04-03T00:00:00.000Z',
            },
          ],
        },
        null,
        2,
      )}\n`,
      'utf-8',
    );

    const { registerCallbackSkillRoutes } = await import(`../dist/routes/callback-skill-routes.js?case=${Date.now()}`);
    const app = Fastify();

    try {
      await registerCallbackSkillRoutes(app, { registry: createMockRegistry() });
      await app.ready();

      const listRes = await app.inject({
        method: 'GET',
        url: '/api/callbacks/skills/list?invocationId=inv-1&callbackToken=tok-1',
      });

      assert.equal(listRes.statusCode, 200);
      const listBody = listRes.json();
      assert.equal(listBody.skills.some((skill) => skill.name === 'legacy-remote'), true);

      const loadRes = await app.inject({
        method: 'GET',
        url: '/api/callbacks/skills/load?invocationId=inv-1&callbackToken=tok-1&name=legacy-remote',
      });

      assert.equal(loadRes.statusCode, 200);
      const loadBody = loadRes.json();
      assert.ok(loadBody.skillDir.replaceAll('\\', '/').endsWith('/.office-claw/skills/legacy-remote'));
      assert.ok(
        loadBody.files.some((filePath) =>
          filePath.replaceAll('\\', '/').endsWith('/.office-claw/skills/legacy-remote/scripts/helper.sh'),
        ),
      );
      assert.equal(existsSync(join(tempRoot, '.office-claw', 'skills', 'legacy-remote', 'SKILL.md')), true);
    } finally {
      await app.close();
    }
  });

  it('skills route lists legacy user skills after migration into office-claw storage', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'skill-storage-route-'));
    tempRoots.push(tempRoot);
    process.env.OFFICE_CLAW_CONFIG_ROOT = tempRoot;

    mkdirSync(join(tempRoot, 'office-claw-skills'), { recursive: true });
    mkdirSync(join(tempRoot, '.cat-cafe', 'skills', 'legacy-user-skill'), { recursive: true });
    writeFileSync(join(tempRoot, '.cat-cafe', 'skills', 'legacy-user-skill', 'SKILL.md'), '# legacy user skill\n', 'utf-8');

    const { skillsRoutes } = await import(`../dist/routes/skills.js?case=${Date.now()}`);
    const app = Fastify();

    try {
      await app.register(skillsRoutes);
      await app.ready();

      const res = await app.inject({
        method: 'GET',
        url: '/api/skills',
        headers: AUTH_HEADERS,
      });

      assert.equal(res.statusCode, 200);
      const body = res.json();
      assert.equal(body.skills.some((skill) => skill.name === 'legacy-user-skill'), true);
      assert.equal(existsSync(join(tempRoot, '.office-claw', 'skills', 'legacy-user-skill', 'SKILL.md')), true);
    } finally {
      await app.close();
    }
  });
});
