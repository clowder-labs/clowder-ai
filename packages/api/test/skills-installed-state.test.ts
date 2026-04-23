import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildInstalledSkillKeySet } from '../src/routes/skills.js';

describe('skills installed state matching', () => {
  it('treats local preinstalled skills as installed', () => {
    const keys = buildInstalledSkillKeySet([], ['docx', 'weather']);

    assert.equal(keys.has('docx'), true);
    assert.equal(keys.has('weather'), true);
  });

  it('matches both local installed name and remote skill name', () => {
    const keys = buildInstalledSkillKeySet([
      {
        name: 'meeting-autopilot-pro-local',
        source: 'skillhub',
        skillhubUrl: 'https://example.com/skills/meeting-autopilot-pro',
        owner: 'office-claw',
        repo: 'skills',
        remoteSkillName: 'meeting-autopilot-pro',
        installedAt: '2026-04-10T00:00:00.000Z',
      },
    ], ['docx']);

    assert.equal(keys.has('meeting-autopilot-pro-local'), true);
    assert.equal(keys.has('meeting-autopilot-pro'), true);
    assert.equal(keys.has('docx'), true);
  });

  it('normalizes case and ignores blank remote names', () => {
    const keys = buildInstalledSkillKeySet([
      {
        name: 'Docx',
        source: 'skillhub',
        skillhubUrl: 'https://example.com/skills/docx',
        owner: 'office-claw',
        repo: 'skills',
        remoteSkillName: '   ',
        installedAt: '2026-04-10T00:00:00.000Z',
      },
    ]);

    assert.equal(keys.has('docx'), true);
    assert.equal(keys.has('Docx'), false);
    assert.equal(keys.size, 1);
  });
});
