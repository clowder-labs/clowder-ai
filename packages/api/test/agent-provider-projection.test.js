/**
 * F241 Phase B Slice 2b Step 5b: routeable agentProvider projection tests.
 *
 * Covers list filter + projection gates: health freshness, descriptor-hash
 * binding, TTL expiry, missing binding, and the red-line admission re-run.
 */

import './helpers/setup-cat-registry.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { listApprovedRouteableRows, projectRouteableAgentProviders } = await import(
  '../dist/domains/plugin/agent-provider-projection.js'
);

function makeRow({ pluginId = 'clowder-code', capId = 'clowder-code', overrides = {} } = {}) {
  const baseDescriptor = {
    name: 'clowder-code',
    transport: 'cli-jsonl',
    command: 'clowder-code',
    startupArgs: ['--json'],
    resumeArgs: ['resume', '{sessionId}'],
    sessionPolicy: 'resume',
    outputProfile: 'clowder-code-turn-result-v1',
    healthCheck: { type: 'cliProbe' },
    state: 'healthy',
    routeable: true,
    routeableApproved: true,
    descriptorHash: 'hash-1',
    health: {
      passed: true,
      checkedAt: 1000,
      ttlMs: 60_000,
      descriptorHash: 'hash-1',
    },
    routeableBinding: {
      catId: 'clowder-cat',
      mentionPatterns: ['clowder'],
    },
    ...overrides.descriptor,
  };
  return {
    pluginId,
    capId,
    descriptor: baseDescriptor,
  };
}

function makeCapabilitiesConfig(rows) {
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

function admittingSnapshot() {
  return {
    templateBaselineIds: new Set(['anthropic', 'openai']),
    existingRouteableIdentities: new Set(),
    activeNonProviderTransportIdentities: new Set(),
  };
}

describe('listApprovedRouteableRows', () => {
  it('returns rows where routeable=true + approved + binding present', () => {
    const config = makeCapabilitiesConfig([makeRow()]);
    const rows = listApprovedRouteableRows(config);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].pluginId, 'clowder-code');
  });

  it('skips rows that are routeable=false', () => {
    const config = makeCapabilitiesConfig([makeRow({ overrides: { descriptor: { routeable: false } } })]);
    assert.equal(listApprovedRouteableRows(config).length, 0);
  });

  it('skips rows missing routeableBinding (cannot project without a catId)', () => {
    const config = makeCapabilitiesConfig([makeRow({ overrides: { descriptor: { routeableBinding: undefined } } })]);
    assert.equal(listApprovedRouteableRows(config).length, 0);
  });
});

describe('projectRouteableAgentProviders', () => {
  it('happy path: projects a healthy, admitted row into a synthetic CatConfig', () => {
    const rows = [makeRow()];
    const result = projectRouteableAgentProviders({
      rows,
      buildSnapshot: () => admittingSnapshot(),
      now: () => 30_000,
    });
    assert.equal(result.admitted.length, 1);
    assert.equal(result.skipped.length, 0);
    const synth = result.configs['clowder-cat'];
    assert.ok(synth, 'synthetic config should be keyed by binding.catId');
    assert.equal(synth.id, 'clowder-cat');
    assert.equal(synth.providerTransport.transport, 'cli-jsonl');
    assert.equal(synth.providerTransport.command, 'clowder-code');
    assert.deepEqual(synth.providerTransport.startupArgs, ['--json']);
    assert.equal(synth.pluginProjection.pluginId, 'clowder-code');
  });

  it('defaults synthetic routeable identity fields for provider configs', () => {
    const rows = [
      makeRow({
        overrides: {
          descriptor: {
            routeableBinding: {
              catId: 'clowder-cat',
            },
          },
        },
      }),
    ];
    const result = projectRouteableAgentProviders({
      rows,
      buildSnapshot: () => admittingSnapshot(),
      now: () => 30_000,
    });

    const synth = result.configs['clowder-cat'];
    assert.ok(synth, 'synthetic config should be projected');
    assert.deepEqual(synth.mentionPatterns, ['@clowder-cat']);
    assert.deepEqual(synth.color, { primary: '#334155', secondary: '#cbd5e1' });
  });

  it('skips when health is missing', () => {
    const rows = [makeRow({ overrides: { descriptor: { health: undefined } } })];
    const result = projectRouteableAgentProviders({
      rows,
      buildSnapshot: () => admittingSnapshot(),
      now: () => 30_000,
    });
    assert.equal(result.admitted.length, 0);
    assert.equal(result.skipped[0].reason, 'health-not-fresh-or-failed');
  });

  it('skips when health.passed=false', () => {
    const rows = [
      makeRow({
        overrides: {
          descriptor: {
            health: { passed: false, checkedAt: 1000, ttlMs: 60_000, descriptorHash: 'hash-1' },
          },
        },
      }),
    ];
    const result = projectRouteableAgentProviders({
      rows,
      buildSnapshot: () => admittingSnapshot(),
      now: () => 30_000,
    });
    assert.equal(result.admitted.length, 0);
    assert.equal(result.skipped[0].reason, 'health-not-fresh-or-failed');
  });

  it('skips when health.descriptorHash mismatches current descriptorHash', () => {
    const rows = [
      makeRow({
        overrides: {
          descriptor: {
            descriptorHash: 'hash-NEW',
            health: { passed: true, checkedAt: 1000, ttlMs: 60_000, descriptorHash: 'hash-OLD' },
          },
        },
      }),
    ];
    const result = projectRouteableAgentProviders({
      rows,
      buildSnapshot: () => admittingSnapshot(),
      now: () => 30_000,
    });
    assert.equal(result.admitted.length, 0);
    assert.equal(result.skipped[0].reason, 'health-descriptor-mismatch');
  });

  it('skips when TTL expired', () => {
    const rows = [makeRow()];
    const result = projectRouteableAgentProviders({
      rows,
      buildSnapshot: () => admittingSnapshot(),
      now: () => 999_999, // way past checkedAt(1000) + ttlMs(60_000)
    });
    assert.equal(result.admitted.length, 0);
    assert.equal(result.skipped[0].reason, 'health-ttl-expired');
  });

  it('RED LINE: skips when admission re-run denies (e.g. binding catId now collides with template baseline)', () => {
    const rows = [makeRow({ overrides: { descriptor: { routeableBinding: { catId: 'anthropic' } } } })];
    const result = projectRouteableAgentProviders({
      rows,
      buildSnapshot: () => admittingSnapshot(), // templateBaselineIds includes 'anthropic'
      now: () => 30_000,
    });
    assert.equal(result.admitted.length, 0);
    assert.match(result.skipped[0].reason, /admission-rerun-denied:reserved-baseline-collision/);
  });

  it('calls onSkip with the skip reason for telemetry', () => {
    const seen = [];
    const rows = [makeRow({ overrides: { descriptor: { health: undefined } } })];
    projectRouteableAgentProviders({
      rows,
      buildSnapshot: () => admittingSnapshot(),
      now: () => 30_000,
      onSkip: (pluginId, capId, reason) => seen.push({ pluginId, capId, reason }),
    });
    assert.equal(seen.length, 1);
    assert.equal(seen[0].reason, 'health-not-fresh-or-failed');
  });
});
