#!/usr/bin/env node
/**
 * check-verdict-publish-contract.mjs
 *
 * Shared pre-publish contract for the isolated publisher and guarded gh.
 * It verifies exact GitHub repository identity, refreshes the requested base
 * when asked, and rejects candidates that do not contain that base.
 */

import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

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

function git(args) {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', timeout: 30_000 }).trim();
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

function resolveCommit(ref, label) {
  try {
    return git(['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`]);
  } catch {
    console.error(`verdict_publish_contract: ${label} '${ref}' is not reachable`);
    process.exit(1);
  }
}

let remoteUrl;
try {
  if (!/^[A-Za-z0-9._-]+$/.test(remote)) throw new Error('invalid remote name');
  // Read the stored URL instead of `remote get-url`: tests and managed local
  // mirrors may use url.*.insteadOf for transport while identity stays bound
  // to the configured GitHub repository.
  remoteUrl = git(['config', '--get', `remote.${remote}.url`]);
} catch {
  console.error(`verdict_publish_contract: remote '${remote}' not found`);
  process.exit(1);
}

const repoSlug = parseGitHubRepo(remoteUrl);
if (!repoSlug) {
  console.error(`verdict_publish_contract: cannot parse GitHub repo from remote URL '${remoteUrl}'`);
  process.exit(1);
}
if (repoSlug.toLowerCase() !== expectedRepo.toLowerCase()) {
  console.error(`verdict_publish_contract: remote '${remote}' points to '${repoSlug}', expected '${expectedRepo}'`);
  process.exit(1);
}
if (identityOnly) process.exit(0);

if (!sourceRef) {
  console.error('verdict_publish_contract: --source-ref is required for full contract check');
  process.exit(1);
}
if (baseRef && freshBaseBranch) {
  console.error('verdict_publish_contract: use either --base-ref or --fresh-base-branch, not both');
  process.exit(1);
}

let resolvedBaseRef = baseRef;
if (freshBaseBranch) {
  try {
    git(['check-ref-format', '--branch', freshBaseBranch]);
    const remoteTrackingRef = `refs/remotes/${remote}/${freshBaseBranch}`;
    git(['fetch', '--no-tags', remote, `refs/heads/${freshBaseBranch}:${remoteTrackingRef}`]);
    resolvedBaseRef = remoteTrackingRef;
  } catch {
    console.error(`verdict_publish_contract: failed to refresh ${remote}/${freshBaseBranch}`);
    process.exit(1);
  }
}
if (!resolvedBaseRef) {
  console.error('verdict_publish_contract: --base-ref or --fresh-base-branch is required');
  process.exit(1);
}

const baseCommit = resolveCommit(resolvedBaseRef, 'base ref');
const sourceCommit = resolveCommit(sourceRef, 'source ref');
try {
  git(['merge-base', '--is-ancestor', baseCommit, sourceCommit]);
} catch {
  console.error(`verdict_publish_contract: source-ref '${sourceRef}' does not include fresh base '${resolvedBaseRef}'`);
  process.exit(1);
}
