import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
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

  test('detects standalone temp titles as hotfix work', () => {
    const result = detectHotfixSignals({
      title: 'temp: bypass failing check',
      commits: [],
    });

    assert.equal(result.hotfix, true);
    assert.deepEqual(result.matches, [
      {
        source: 'title',
        term: 'temp',
        text: 'temp: bypass failing check',
      },
    ]);
  });

  test('detects existing hotfix labels as hotfix work', () => {
    const result = detectHotfixSignals({
      title: 'docs: neutral update',
      labels: ['hotfix'],
      commits: [{ message: 'docs: neutral update' }],
    });

    assert.equal(result.hotfix, true);
    assert.deepEqual(result.matches, [
      {
        source: 'label',
        term: 'hotfix',
        text: 'hotfix',
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

  test('ignores copied detector bare-colon JSON output in commit evidence', () => {
    const result = detectHotfixSignals({
      title: 'docs: sync status wording',
      commits: [
        {
          messageHeadline: 'docs: sync status wording',
          messageBody:
            'Verification: check-hotfix-pattern: {"hotfix":false,"matches":[{"text":"quick fix"}]}; gate passed.',
        },
      ],
    });

    assert.deepEqual(result, { hotfix: false, matches: [] });
  });

  test('ignores copied detector command JSON output in commit evidence', () => {
    const result = detectHotfixSignals({
      title: 'docs: sync status wording',
      commits: [
        {
          messageHeadline: 'docs: sync status wording',
          messageBody:
            'Verification: node scripts/check-hotfix-pattern.mjs returned {"hotfix":true,"matches":[{"text":"quick fix"}]}; gate passed.',
        },
      ],
    });

    assert.deepEqual(result, { hotfix: false, matches: [] });
  });

  test('ignores copied detector JSON output after unrecognized transition wording', () => {
    const result = detectHotfixSignals({
      title: 'docs: sync status wording',
      commits: [
        {
          messageHeadline: 'docs: sync status wording',
          messageBody:
            'Verification: check-hotfix-pattern said {"hotfix":true,"matches":[{"text":"quick fix"}]}; gate passed.',
        },
      ],
    });

    assert.deepEqual(result, { hotfix: false, matches: [] });
  });

  test('ignores copied detector fenced JSON output in commit evidence', () => {
    const result = detectHotfixSignals({
      title: 'docs: sync status wording',
      commits: [
        {
          messageHeadline: 'docs: sync status wording',
          messageBody: [
            'Verification: check-hotfix-pattern returned:',
            '```json',
            '{"hotfix":true,"matches":[{"text":"quick fix"}]}',
            '```',
            'No runtime change.',
          ].join('\n'),
        },
      ],
    });

    assert.deepEqual(result, { hotfix: false, matches: [] });
  });

  test('ignores copied detector fenced JSON output without transition wording', () => {
    const result = detectHotfixSignals({
      title: 'docs: sync status wording',
      commits: [
        {
          messageHeadline: 'docs: sync status wording',
          messageBody: [
            'Verification: check-hotfix-pattern result was:',
            '```json',
            '{"hotfix":true,"matches":[{"text":"quick fix"}]}',
            '```',
            'No runtime change.',
          ].join('\n'),
        },
      ],
    });

    assert.deepEqual(result, { hotfix: false, matches: [] });
  });

  test('ignores literal sentinel-wrapped detector output in commit evidence', () => {
    const result = detectHotfixSignals({
      title: 'docs: sync status wording',
      commits: [
        {
          messageHeadline: 'docs: sync status wording',
          messageBody:
            'Verification: <<<HOTFIX-DETECTOR-V1-BEGIN>>>{"hotfix":true,"matches":[{"text":"quick fix"}]}<<<HOTFIX-DETECTOR-V1-END>>> gate passed.',
        },
      ],
    });

    assert.deepEqual(result, { hotfix: false, matches: [] });
  });

  test('ignores detector maintenance prose in detector script PRs', () => {
    const result = detectHotfixSignals({
      title: 'chore: tune detector',
      commits: [
        {
          messageHeadline: 'chore: tune detector',
          messageBody: 'Adjusted check-hotfix-pattern to recognize quick fix variants correctly.',
        },
      ],
      files: [{ filename: 'scripts/check-hotfix-pattern.mjs', changes: 12 }],
    });

    assert.deepEqual(result, { hotfix: false, matches: [] });
  });

  test('ignores detector maintenance prose in detector test-only PRs', () => {
    const result = detectHotfixSignals({
      title: 'test: cover detector variants',
      commits: [
        {
          messageHeadline: 'test: cover detector variants',
          messageBody: 'Adjusted check-hotfix-pattern to recognize quick fix variants correctly.',
        },
      ],
      files: [{ filename: 'scripts/check-hotfix-pattern.test.mjs', changes: 12 }],
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

  test('CLI skips hotfix label when changed-file stats exceed auto-label guard', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hotfix-detector-'));
    const inputPath = join(dir, 'pr.json');
    const fakeGhPath = join(dir, 'gh');
    await writeFile(
      inputPath,
      JSON.stringify({
        title: 'fix: broad change',
        commits: [{ message: 'fix: broad change' }],
        files: [{ filename: 'scripts/large-change.mjs', changes: 51 }],
      }),
    );
    await writeFile(fakeGhPath, '#!/bin/sh\necho "gh should not be called" >&2\nexit 42\n');
    await chmod(fakeGhPath, 0o755);

    const { stdout } = await execFileAsync(
      'node',
      [SCRIPT_PATH.pathname, '--input-json', inputPath, '--apply-label', '123'],
      { env: { ...process.env, PATH: `${dir}:${process.env.PATH}` } },
    );

    const parsed = JSON.parse(stdout);
    assert.equal(parsed.hotfix, true);
    assert.equal(parsed.labelApplied, undefined);
    assert.equal(parsed.labelError, undefined);
    assert.match(parsed.labelSkippedReason, /changed lines 51 exceeds 50/);
  });

  test('CLI uses --apply-label value as PR input when PR_NUMBER is unset', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hotfix-detector-gh-'));
    const fakeGhPath = join(dir, 'gh');
    const ghLogPath = join(dir, 'gh-calls.jsonl');
    await writeFile(
      fakeGhPath,
      `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';

const callsPath = ${JSON.stringify(ghLogPath)};
const args = process.argv.slice(2);
appendFileSync(callsPath, JSON.stringify(args) + '\\n');

if (args[0] === 'pr' && args[1] === 'view' && args[2] === '123') {
  console.log(JSON.stringify({ title: 'fix: pr hotfix', labels: [] }));
  process.exit(0);
}
if (args[0] === 'repo' && args[1] === 'view') {
  console.log('clowder-labs/clowder-ai');
  process.exit(0);
}
if (args[0] === 'api' && args[2] === 'repos/clowder-labs/clowder-ai/pulls/123/commits') {
  console.log(JSON.stringify({ message: 'fix: pr hotfix' }));
  process.exit(0);
}
if (args[0] === 'api' && args[2] === 'repos/clowder-labs/clowder-ai/pulls/123/files') {
  console.log(JSON.stringify({ filename: 'scripts/check-hotfix-pattern.mjs', changes: 12 }));
  process.exit(0);
}
if (args[0] === 'pr' && args[1] === 'edit' && args[2] === '123') {
  process.exit(0);
}

console.error('unexpected gh args: ' + JSON.stringify(args));
process.exit(42);
`,
    );
    await chmod(fakeGhPath, 0o755);

    const { stdout } = await execFileAsync('node', [SCRIPT_PATH.pathname, '--apply-label', '123'], {
      cwd: dir,
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, PR_NUMBER: '' },
    });

    const parsed = JSON.parse(stdout);
    assert.equal(parsed.hotfix, true);
    assert.equal(parsed.labelApplied, true);

    const ghCalls = (await readFile(ghLogPath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.ok(
      ghCalls.some((args) => args[0] === 'pr' && args[1] === 'view' && args[2] === '123'),
      '--apply-label value should be reused as the PR input number',
    );
  });

  test('CLI falls back to local git evidence when no PR input is available', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hotfix-detector-git-'));
    await execFileAsync('git', ['init'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
    await writeFile(join(dir, 'README.md'), 'base\n');
    await execFileAsync('git', ['add', 'README.md'], { cwd: dir });
    await execFileAsync('git', ['commit', '-m', 'chore: base'], { cwd: dir });
    await execFileAsync('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], { cwd: dir });
    await execFileAsync('git', ['checkout', '-b', 'feature/neutral-work'], { cwd: dir });
    await writeFile(join(dir, 'README.md'), 'base\nneutral\n');
    await execFileAsync('git', ['add', 'README.md'], { cwd: dir });
    await execFileAsync('git', ['commit', '-m', 'docs: neutral update'], { cwd: dir });

    const { stdout } = await execFileAsync('node', [SCRIPT_PATH.pathname], {
      cwd: dir,
      env: { ...process.env, PR_NUMBER: '' },
    });

    assert.deepEqual(JSON.parse(stdout), {
      hotfix: false,
      matchedTerms: [],
      matches: [],
    });
  });

  test('CLI local git fallback uses main when origin/main is unavailable', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hotfix-detector-git-main-'));
    await execFileAsync('git', ['init'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: dir });
    await execFileAsync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
    await writeFile(join(dir, 'README.md'), 'base\n');
    await execFileAsync('git', ['add', 'README.md'], { cwd: dir });
    await execFileAsync('git', ['commit', '-m', 'chore: base'], { cwd: dir });
    await execFileAsync('git', ['branch', '-M', 'main'], { cwd: dir });
    await execFileAsync('git', ['checkout', '-b', 'feature/neutral-work'], { cwd: dir });
    await writeFile(join(dir, 'README.md'), 'base\nneutral\n');
    await execFileAsync('git', ['add', 'README.md'], { cwd: dir });
    await execFileAsync('git', ['commit', '-m', 'docs: neutral update'], { cwd: dir });

    const { stdout } = await execFileAsync('node', [SCRIPT_PATH.pathname], {
      cwd: dir,
      env: { ...process.env, PR_NUMBER: '' },
    });

    assert.deepEqual(JSON.parse(stdout), {
      hotfix: false,
      matchedTerms: [],
      matches: [],
    });
  });

  test('CLI fails closed with valid JSON outside PR and git contexts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hotfix-detector-no-git-'));
    let output = '';
    await assert.rejects(
      async () => {
        try {
          await execFileAsync('node', [SCRIPT_PATH.pathname], {
            cwd: dir,
            env: { ...process.env, PR_NUMBER: '' },
          });
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
    assert.match(parsed.detectionError, /local git fallback failed/);
  });
});
