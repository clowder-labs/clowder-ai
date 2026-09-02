import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { describe, it } from 'node:test';

const projectRoot = resolve(import.meta.dirname, '..');
const checker = resolve(projectRoot, 'scripts/check-verdict-publish-contract.mjs');
const guardedGh = resolve(projectRoot, 'scripts/guarded-bin/gh');
const repoSlug = 'acme/verdict-repo';
const githubUrl = `https://github.com/${repoSlug}.git`;
const censusRef = 'docs/harness-feedback/registry/measurement-bundles.yaml';

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function corpusHash(records) {
  const input = records
    .toSorted((left, right) => left.fileName.localeCompare(right.fileName))
    .map((record) => `${record.fileName}\0${record.domainId}`)
    .join('\n');
  return createHash('sha256').update(input).digest('hex');
}

function census(records, classification = 'active_decision_bearing') {
  return `kind: f267-measurement-bundle-census
schemaVersion: 2
generatedAt: 2026-09-02T00:00:00.000Z
sources:
  verdictDir: docs/harness-feedback/verdicts
verdictCorpusHash: ${corpusHash(records)}
committedVerdictArtifactCount: ${records.length}
entries:
  - domainId: eval:test
    classification: ${classification}
    committedVerdictArtifactCount: ${records.filter((record) => record.domainId === 'eval:test').length}
`;
}

function writeVerdict(repo, id, { domainId = 'eval:test', endMs = 200, packetId = id, startMs = 100 } = {}) {
  const verdictDir = join(repo, 'docs/harness-feedback/verdicts');
  const bundleDir = join(repo, 'docs/harness-feedback/bundles', id);
  mkdirSync(verdictDir, { recursive: true });
  mkdirSync(bundleDir, { recursive: true });
  writeFileSync(
    join(verdictDir, `${id}.md`),
    `---\ndomain_id: ${domainId}\npacket_id: ${packetId}\nsource_snapshot: snapshot:bundle/${id}/snapshot\n---\n`,
  );
  writeFileSync(
    join(bundleDir, 'snapshot.json'),
    `${JSON.stringify({ verdictId: id, window: { startMs, endMs } }, null, 2)}\n`,
  );
}

function installGitProxy(root, bare) {
  const binDir = join(root, 'bin');
  const proxy = join(binDir, 'git');
  const realGit = execFileSync('command', ['-v', 'git'], { encoding: 'utf8' }).trim();
  mkdirSync(binDir);
  writeFileSync(
    proxy,
    `#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_GIT_LOG, JSON.stringify(args) + '\\n');
const commandIndex = args[0] === '-C' ? 2 : 0;
if (args[commandIndex] === 'fetch') {
  const remoteIndex = args.indexOf('origin', commandIndex + 1);
  if (remoteIndex !== -1) args[remoteIndex] = process.env.FAKE_GIT_BARE;
}
const result = spawnSync(process.env.REAL_GIT, args, { encoding: 'utf8' });
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
process.exit(result.status ?? 1);
`,
  );
  chmodSync(proxy, 0o755);
  return {
    ...process.env,
    FAKE_GIT_BARE: bare,
    FAKE_GIT_LOG: join(root, 'git-args.jsonl'),
    PATH: `${binDir}${delimiter}${process.env.PATH}`,
    REAL_GIT: realGit,
  };
}

function createFixture(t, { withCensus = true } = {}) {
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
  if (withCensus) {
    mkdirSync(join(seed, 'docs/harness-feedback/registry'), { recursive: true });
    mkdirSync(join(seed, 'docs/harness-feedback/verdicts'), { recursive: true });
    writeFileSync(join(seed, censusRef), census([]));
  }
  git(seed, ['add', '.']);
  git(seed, ['commit', '-m', 'base']);
  git(seed, ['remote', 'add', 'origin', bare]);
  git(seed, ['push', '-u', 'origin', 'main']);

  git(candidate, ['init']);
  git(candidate, ['config', 'user.name', 'Fixture']);
  git(candidate, ['config', 'user.email', 'fixture@example.com']);
  git(candidate, ['remote', 'add', 'origin', bare]);
  git(candidate, ['fetch', 'origin', 'main']);
  git(candidate, ['checkout', '-b', 'verdict/auto/test', 'origin/main']);
  git(candidate, ['remote', 'set-url', 'origin', githubUrl]);

  const env = installGitProxy(root, bare);
  t.after(() => rmSync(root, { force: true, recursive: true }));
  return { bare, candidate, env, root, seed };
}

function commitCandidate(candidate, message = 'verdict(eval:test): fixture') {
  git(candidate, ['add', '.']);
  git(candidate, ['commit', '-m', message]);
}

function runChecker(candidate, extraArgs, env = process.env) {
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
    { encoding: 'utf8', env },
  );
}

describe('verdict publish contract', () => {
  it('accepts the publisher base-ref mode and the guarded-gh fresh-base mode', (t) => {
    const { candidate, env } = createFixture(t);
    const baseResult = runChecker(candidate, ['--base-ref', 'origin/main']);
    assert.equal(baseResult.status, 0, baseResult.stderr);
    const freshResult = runChecker(candidate, ['--fresh-base-branch', 'main'], env);
    assert.equal(freshResult.status, 0, freshResult.stderr);
  });

  it('rejects lookalike hosts, effective URL rewrites, and a distinct push URL', (t) => {
    const { bare, candidate } = createFixture(t);
    git(candidate, ['remote', 'set-url', 'origin', `https://evilgithub.com/${repoSlug}.git`]);
    let result = runChecker(candidate, ['--base-ref', 'origin/main']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /cannot parse GitHub repo/);

    git(candidate, ['remote', 'set-url', 'origin', githubUrl]);
    git(candidate, ['config', `url.file://${bare}/.insteadOf`, githubUrl]);
    result = runChecker(candidate, ['--base-ref', 'origin/main']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /effective fetch URL/);

    git(candidate, ['config', '--unset-all', `url.file://${bare}/.insteadOf`]);
    git(candidate, ['remote', 'set-url', '--push', 'origin', 'git@github.com:attacker/verdict-repo.git']);
    result = runChecker(candidate, ['--base-ref', 'origin/main']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /effective push URL.*attacker\/verdict-repo/);
  });

  it('force-refreshes a rewritten base and rejects a candidate that no longer includes it', (t) => {
    const { candidate, env, seed } = createFixture(t);
    git(seed, ['checkout', '--orphan', 'replacement']);
    writeFileSync(join(seed, 'replacement.txt'), 'rewritten\n');
    git(seed, ['add', '.']);
    git(seed, ['commit', '-m', 'rewrite base']);
    git(seed, ['push', '--force', 'origin', 'replacement:main']);
    const result = runChecker(candidate, ['--fresh-base-branch', 'main'], env);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /does not include fresh base/);
    assert.doesNotMatch(result.stderr, /failed to refresh/);
    const calls = readFileSync(env.FAKE_GIT_LOG, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.ok(calls.some((args) => args.includes('fetch') && args.includes('--force')));
  });

  it('rejects census drift outside derived fields', (t) => {
    const { candidate } = createFixture(t);
    writeFileSync(join(candidate, censusRef), census([], 'gated'));
    commitCandidate(candidate, 'tamper census metadata');
    const result = runChecker(candidate, ['--base-ref', 'origin/main']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /census non-derived metadata changed/);
  });

  it('rejects a second verdict for the same domain and exact window', (t) => {
    const { candidate, seed } = createFixture(t);
    writeVerdict(seed, 'existing', { packetId: 'vhp_legacy_packet_id' });
    writeFileSync(join(seed, censusRef), census([{ fileName: 'existing.md', domainId: 'eval:test' }]));
    git(seed, ['add', '.']);
    git(seed, ['commit', '-m', 'publish existing verdict']);
    git(seed, ['push', 'origin', 'main']);
    git(candidate, ['remote', 'set-url', 'origin', join(seed, '..', 'origin.git')]);
    git(candidate, ['fetch', 'origin', 'main']);
    git(candidate, ['reset', '--hard', 'origin/main']);
    git(candidate, ['remote', 'set-url', 'origin', githubUrl]);

    writeVerdict(candidate, 'duplicate-window');
    const records = [
      { fileName: 'existing.md', domainId: 'eval:test' },
      { fileName: 'duplicate-window.md', domainId: 'eval:test' },
    ];
    writeFileSync(join(candidate, censusRef), census(records));
    commitCandidate(candidate);
    const result = runChecker(candidate, ['--base-ref', 'origin/main']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /verdict_window_already_published/);
  });

  it('allows the controlled census bootstrap used by the seed PR', (t) => {
    const { candidate } = createFixture(t, { withCensus: false });
    mkdirSync(join(candidate, 'docs/harness-feedback/registry'), { recursive: true });
    writeFileSync(join(candidate, censusRef), census([]));
    commitCandidate(candidate, 'seed census');
    const result = runChecker(candidate, ['--base-ref', 'origin/main']);
    assert.equal(result.status, 0, result.stderr);
  });

  it('runs guarded gh through the real checker contract before delegation', (t) => {
    const { candidate, env, root } = createFixture(t);
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
        ...env,
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
