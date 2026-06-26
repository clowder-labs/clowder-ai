import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { promisify } from 'node:util';

import { detectHotfixSignals } from './check-hotfix-pattern.mjs';

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = new URL('./check-hotfix-pattern.mjs', import.meta.url);

describe('check-hotfix-pattern', () => {
  test('detects conventional fix titles as hotfix work', () => {
    const result = detectHotfixSignals({
      title: 'fix(cli): preserve MCP tool contracts',
      commits: [],
    });

    assert.equal(result.hotfix, true);
    assert.deepEqual(result.matches, [
      {
        source: 'title',
        term: 'fix',
        text: 'fix(cli): preserve MCP tool contracts',
      },
    ]);
  });

  test('ignores copied detector JSON output in commit evidence', () => {
    const result = detectHotfixSignals({
      title: 'docs: sync status wording',
      commits: [
        {
          messageHeadline: 'docs: sync status wording',
          messageBody:
            'Verification: check-hotfix-pattern returned {"hotfix":true,"matches":[{"text":"quick fix"}]}; gate passed.',
        },
      ],
    });

    assert.deepEqual(result, { hotfix: false, matches: [] });
  });

  test('preserves real hotfix metadata outside copied detector output', () => {
    const result = detectHotfixSignals({
      title: 'chore: release metadata',
      commits: [
        {
          messageHeadline: 'chore: release metadata',
          messageBody:
            'Verification: check-hotfix-pattern returned hotfix=false; release metadata hotfix=true for emergency path.',
        },
      ],
    });

    assert.equal(result.hotfix, true);
    assert.deepEqual(result.matches, [
      {
        source: 'commit',
        term: 'hotfix',
        text: 'Verification: check-hotfix-pattern returned hotfix=false; release metadata hotfix=true for emergency path.',
      },
    ]);
  });

  test('CLI accepts input JSON and prints merge-gate JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hotfix-detector-'));
    const inputPath = join(dir, 'pr.json');
    await writeFile(
      inputPath,
      JSON.stringify({
        title: 'docs: update status',
        commits: [{ message: 'docs: update status' }],
      }),
    );

    const { stdout } = await execFileAsync('node', [SCRIPT_PATH.pathname, '--input-json', inputPath]);

    assert.deepEqual(JSON.parse(stdout), {
      hotfix: false,
      matchedTerms: [],
      matches: [],
    });
  });

  test('CLI fails closed with valid JSON when no PR input is available', async () => {
    let output = '';
    await assert.rejects(
      async () => {
        try {
          await execFileAsync('node', [SCRIPT_PATH.pathname], { env: { ...process.env, PR_NUMBER: '' } });
        } catch (error) {
          output = error.stdout;
          throw error;
        }
      },
      { code: 1 },
    );

    const parsed = JSON.parse(output);
    assert.equal(parsed.hotfix, true);
    assert.equal(parsed.failClosed, true);
    assert.match(parsed.detectionError, /Missing PR number/);
  });
});
