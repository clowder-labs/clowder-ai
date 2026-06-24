/**
 * F241 Phase B Slice 2b: tests covering the P1 review fixes from codex.
 *
 * Each describe block targets one of codex's review P1 findings:
 *   - P1.2: baseline read failure must fail-closed (not warn-and-empty)
 *   - P1.3: snapshot must include routeable bindings + active-cat mention patterns
 *   - P1.5: TTL-expired health must refresh synchronously; failure degrades
 *           routeable=false; success persists refreshed health
 */

import './helpers/setup-cat-registry.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const sharedModule = await import('@cat-cafe/shared');
const { CatRegistry } = sharedModule;
const { AgentProviderApprovalService } = await import('../dist/domains/plugin/agent-provider-approval-service.js');
const { buildAgentProviderAdmissionSnapshot } = await import(
  '../dist/domains/plugin/agent-provider-admission-snapshot.js'
);
const { refreshExpiredHealthInPlace } = await import('../dist/domains/plugin/agent-provider-health-refresh.js');
const { computeAgentProviderDescriptorHash } = await import('../dist/domains/plugin/agent-provider-descriptor-hash.js');

function makeRow({ pluginId = 'clowder-code', capId = 'clowder-code', overrides = {} } = {}) {
  const resource = {
    name: 'clowder-code',
    transport: 'cli-jsonl',
    command: 'clowder-code',
    startupArgs: ['--json'],
    resumeArgs: ['resume', '{sessionId}'],
    sessionPolicy: 'resume',
    outputProfile: 'clowder-code-turn-result-v1',
    healthCheck: { type: 'cliProbe' },
    ...overrides.resource,
  };
  const descriptorHash = computeAgentProviderDescriptorHash({ pluginId, capId, resource });
  return {
    pluginId,
    capId,
    descriptor: {
      ...resource,
      state: 'healthy',
      routeable: true,
      routeableApproved: true,
      descriptorHash,
      health: {
        passed: true,
        checkedAt: 1000,
        ttlMs: 60_000,
        descriptorHash,
      },
      routeableBinding: {
        catId: 'clowder-cat',
        mentionPatterns: ['clowder'],
      },
      ...overrides.descriptor,
    },
  };
}

describe('P1.2 — baseline-unavailable fails closed', () => {
  it('approval service returns admission-snapshot-unavailable when buildAdmissionSnapshot throws', async () => {
    const capabilities = {
      version: 1,
      capabilities: [
        {
          id: 'clowder-code',
          type: 'agentProvider',
          enabled: true,
          source: 'cat-cafe',
          pluginId: 'clowder-code',
          agentProvider: makeRow().descriptor,
        },
      ],
    };
    let state = structuredClone(capabilities);
    const service = new AgentProviderApprovalService({
      readCapabilities: async () => structuredClone(state),
      writeCapabilities: async (next) => {
        state = structuredClone(next);
      },
      withCapabilityLock: async (fn) => fn(),
      buildAdmissionSnapshot: async () => {
        throw new Error('cat-template.json unreadable');
      },
      getHealthExecutorContext: () => ({
        providerTransportRegistry: { has: () => true },
        now: () => 1_700_000_000_000,
      }),
    });
    const result = await service.approveRouteable({
      pluginId: 'clowder-code',
      capId: 'clowder-code',
      catId: 'clowder-cat',
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'admission-snapshot-unavailable');
    assert.match(result.details, /cat-template\.json unreadable/);
  });
});

describe('P1.3 — snapshot must include binding + active-cat mention patterns', () => {
  it('blocks a candidate that claims an existing routeable plugin binding catId (not just name)', () => {
    const candidate = makeRow().descriptor;
    const otherPluginEntry = {
      id: 'other-plugin',
      type: 'agentProvider',
      enabled: true,
      source: 'cat-cafe',
      pluginId: 'other-plugin',
      agentProvider: {
        ...candidate,
        name: 'other-plugin-name', // DIFFERENT name
        routeableBinding: { catId: 'clowder-cat' }, // but SAME binding.catId
      },
    };
    const snapshot = buildAgentProviderAdmissionSnapshot({
      capabilitiesConfig: { version: 1, capabilities: [otherPluginEntry] },
      activeCatConfigs: {},
      templateBaselineIds: new Set(),
      hasProviderTransportConfig: () => false,
      candidatePluginId: 'clowder-code',
      candidateCapId: 'clowder-code',
    });
    // The snapshot must surface 'clowder-cat' even though the candidate's
    // `name` ('clowder-code') doesn't collide.
    assert.ok(
      snapshot.existingRouteableIdentities.has('clowder-cat'),
      'snapshot must include existing routeable bindings, not just descriptor.name',
    );
  });

  it('blocks @-alias collision with an active cat (mentionPatterns), not just the cat-id literal', () => {
    const snapshot = buildAgentProviderAdmissionSnapshot({
      capabilitiesConfig: { version: 1, capabilities: [] },
      activeCatConfigs: {
        opus: { id: 'opus', mentionPatterns: ['opus', 'opus47', '宪宪'] },
      },
      templateBaselineIds: new Set(),
      hasProviderTransportConfig: () => false,
      candidatePluginId: 'clowder-code',
      candidateCapId: 'clowder-code',
    });
    assert.ok(snapshot.activeNonProviderTransportIdentities.has('opus'));
    assert.ok(snapshot.activeNonProviderTransportIdentities.has('opus47'));
    assert.ok(
      snapshot.activeNonProviderTransportIdentities.has('宪宪'),
      'plugin must not be able to claim 宪宪 alias of a real cat',
    );
  });

  it('the candidate is still EXCLUDED from existing routeable identities (regression guard)', () => {
    const candidateEntry = {
      id: 'clowder-code',
      type: 'agentProvider',
      enabled: true,
      source: 'cat-cafe',
      pluginId: 'clowder-code',
      agentProvider: makeRow().descriptor,
    };
    const snapshot = buildAgentProviderAdmissionSnapshot({
      capabilitiesConfig: { version: 1, capabilities: [candidateEntry] },
      activeCatConfigs: {},
      templateBaselineIds: new Set(),
      hasProviderTransportConfig: () => false,
      candidatePluginId: 'clowder-code',
      candidateCapId: 'clowder-code',
    });
    // The candidate's OWN identities must not appear in the snapshot.
    assert.equal(snapshot.existingRouteableIdentities.has('clowder-cat'), false);
    assert.equal(snapshot.existingRouteableIdentities.has('clowder'), false);
    assert.equal(snapshot.existingRouteableIdentities.has('clowder-code'), false);
  });
});

describe('P1.5 — TTL-expired health refresh on sync', () => {
  function makeCapabilities(rows) {
    return {
      version: 1,
      capabilities: rows.map((r) => ({
        id: r.capId,
        type: 'agentProvider',
        enabled: true,
        source: 'cat-cafe',
        pluginId: r.pluginId,
        agentProvider: r.descriptor,
      })),
    };
  }

  it('refreshes health when TTL expired and executor passes; routeable stays true', async () => {
    const expiredRow = makeRow({
      overrides: { descriptor: { health: { passed: true, checkedAt: 1000, ttlMs: 1000, descriptorHash: undefined } } },
    });
    // Bind health hash to descriptor hash (test data hygiene)
    expiredRow.descriptor.health.descriptorHash = expiredRow.descriptor.descriptorHash;
    const capabilities = makeCapabilities([expiredRow]);
    let persisted;
    const result = await refreshExpiredHealthInPlace({
      capabilities,
      rows: [expiredRow],
      now: () => 1_000_000, // way past TTL
      healthExecutor: async (ctx) => ({
        passed: true,
        checkedAt: ctx.now ? ctx.now() : Date.now(),
        ttlMs: 60_000,
        descriptorHash: ctx.descriptorHash,
      }),
      getHealthExecutorContext: () => ({
        providerTransportRegistry: { has: () => true },
        now: () => 1_000_000,
      }),
      persist: async (next) => {
        persisted = next;
      },
    });
    assert.ok(result, 'mutated snapshot returned');
    assert.ok(persisted, 'persist called');
    const after = persisted.capabilities[0].agentProvider;
    assert.equal(after.routeable, true, 'still routeable after successful refresh');
    assert.equal(after.health.checkedAt, 1_000_000, 'health.checkedAt updated to refresh time');
  });

  it('degrades routeable=false + records lastSyncError when executor fails', async () => {
    const expiredRow = makeRow({
      overrides: { descriptor: { health: { passed: true, checkedAt: 1000, ttlMs: 1000, descriptorHash: undefined } } },
    });
    expiredRow.descriptor.health.descriptorHash = expiredRow.descriptor.descriptorHash;
    const capabilities = makeCapabilities([expiredRow]);
    let persisted;
    await refreshExpiredHealthInPlace({
      capabilities,
      rows: [expiredRow],
      now: () => 1_000_000,
      healthExecutor: async (ctx) => ({
        passed: false,
        checkedAt: 1_000_000,
        ttlMs: 60_000,
        descriptorHash: ctx.descriptorHash,
        failureReason: 'simulated-runtime-failure',
      }),
      getHealthExecutorContext: () => ({
        providerTransportRegistry: { has: () => true },
        now: () => 1_000_000,
      }),
      persist: async (next) => {
        persisted = next;
      },
    });
    const after = persisted.capabilities[0].agentProvider;
    assert.equal(after.routeable, false, 'routeable degraded on refresh failure');
    assert.equal(after.routeableApproved, true, 'approval intent preserved');
    assert.ok(after.lastSyncError);
    assert.match(after.lastSyncError.message, /ttl-refresh-failed: simulated-runtime-failure/);
  });

  it('does NOT refresh when TTL is still fresh (no-op, no persist)', async () => {
    const freshRow = makeRow();
    const capabilities = makeCapabilities([freshRow]);
    let persistCalled = false;
    const result = await refreshExpiredHealthInPlace({
      capabilities,
      rows: [freshRow],
      now: () => 5_000, // well within TTL (checkedAt=1000, ttl=60_000)
      healthExecutor: async () => {
        throw new Error('executor must not run when TTL is fresh');
      },
      getHealthExecutorContext: () => ({
        providerTransportRegistry: { has: () => true },
      }),
      persist: async () => {
        persistCalled = true;
      },
    });
    assert.equal(result, null, 'no mutation when nothing expired');
    assert.equal(persistCalled, false, 'persist not called');
  });

  it('P1.4 — CatRegistry.registerOrReplace + unregister supports plugin projection sync', () => {
    const registry = new CatRegistry();
    const baseConfig = { id: 'a', mentionPatterns: ['a'] };
    registry.register('a', baseConfig);
    assert.equal(registry.has('a'), true);

    // registerOrReplace doesn't throw on existing id (unlike register)
    const updatedConfig = { id: 'a', mentionPatterns: ['a', 'A'] };
    registry.registerOrReplace('a', updatedConfig);
    assert.deepEqual(registry.tryGet('a').config.mentionPatterns, ['a', 'A']);

    // unregister returns true when present, false when not
    assert.equal(registry.unregister('a'), true);
    assert.equal(registry.has('a'), false);
    assert.equal(registry.unregister('a'), false);
  });

  it('P1.4 follow-up — stale-cleanup must NOT unregister a real catalog cat that took over the id (ownership marker check)', () => {
    // Reproduces codex's review concern: between sync calls, a real catalog
    // cat was registered with the same id as a previously-projected synthetic.
    // The stale cleanup MUST NOT delete it — the ownership marker
    // (`pluginProjection` field) distinguishes synthetic from real.
    const registry = new CatRegistry();

    // 1. First sync: plugin projected 'clowder-cat' as a synthetic config.
    const syntheticConfig = {
      id: 'clowder-cat',
      mentionPatterns: ['clowder'],
      pluginProjection: { pluginId: 'clowder-code', capId: 'clowder-code' },
    };
    registry.register('clowder-cat', syntheticConfig);
    const pluginProjectedCatIds = new Set(['clowder-cat']);

    // 2. Between syncs: operator created a real catalog cat with the SAME id.
    //    The catalog write path called registerOrReplace, overwriting the
    //    synthetic with a non-plugin-marked config.
    const realCatalogConfig = {
      id: 'clowder-cat',
      mentionPatterns: ['clowder-cat'],
      // NOTE: NO pluginProjection field — this is a catalog-sourced cat.
    };
    registry.registerOrReplace('clowder-cat', realCatalogConfig);

    // 3. Second sync: plugin admission denied (or projection skipped); new
    //    set is empty. Apply the production stale-cleanup contract.
    const newlyProjectedCatIds = new Set();
    for (const staleId of pluginProjectedCatIds) {
      if (newlyProjectedCatIds.has(staleId)) continue;
      const current = registry.tryGet(staleId)?.config;
      const isStillPluginOwned = current && current.pluginProjection !== undefined;
      if (isStillPluginOwned) {
        registry.unregister(staleId);
      }
    }

    // Assertion: the real catalog cat survives the stale cleanup.
    const after = registry.tryGet('clowder-cat');
    assert.ok(after, 'real catalog cat must NOT be deleted by stale-projection cleanup');
    assert.equal(after.config.pluginProjection, undefined, 'real catalog cat is identified by missing marker');
    assert.deepEqual(after.config.mentionPatterns, ['clowder-cat']);
  });

  it('P1.4 follow-up #2 (codex twice-around) — snapshot skips configs carrying pluginProjection so re-sync does not self-collide', () => {
    // Reproduces the codex-found regression: on the SECOND sync, activeCatConfigs
    // (sourced from catRegistry.getAllConfigs()) contains the synthetic config
    // we projected last sync. If the snapshot builder counts it as an
    // "active non-providerTransport cat", the projection's admission re-run
    // denies the candidate (active-cat-collision), and stale-cleanup
    // unregisters the still-valid synthetic.
    const syntheticConfig = {
      id: 'clowder-cat',
      mentionPatterns: ['clowder'],
      pluginProjection: { pluginId: 'clowder-code', capId: 'clowder-code', descriptorHash: 'hash-1' },
    };
    const realCat = {
      id: 'opus',
      mentionPatterns: ['opus', 'opus47'],
      // no pluginProjection marker
    };
    const snapshot = buildAgentProviderAdmissionSnapshot({
      capabilitiesConfig: { version: 1, capabilities: [] },
      activeCatConfigs: {
        'clowder-cat': syntheticConfig,
        opus: realCat,
      },
      templateBaselineIds: new Set(),
      hasProviderTransportConfig: () => false,
      candidatePluginId: 'clowder-code',
      candidateCapId: 'clowder-code',
    });
    // The synthetic plugin-projected catId must NOT appear in the snapshot's
    // active-cat set (it is the projection's own output, not a separate cat).
    assert.equal(
      snapshot.activeNonProviderTransportIdentities.has('clowder-cat'),
      false,
      'plugin-projected synthetic must not self-collide on next sync',
    );
    assert.equal(
      snapshot.activeNonProviderTransportIdentities.has('clowder'),
      false,
      'plugin-projected synthetic mentionPatterns must not self-collide either',
    );
    // Real catalog cat is still represented.
    assert.equal(snapshot.activeNonProviderTransportIdentities.has('opus'), true);
    assert.equal(snapshot.activeNonProviderTransportIdentities.has('opus47'), true);
  });

  it('P1.4 follow-up — stale-cleanup still removes a truly stale synthetic projection (positive control)', () => {
    // Positive control: when the registered entry is still plugin-owned (the
    // synthetic config the projection wrote), stale cleanup removes it.
    const registry = new CatRegistry();
    const syntheticConfig = {
      id: 'old-plugin-cat',
      mentionPatterns: ['old'],
      pluginProjection: { pluginId: 'old-plugin', capId: 'old-cap' },
    };
    registry.register('old-plugin-cat', syntheticConfig);
    const pluginProjectedCatIds = new Set(['old-plugin-cat']);
    const newlyProjectedCatIds = new Set(); // plugin disabled / approval reset

    for (const staleId of pluginProjectedCatIds) {
      if (newlyProjectedCatIds.has(staleId)) continue;
      const current = registry.tryGet(staleId)?.config;
      const isStillPluginOwned = current && current.pluginProjection !== undefined;
      if (isStillPluginOwned) {
        registry.unregister(staleId);
      }
    }

    assert.equal(registry.has('old-plugin-cat'), false, 'stale synthetic must be removed');
  });

  it('does NOT refresh when health.descriptorHash mismatches current descriptorHash', async () => {
    const row = makeRow({
      overrides: {
        descriptor: {
          descriptorHash: 'hash-NEW',
          health: { passed: true, checkedAt: 1000, ttlMs: 1000, descriptorHash: 'hash-OLD' },
        },
      },
    });
    const capabilities = makeCapabilities([row]);
    let persistCalled = false;
    const result = await refreshExpiredHealthInPlace({
      capabilities,
      rows: [row],
      now: () => 1_000_000,
      healthExecutor: async () => {
        throw new Error('executor must not run on descriptor-hash mismatch');
      },
      getHealthExecutorContext: () => ({
        providerTransportRegistry: { has: () => true },
      }),
      persist: async () => {
        persistCalled = true;
      },
    });
    assert.equal(result, null, 'skipped when hash mismatched');
    assert.equal(persistCalled, false);
  });
});
