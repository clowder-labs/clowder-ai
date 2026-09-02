import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';

const projectRoot = resolve(import.meta.dirname, '..');
const checker = resolve(projectRoot, 'scripts/check-verdict-publish-contract.mjs');
const guardedGh = resolve(projectRoot, 'scripts/guarded-bin/gh');
const repoSlug = 'acme/verdict-repo';
const githubUrl = `https://github.com/${repoSlug}.git`;

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function createFixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'verdict-publish-contract-'));
  const bare = join(root, 'origin.git');
  const seed = join(root, 'seed');
  const candidate = join(root, 'candidate');
  mkdirSync(seed);
  mkdirSync(candidate);
  git(root, ['init', '--bare', bare]);
  git(seed, ['init', '-b', 'main']);
  git(seed, ['config', 'user.name', 'Fixture']);
  git(seed, ['config', 'user.email', 'fixture@example.com']);
  writeFileSync(join(seed, 'README.md'), 'base\n');
  git(seed, ['add', 'README.md']);
  git(seed, ['commit', '-m', 'base']);
  git(seed, ['remote', 'add', 'origin', bare]);
  git(seed, ['push', '-u', 'origin', 'main']);

  git(candidate, ['init']);
  git(candidate, ['config', 'user.name', 'Fixture']);
  git(candidate, ['config', 'user.email', 'fixture@example.com']);
  git(candidate, ['remote', 'add', 'origin', githubUrl]);
  git(candidate, ['config', `url.file://${bare}/.insteadOf`, githubUrl]);
  git(candidate, ['fetch', 'origin', 'main']);
  git(candidate, ['checkout', '-b', 'verdict/auto/test', 'origin/main']);
  const registryDir = join(candidate, 'docs/harness-feedback/registry');
  mkdirSync(registryDir, { recursive: true });
  writeFileSync(join(registryDir, 'measurement-bundles.yaml'), 'kind: fixture\n');
  git(candidate, ['add', 'docs/harness-feedback/registry/measurement-bundles.yaml']);
  git(candidate, ['commit', '-m', 'verdict(eval:test): fixture']);

  t.after(() => rmSync(root, { force: true, recursive: true }));
  return { candidate, root, seed };
}

function runChecker(candidate, extraArgs) {
  return spawnSync(
    process.execPath,
    [
      checker,
      '--repo-root',
      candidate,
      '--expected-repo',
      repoSlug,
      '--remote',
      'origin',
      '--source-ref',
      'HEAD',
      ...extraArgs,
    ],
    { encoding: 'utf8' },
  );
}

describe('verdict publish contract', () => {
  it('accepts the publisher base-ref mode and the guarded-gh fresh-base mode', (t) => {
    const { candidate } = createFixture(t);
    const baseResult = runChecker(candidate, ['--base-ref', 'origin/main']);
    assert.equal(baseResult.status, 0, baseResult.stderr);
    const freshResult = runChecker(candidate, ['--fresh-base-branch', 'main']);
    assert.equal(freshResult.status, 0, freshResult.stderr);
  });

  it('rejects lookalike GitHub hosts before any fetch', (t) => {
    const { candidate } = createFixture(t);
    git(candidate, ['remote', 'set-url', 'origin', `https://evilgithub.com/${repoSlug}.git`]);
    const result = runChecker(candidate, ['--base-ref', 'origin/main']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /cannot parse GitHub repo/);
  });

  it('refreshes the base and rejects a candidate that no longer includes it', (t) => {
    const { candidate, seed } = createFixture(t);
    writeFileSync(join(seed, 'new-base.txt'), 'advanced\n');
    git(seed, ['add', 'new-base.txt']);
    git(seed, ['commit', '-m', 'advance base']);
    git(seed, ['push', 'origin', 'main']);
    const result = runChecker(candidate, ['--fresh-base-branch', 'main']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /does not include fresh base/);
  });

  it('runs guarded gh through the real checker contract before delegation', (t) => {
    const { candidate, root } = createFixture(t);
    const fakeGh = join(root, 'fake-gh.mjs');
    const ghLog = join(root, 'gh-args.json');
    writeFileSync(
      fakeGh,
      '#!/usr/bin/env node\n' +
        'import { writeFileSync } from "node:fs";\n' +
        'writeFileSync(process.env.FAKE_GH_LOG, JSON.stringify(process.argv.slice(2)));\n',
    );
    chmodSync(fakeGh, 0o755);
    const args = [
      'pr',
      'create',
      '--repo',
      repoSlug,
      '--base',
      'main',
      '--head',
      'verdict/auto/test',
      '--title',
      'verdict(eval:test): fixture',
    ];
    const result = spawnSync(process.execPath, [guardedGh, ...args], {
      cwd: candidate,
      encoding: 'utf8',
      env: {
        ...process.env,
        CAT_CAFE_REAL_GH_PATH: fakeGh,
        CAT_CAFE_VERDICT_GH_GUARD_ROOT: projectRoot,
        CAT_CAFE_VERDICT_REPO_FULL_NAME: repoSlug,
        FAKE_GH_LOG: ghLog,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(ghLog, 'utf8')), args);
  });
});
