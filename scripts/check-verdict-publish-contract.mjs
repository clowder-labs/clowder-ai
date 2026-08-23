#!/usr/bin/env node
/**
 * check-verdict-publish-contract.mjs
 *
 * Pre-publish contract check for the verdict auto-PR pipeline.
 * Called by git-worktree-publisher.ts before and after `git fetch`.
 *
 * Two modes:
 *   --identity-only true  → verify remote URL matches --expected-repo (fast, no network)
 *   (default)             → identity check + verify --source-ref is reachable
 *
 * Exit 0 = contract satisfied. Non-zero = abort publish.
 *
 * CLI args:
 *   --repo-root <path>        Repository root
 *   --expected-repo <owner/repo>  Expected GitHub repo (e.g. zts212653/cat-cafe)
 *   --remote <name>           Remote name (e.g. origin)
 *   --base-ref <ref>          Base ref for the publish (e.g. origin/main)
 *   --source-ref <ref>        Source ref to validate corpus against
 *   --identity-only <bool>    If "true", skip corpus check
 */

import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    'repo-root': { type: 'string' },
    'expected-repo': { type: 'string' },
    remote: { type: 'string' },
    'base-ref': { type: 'string' },
    'source-ref': { type: 'string' },
    'identity-only': { type: 'string' },
  },
  strict: true,
});

const repoRoot = values['repo-root'];
const expectedRepo = values['expected-repo'];
const remote = values['remote'] ?? 'origin';
const sourceRef = values['source-ref'];
const identityOnly = values['identity-only'] === 'true';

if (!repoRoot || !expectedRepo) {
  console.error('Usage: check-verdict-publish-contract.mjs --repo-root <path> --expected-repo <owner/repo>');
  process.exit(1);
}

function git(args) {
  return execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', timeout: 30_000 }).trim();
}

// ── Identity check: verify remote URL matches expected repo ──
let remoteUrl;
try {
  remoteUrl = git(['remote', 'get-url', remote]);
} catch {
  console.error(`verdict_publish_contract: remote '${remote}' not found`);
  process.exit(1);
}

// Normalize: extract owner/repo from HTTPS or SSH URL
const httpsMatch = remoteUrl.match(/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/);
const repoSlug = httpsMatch?.[1];
if (!repoSlug) {
  console.error(`verdict_publish_contract: cannot parse GitHub repo from remote URL '${remoteUrl}'`);
  process.exit(1);
}

if (repoSlug !== expectedRepo) {
  console.error(
    `verdict_publish_contract: remote '${remote}' points to '${repoSlug}', expected '${expectedRepo}'`,
  );
  process.exit(1);
}

if (identityOnly) {
  process.exit(0);
}

// ── Corpus check: verify source-ref is reachable ──
if (!sourceRef) {
  console.error('verdict_publish_contract: --source-ref is required for full corpus check');
  process.exit(1);
}

try {
  git(['rev-parse', '--verify', sourceRef]);
} catch {
  console.error(`verdict_publish_contract: source-ref '${sourceRef}' is not reachable`);
  process.exit(1);
}
