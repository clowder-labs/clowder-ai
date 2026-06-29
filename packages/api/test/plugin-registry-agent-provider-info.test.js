/**
 * F241 Phase C — `PluginRegistry.getPluginInfo` agentProvider projection tests.
 *
 * The Hub UI for owner approval renders entirely off the `PluginResourceStatus`
 * fields that `getPluginInfo` projects out of the persisted capabilities row
 * and the manifest declaration. These tests lock down that projection:
 *   - capId is populated for agentProvider resources
 *   - host-owned routeable / approval / binding state mirrors capabilities
 *   - manifest-declared claims (PR #39 providerId/displayName/mentionPatterns)
 *     are surfaced so the form can prefill defaults
 *   - failureReason surfaces only when health.passed === false
 *   - non-agentProvider resources are unaffected
 */

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const { PluginRegistry } = await import('../dist/domains/plugin/PluginRegistry.js');

function makeManifest({ withClaims = true } = {}) {
  return {
    id: 'clowder-code',
    name: 'Clowder Code',
    version: '0.1.0',
    builtin: false,
    config: [],
    resources: [
      {
        type: 'agentProvider',
        name: 'clowder-code',
        agentProvider: {
          name: 'clowder-code',
          transport: 'cli-jsonl',
          command: 'clowder-code',
          startupArgs: ['--json'],
          sessionPolicy: 'stateless',
          outputProfile: 'clowder-code-turn-result-v1',
          ...(withClaims
            ? {
                providerId: 'clowder-code',
                displayName: 'Clowder Code',
                mentionPatterns: ['@clowder', '@clowder-code'],
              }
            : {}),
        },
      },
    ],
  };
}

function makeCapabilities({ routeable, approved, binding, descriptorHash, failureReason, lastSyncError } = {}) {
  return {
    version: 1,
    capabilities: [
      {
        id: 'plugin:clowder-code:clowder-code',
        type: 'agentProvider',
        enabled: true,
        source: 'cat-cafe',
        pluginId: 'clowder-code',
        agentProvider: {
          name: 'clowder-code',
          transport: 'cli-jsonl',
          command: 'clowder-code',
          startupArgs: ['--json'],
          sessionPolicy: 'stateless',
          outputProfile: 'clowder-code-turn-result-v1',
          state: routeable ? 'healthy' : 'transportReady',
          routeable: !!routeable,
          routeableApproved: !!approved,
          descriptorHash: descriptorHash ?? 'hash-X',
          ...(binding ? { routeableBinding: binding } : {}),
          ...(failureReason
            ? {
                health: {
                  passed: false,
                  checkedAt: 1000,
                  ttlMs: 60_000,
                  descriptorHash: descriptorHash ?? 'hash-X',
                  failureReason,
                },
              }
            : {}),
          ...(lastSyncError ? { lastSyncError } : {}),
        },
      },
    ],
  };
}

function makeRegistry() {
  return new PluginRegistry(mkdtempSync(join(os.tmpdir(), 'plugin-info-test-')));
}

describe('PluginRegistry.getPluginInfo — F241 agentProvider projection', () => {
  it('populates capId for the Hub UI POST URL', () => {
    const reg = makeRegistry();
    const info = reg.getPluginInfo(makeManifest(), makeCapabilities({ routeable: false, approved: false }), {});
    const r = info.resources[0];
    assert.equal(r.capId, 'plugin:clowder-code:clowder-code');
  });

  it('surfaces routeable + approval flags from capabilities', () => {
    const reg = makeRegistry();
    const info = reg.getPluginInfo(
      makeManifest(),
      makeCapabilities({
        routeable: true,
        approved: true,
        binding: { catId: 'clowder-cat', mentionPatterns: ['@clowder'] },
      }),
      {},
    );
    const r = info.resources[0];
    assert.equal(r.agentProviderRouteable, true);
    assert.equal(r.agentProviderRouteableApproved, true);
    assert.equal(r.agentProviderState, 'healthy');
    assert.deepEqual(r.agentProviderBinding, { catId: 'clowder-cat', mentionPatterns: ['@clowder'] });
  });

  it('surfaces manifest identity claims (PR #39) for form prefill', () => {
    const reg = makeRegistry();
    const info = reg.getPluginInfo(
      makeManifest({ withClaims: true }),
      makeCapabilities({ routeable: false, approved: false }),
      {},
    );
    assert.deepEqual(info.resources[0].agentProviderClaims, {
      providerId: 'clowder-code',
      displayName: 'Clowder Code',
      mentionPatterns: ['@clowder', '@clowder-code'],
    });
  });

  it('omits agentProviderClaims when manifest declares none', () => {
    const reg = makeRegistry();
    const info = reg.getPluginInfo(
      makeManifest({ withClaims: false }),
      makeCapabilities({ routeable: false, approved: false }),
      {},
    );
    assert.equal(info.resources[0].agentProviderClaims, undefined);
  });

  it('surfaces descriptorHash so the operator can see when re-approval is pending', () => {
    const reg = makeRegistry();
    const info = reg.getPluginInfo(
      makeManifest(),
      makeCapabilities({ routeable: false, approved: false, descriptorHash: 'hash-Y' }),
      {},
    );
    assert.equal(info.resources[0].agentProviderDescriptorHash, 'hash-Y');
  });

  it('surfaces health.failureReason when probe failed', () => {
    const reg = makeRegistry();
    const info = reg.getPluginInfo(
      makeManifest(),
      makeCapabilities({ routeable: false, approved: false, failureReason: 'cli-probe-cli-not-found:clowder-code' }),
      {},
    );
    assert.equal(info.resources[0].agentProviderHealthFailureReason, 'cli-probe-cli-not-found:clowder-code');
  });

  it('omits failureReason when health passed (no operator-visible noise on the happy path)', () => {
    const reg = makeRegistry();
    const info = reg.getPluginInfo(
      makeManifest(),
      makeCapabilities({ routeable: true, approved: true, binding: { catId: 'clowder-cat' } }),
      {},
    );
    assert.equal(info.resources[0].agentProviderHealthFailureReason, undefined);
  });

  // PR #42 round-1 review @codex P2: persisted post-approval sync failures
  // must surface to the Hub so operators can diagnose a row that is
  // approved + healthy but stuck non-routeable.
  it('surfaces lastSyncError (message + occurredAt) so post-approval sync failure is diagnosable', () => {
    const reg = makeRegistry();
    const info = reg.getPluginInfo(
      makeManifest(),
      makeCapabilities({
        routeable: false,
        approved: true,
        binding: { catId: 'clowder-cat' },
        lastSyncError: { message: 'agent registry sync failed: ENOENT', occurredAt: 1_700_000_000_999 },
      }),
      {},
    );
    assert.deepEqual(info.resources[0].agentProviderLastSyncError, {
      message: 'agent registry sync failed: ENOENT',
      occurredAt: 1_700_000_000_999,
    });
  });

  it('omits lastSyncError on the happy path (no UI noise after sync succeeds)', () => {
    const reg = makeRegistry();
    const info = reg.getPluginInfo(
      makeManifest(),
      makeCapabilities({ routeable: true, approved: true, binding: { catId: 'clowder-cat' } }),
      {},
    );
    assert.equal(info.resources[0].agentProviderLastSyncError, undefined);
  });

  it('does NOT add F241 fields to non-agentProvider resources', () => {
    const reg = makeRegistry();
    const manifest = {
      id: 'gh',
      name: 'GitHub',
      version: '1.0.0',
      builtin: false,
      config: [],
      resources: [{ type: 'schedule', name: 'cicd-check', factoryId: 'github.cicd-check' }],
    };
    const info = reg.getPluginInfo(manifest, { version: 1, capabilities: [] }, {});
    const r = info.resources[0];
    assert.equal(r.capId, undefined);
    assert.equal(r.agentProviderRouteable, undefined);
    assert.equal(r.agentProviderBinding, undefined);
    assert.equal(r.agentProviderClaims, undefined);
  });
});
