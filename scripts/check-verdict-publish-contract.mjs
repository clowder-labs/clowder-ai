#!/usr/bin/env node
/**
 * Shared fail-closed boundary for verdict publication and guarded gh.
 *
 * The checker intentionally uses only Node built-ins so it can run inside an
 * isolated Git worktree without node_modules.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';

const CENSUS_REF = 'docs/harness-feedback/registry/measurement-bundles.yaml';
const VERDICT_DIR = 'docs/harness-feedback/verdicts';
const BUNDLE_DIR = 'docs/harness-feedback/bundles';

const { values } = parseArgs({
  options: {
    'repo-root': { type: 'string' },
    'expected-repo': { type: 'string' },
    remote: { type: 'string' },
    'base-ref': { type: 'string' },
    'fresh-base-branch': { type: 'string' },
    'source-ref': { type: 'string' },
    'identity-only': { type: 'string' },
  },
  strict: true,
});

const repoRoot = values['repo-root'];
const expectedRepo = values['expected-repo'];
const remote = values.remote ?? 'origin';
const baseRef = values['base-ref'];
const freshBaseBranch = values['fresh-base-branch'];
const sourceRef = values['source-ref'];
const identityOnly = values['identity-only'] === 'true';

if (!repoRoot || !expectedRepo) {
  console.error('Usage: check-verdict-publish-contract.mjs --repo-root <path> --expected-repo <owner/repo>');
  process.exit(1);
}

function fail(message) {
  console.error(`verdict_publish_contract: ${message}`);
  process.exit(1);
}

function git(args) {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', timeout: 30_000 }).trim();
}

function lines(source) {
  return source ? source.split('\n').filter(Boolean) : [];
}

function parseGitHubRepo(remoteUrl) {
  const scpLike = /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i.exec(remoteUrl);
  if (scpLike) return `${scpLike[1]}/${scpLike[2]}`;

  let url;
  try {
    url = new URL(remoteUrl);
  } catch {
    return null;
  }
  if (url.hostname.toLowerCase() !== 'github.com') return null;
  if (!['https:', 'ssh:'].includes(url.protocol)) return null;
  const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length !== 2 || parts.some((part) => !part)) return null;
  const repo = parts[1].replace(/\.git$/i, '');
  return repo ? `${parts[0]}/${repo}` : null;
}

function assertTransportUrls(kind, urls) {
  if (urls.length === 0) fail(`remote '${remote}' has no effective ${kind} URL`);
  for (const url of urls) {
    const repoSlug = parseGitHubRepo(url);
    if (!repoSlug) fail(`cannot parse GitHub repo from effective ${kind} URL '${url}'`);
    if (repoSlug.toLowerCase() !== expectedRepo.toLowerCase()) {
      fail(`effective ${kind} URL '${url}' points to '${repoSlug}', expected '${expectedRepo}'`);
    }
  }
}

function resolveCommit(ref, label) {
  try {
    return git(['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`]);
  } catch {
    fail(`${label} '${ref}' is not reachable`);
  }
}

function showFile(commit, path) {
  const match = git(['ls-tree', '--name-only', commit, '--', path]);
  return match === path ? git(['show', `${commit}:${path}`]) : null;
}

function treeFiles(commit, directory) {
  return lines(git(['ls-tree', '-r', '--name-only', commit, '--', directory]));
}

function parseFrontmatterField(source, field, pattern) {
  const match = source.match(new RegExp(`^${field}:\\s*(${pattern})\\s*$`, 'm'));
  return match?.[1] ?? null;
}

function scanCorpus(commit) {
  const records = [];
  const counts = new Map();
  for (const path of treeFiles(commit, VERDICT_DIR)) {
    if (!path.endsWith('.md')) continue;
    const source = showFile(commit, path);
    if (source === null) continue;
    const domainId = parseFrontmatterField(source, 'domain_id', 'eval:[a-z0-9-]+');
    if (!domainId) continue;
    const fileName = path.slice(path.lastIndexOf('/') + 1);
    records.push({ domainId, fileName });
    counts.set(domainId, (counts.get(domainId) ?? 0) + 1);
  }
  records.sort((left, right) => left.fileName.localeCompare(right.fileName));
  const hashInput = records.map((record) => `${record.fileName}\0${record.domainId}`).join('\n');
  return {
    counts,
    hash: createHash('sha256').update(hashInput).digest('hex'),
    records,
    total: records.length,
  };
}

function parseCensusCounts(source, label) {
  const counts = new Map();
  let currentDomain = null;
  for (const line of source.split('\n')) {
    const domainMatch = /^\s*-\s+domainId:\s*(eval:[a-z0-9-]+)\s*$/.exec(line);
    if (domainMatch) {
      if (currentDomain) fail(`${label} census is missing a count for ${currentDomain}`);
      currentDomain = domainMatch[1];
      if (counts.has(currentDomain)) fail(`${label} census repeats ${currentDomain}`);
      continue;
    }
    const countMatch = /^\s+committedVerdictArtifactCount:\s*(\d+)\s*$/.exec(line);
    if (countMatch && currentDomain) {
      counts.set(currentDomain, Number(countMatch[1]));
      currentDomain = null;
    }
  }
  if (currentDomain) fail(`${label} census is missing a count for ${currentDomain}`);
  if (counts.size === 0) fail(`${label} census has no domain entries`);
  return counts;
}

function parseCensus(source, label) {
  const kind = /^kind:\s*(\S+)\s*$/m.exec(source)?.[1];
  const schemaVersion = Number(/^schemaVersion:\s*(\d+)\s*$/m.exec(source)?.[1]);
  const hash = /^verdictCorpusHash:\s*([a-f0-9]{64})\s*$/m.exec(source)?.[1];
  const totalText = /^committedVerdictArtifactCount:\s*(\d+)\s*$/m.exec(source)?.[1];
  if (kind !== 'f267-measurement-bundle-census' || schemaVersion !== 2 || !hash || totalText === undefined) {
    fail(`${label} census has an invalid contract header`);
  }
  const counts = parseCensusCounts(source, label);
  return { counts, hash, total: Number(totalText) };
}

function assertCensusMatchesCorpus(censusSource, corpus, label) {
  const census = parseCensus(censusSource, label);
  if (census.total !== corpus.total) fail(`${label} census committed verdict artifact total mismatch`);
  if (census.hash !== corpus.hash) fail(`${label} census verdict corpus hash mismatch`);
  for (const [domainId, count] of census.counts) {
    if (count !== (corpus.counts.get(domainId) ?? 0)) {
      fail(`${label} census committed verdict artifact count mismatch for ${domainId}`);
    }
  }
  for (const domainId of corpus.counts.keys()) {
    if (!census.counts.has(domainId)) fail(`${label} census is missing corpus domain ${domainId}`);
  }
}

function censusNonDerivedMetadata(source) {
  return source
    .split('\n')
    .filter(
      (line) =>
        !/^generatedAt:/.test(line) &&
        !/^verdictCorpusHash:/.test(line) &&
        !/^committedVerdictArtifactCount:/.test(line) &&
        !/^\s+committedVerdictArtifactCount:/.test(line),
    )
    .join('\n');
}

function changedPaths(baseCommit, sourceCommit) {
  return lines(git(['diff', '--name-status', baseCommit, sourceCommit, '--'])).map((line) => {
    const [status, ...pathParts] = line.split('\t');
    return { path: pathParts.at(-1), status };
  });
}

function parseSnapshot(commit, verdictId, label) {
  const path = `${BUNDLE_DIR}/${verdictId}/snapshot.json`;
  const source = showFile(commit, path);
  if (source === null) fail(`${label} is missing ${path}`);
  let snapshot;
  try {
    snapshot = JSON.parse(source);
  } catch {
    fail(`${label} has invalid JSON at ${path}`);
  }
  const startMs = snapshot?.window?.startMs;
  const endMs = snapshot?.window?.endMs;
  if (snapshot?.verdictId !== verdictId || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    fail(`${label} has an invalid verdictId or window at ${path}`);
  }
  return { endMs, path, startMs };
}

function verdictRecord(commit, path, label, strictPacketId = false) {
  const source = showFile(commit, path);
  if (source === null) fail(`${label} is missing ${path}`);
  const domainId = parseFrontmatterField(source, 'domain_id', 'eval:[a-z0-9-]+');
  const fileId = path.slice(path.lastIndexOf('/') + 1, -3);
  if (!domainId) fail(`${label} has invalid verdict frontmatter at ${path}`);
  if (strictPacketId) {
    const packetId = parseFrontmatterField(source, 'packet_id', '[a-z0-9-]+');
    if (packetId !== fileId) fail(`${label} has invalid verdict frontmatter at ${path}`);
  }
  return { domainId, packetId: fileId, ...parseSnapshot(commit, fileId, label) };
}

function windowKey(record) {
  return `${record.domainId}\0${record.startMs}\0${record.endMs}`;
}

function assertNoWindowCollision(baseCommit, sourceCommit, changes) {
  const verdictChanges = changes.filter(
    (change) => change.path?.startsWith(`${VERDICT_DIR}/`) && change.path.endsWith('.md'),
  );
  for (const change of verdictChanges) {
    if (change.status !== 'A') fail(`verdict corpus is append-only; found ${change.status} ${change.path}`);
  }
  if (verdictChanges.length === 0) return;

  const baseKeys = new Set();
  for (const path of treeFiles(baseCommit, VERDICT_DIR)) {
    if (!path.endsWith('.md')) continue;
    baseKeys.add(windowKey(verdictRecord(baseCommit, path, 'base verdict')));
  }

  const candidateIds = new Set();
  const candidateKeys = new Set();
  for (const change of verdictChanges) {
    const record = verdictRecord(sourceCommit, change.path, 'candidate verdict', true);
    if (candidateIds.has(record.packetId)) fail(`candidate repeats packet id ${record.packetId}`);
    candidateIds.add(record.packetId);
    const key = windowKey(record);
    if (baseKeys.has(key) || candidateKeys.has(key)) {
      fail(
        `verdict_window_already_published: ${record.domainId} ${record.startMs}-${record.endMs} (${record.packetId})`,
      );
    }
    candidateKeys.add(key);
    const snapshotChange = changes.find((item) => item.path === record.path);
    if (snapshotChange?.status !== 'A') fail(`candidate verdict must add ${record.path}`);
  }
}

if (!/^[A-Za-z0-9._-]+$/.test(remote)) fail(`invalid remote name '${remote}'`);
try {
  assertTransportUrls('fetch', lines(git(['remote', 'get-url', '--all', remote])));
  assertTransportUrls('push', lines(git(['remote', 'get-url', '--push', '--all', remote])));
} catch (error) {
  if (error?.status !== undefined) fail(`remote '${remote}' not found`);
  throw error;
}
if (identityOnly) process.exit(0);

if (!sourceRef) fail('--source-ref is required for full contract check');
if (baseRef && freshBaseBranch) fail('use either --base-ref or --fresh-base-branch, not both');

let resolvedBaseRef = baseRef;
if (freshBaseBranch) {
  try {
    git(['check-ref-format', '--branch', freshBaseBranch]);
    const remoteTrackingRef = `refs/remotes/${remote}/${freshBaseBranch}`;
    git(['fetch', '--no-tags', '--force', remote, `refs/heads/${freshBaseBranch}:${remoteTrackingRef}`]);
    resolvedBaseRef = remoteTrackingRef;
  } catch {
    fail(`failed to refresh ${remote}/${freshBaseBranch}`);
  }
}
if (!resolvedBaseRef) fail('--base-ref or --fresh-base-branch is required');

const baseCommit = resolveCommit(resolvedBaseRef, 'base ref');
const sourceCommit = resolveCommit(sourceRef, 'source ref');
try {
  git(['merge-base', '--is-ancestor', baseCommit, sourceCommit]);
} catch {
  fail(`source-ref '${sourceRef}' does not include fresh base '${resolvedBaseRef}'`);
}

const changes = changedPaths(baseCommit, sourceCommit);
const baseCensus = showFile(baseCommit, CENSUS_REF);
const sourceCensus = showFile(sourceCommit, CENSUS_REF);
if (sourceCensus === null) fail(`source is missing required census ${CENSUS_REF}`);

const baseCorpus = scanCorpus(baseCommit);
const sourceCorpus = scanCorpus(sourceCommit);
assertCensusMatchesCorpus(sourceCensus, sourceCorpus, 'source');
if (baseCensus === null) {
  const bootstrap = changes.length === 1 && changes[0]?.status === 'A' && changes[0]?.path === CENSUS_REF;
  if (!bootstrap || baseCorpus.hash !== sourceCorpus.hash || baseCorpus.total !== sourceCorpus.total) {
    fail(`base is missing required census ${CENSUS_REF}; only a census-only bootstrap is allowed`);
  }
} else {
  assertCensusMatchesCorpus(baseCensus, baseCorpus, 'base');
  if (censusNonDerivedMetadata(baseCensus) !== censusNonDerivedMetadata(sourceCensus)) {
    fail('census non-derived metadata changed during verdict publication');
  }
}

assertNoWindowCollision(baseCommit, sourceCommit, changes);
