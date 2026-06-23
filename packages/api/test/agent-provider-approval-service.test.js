/**
 * F241 Phase B Slice 2b: Approval orchestration service tests.
 *
 * Covers the full Step 4 flow: locate row → admission → blocking health →
 * atomic write (or fail-closed denial). Uses synthetic capability rows that
 * already carry the Slice 2b descriptorHash, so we don't depend on the
 * activator to seed them (those are covered by the activator tests).
 */

import './helpers/setup-cat-registry.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { AgentProviderApprovalService } = await import('../dist/domains/plugin/agent-provider-approval-service.js');
const { computeAgentProviderDescriptorHash } = await import('../dist/domains/plugin/agent-provider-descriptor-hash.js');

function makeResource(overrides = {}) {
  return {
    name: 'clowder-code',
    transport: 'cli-jsonl',
    command: 'clowder-code',
    startupArgs: ['--json', '--non-interactive'],
    resumeArgs: ['resume', '{sessionId}', '--json'],
    sessionPolicy: 'resume',
    outputProfile: 'clowder-code-turn-result-v1',
    mcpWhitelistRequest: ['cat-cafe-collab'],
    sandboxRequest: 'workspace-write',
    healthCheck: { type: 'cliProbe' },
    ...overrides,
  };
}

function makeCapabilityRow({ pluginId = 'clowder-code', capId = 'clowder-code', resourceOverrides = {} } = {}) {
  const resource = makeResource(resourceOverrides);
  const descriptorHash = computeAgentProviderDescriptorHash({ pluginId, capId, resource });
  return {
    id: capId,
    type: 'agentProvider',
    enabled: true,
    source: 'cat-cafe',
    pluginId,
    agentProvider: {
      ...resource,
      state: 'transportReady',
      routeable: false,
      routeableApproved: false,
      descriptorHash,
    },
  };
}

function makeStore(initial = { version: 1, capabilities: [] }) {
  let state = structuredClone(initial);
  return {
    read: async () => structuredClone(state),
    write: async (next) => {
      state = structuredClone(next);
    },
    get: () => state,
  };
}

function makeService({
  capabilities = [makeCapabilityRow()],
  hasTransport = (id) => id === 'cli-jsonl' || id === 'acp',
  buildSnapshot = () => ({
    templateBaselineIds: new Set(['anthropic', 'openai', 'google', 'kimi']),
    existingRouteableIdentities: new Set(),
    activeNonProviderTransportIdentities: new Set(),
  }),
  healthExecutor,
  now = () => 1_700_000_000_000,
  onRouteablePromoted,
} = {}) {
  const store = makeStore({ version: 1, capabilities });
  const service = new AgentProviderApprovalService({
    readCapabilities: store.read,
    writeCapabilities: store.write,
    withCapabilityLock: async (fn) => fn(),
    buildAdmissionSnapshot: async (_pluginId, _capId, _config) => buildSnapshot(),
    healthExecutor,
    getHealthExecutorContext: () => ({
      providerTransportRegistry: { has: hasTransport },
      now,
    }),
    onRouteablePromoted,
  });
  return { service, store };
}

describe('AgentProviderApprovalService.approveRouteable', () => {
  describe('happy path', () => {
    it('promotes capability to routeable=true with fresh health on admission + health pass', async () => {
      const { service, store } = makeService();
      const result = await service.approveRouteable({
        pluginId: 'clowder-code',
        capId: 'clowder-code',
        catId: 'clowder-cat',
        profileId: 'clowder-profile',
        mentionPatterns: ['clowder'],
      });
      assert.equal(result.ok, true);
      assert.equal(result.capability.routeable, true);
      assert.equal(result.capability.routeableApproved, true);
      assert.equal(result.capability.state, 'healthy');
      assert.ok(result.capability.health);
      assert.equal(result.capability.health.passed, true);
      assert.equal(result.capability.health.descriptorHash, result.capability.descriptorHash);

      // Persisted state matches the returned capability
      const persisted = store.get().capabilities[0].agentProvider;
      assert.equal(persisted.routeable, true);
      assert.equal(persisted.routeableApproved, true);
      assert.equal(persisted.state, 'healthy');
    });
  });

  describe('not-found / wrong-type / missing-hash denials', () => {
    it('denies when capability does not exist', async () => {
      const { service } = makeService({ capabilities: [] });
      const result = await service.approveRouteable({
        pluginId: 'clowder-code',
        capId: 'clowder-code',
        catId: 'clowder-cat',
      });
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'capability-not-found');
    });

    it('denies when capability is not an agentProvider', async () => {
      const nonAgent = {
        id: 'clowder-code',
        type: 'mcp',
        enabled: true,
        source: 'cat-cafe',
        pluginId: 'clowder-code',
      };
      const { service } = makeService({ capabilities: [nonAgent] });
      const result = await service.approveRouteable({
        pluginId: 'clowder-code',
        capId: 'clowder-code',
        catId: 'clowder-cat',
      });
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'capability-not-agent-provider');
    });

    it('denies when descriptorHash is missing (pre-2b row)', async () => {
      const row = makeCapabilityRow();
      row.agentProvider.descriptorHash = undefined;
      const { service } = makeService({ capabilities: [row] });
      const result = await service.approveRouteable({
        pluginId: 'clowder-code',
        capId: 'clowder-code',
        catId: 'clowder-cat',
      });
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'descriptor-hash-missing');
    });
  });

  describe('admission denials', () => {
    it('propagates reserved-baseline collision from admission service', async () => {
      const { service, store } = makeService();
      const result = await service.approveRouteable({
        pluginId: 'clowder-code',
        capId: 'clowder-code',
        catId: 'anthropic', // collides with template baseline
      });
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'reserved-baseline-collision');
      assert.equal(result.conflictingIdentity, 'anthropic');

      // Persisted state unchanged
      const persisted = store.get().capabilities[0].agentProvider;
      assert.equal(persisted.routeable, false);
      assert.equal(persisted.routeableApproved, false);
    });

    it('propagates active-cat collision', async () => {
      const { service } = makeService({
        buildSnapshot: () => ({
          templateBaselineIds: new Set(),
          existingRouteableIdentities: new Set(),
          activeNonProviderTransportIdentities: new Set(['opus']),
        }),
      });
      const result = await service.approveRouteable({
        pluginId: 'clowder-code',
        capId: 'clowder-code',
        catId: 'opus',
      });
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'active-cat-collision');
      assert.equal(result.conflictingIdentity, 'opus');
    });
  });

  describe('health failures', () => {
    it('does NOT promote when health check fails; persists failed telemetry', async () => {
      // Force health failure by returning a failing executor result.
      const failingExecutor = async (ctx) => ({
        passed: false,
        checkedAt: 1_700_000_000_000,
        ttlMs: 60_000,
        descriptorHash: ctx.descriptorHash,
        failureReason: 'forced-test-failure',
      });
      const { service, store } = makeService({ healthExecutor: failingExecutor });

      const result = await service.approveRouteable({
        pluginId: 'clowder-code',
        capId: 'clowder-code',
        catId: 'clowder-cat',
      });

      assert.equal(result.ok, false);
      assert.equal(result.reason, 'health-check-failed');
      assert.equal(result.health.passed, false);
      assert.equal(result.health.failureReason, 'forced-test-failure');

      // Persisted: failed health written for telemetry; approval still false; routeable still false.
      const persisted = store.get().capabilities[0].agentProvider;
      assert.equal(persisted.routeableApproved, false);
      assert.equal(persisted.routeable, false);
      assert.ok(persisted.health);
      assert.equal(persisted.health.passed, false);
      assert.equal(persisted.health.failureReason, 'forced-test-failure');
    });

    it('default transport-availability probe fails when host transport is not registered', async () => {
      const { service, store } = makeService({
        hasTransport: () => false, // no transports registered
      });
      const result = await service.approveRouteable({
        pluginId: 'clowder-code',
        capId: 'clowder-code',
        catId: 'clowder-cat',
      });
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'health-check-failed');
      assert.match(result.details, /transport-not-registered/);
      const persisted = store.get().capabilities[0].agentProvider;
      assert.equal(persisted.routeable, false);
    });
  });

  describe('snapshot exclusion', () => {
    it('admission service receives a snapshot WITHOUT the candidate itself, so self-collision is impossible', async () => {
      // Build snapshot that intentionally includes the candidate's own providerId.
      // The orchestration service relies on the snapshot builder to exclude;
      // we simulate that contract by NOT including 'clowder-code' here.
      const { service } = makeService({
        buildSnapshot: () => ({
          templateBaselineIds: new Set(),
          existingRouteableIdentities: new Set([
            'some-other-routeable-plugin', // sibling, not the candidate
          ]),
          activeNonProviderTransportIdentities: new Set(),
        }),
      });
      const result = await service.approveRouteable({
        pluginId: 'clowder-code',
        capId: 'clowder-code',
        catId: 'clowder-cat',
      });
      assert.equal(result.ok, true);
    });
  });

  // F241 Phase B Slice 2b Step 5a — post-approval sync hook contract.
  describe('post-approval sync hook (onRouteablePromoted)', () => {
    it('fires onRouteablePromoted with the promoted descriptor on successful approval', async () => {
      const seen = [];
      const { service } = makeService({
        onRouteablePromoted: async (capability) => {
          seen.push(capability);
        },
      });
      const result = await service.approveRouteable({
        pluginId: 'clowder-code',
        capId: 'clowder-code',
        catId: 'clowder-cat',
      });
      assert.equal(result.ok, true);
      assert.equal(seen.length, 1, 'hook should fire exactly once');
      assert.equal(seen[0].routeable, true);
      assert.equal(seen[0].routeableApproved, true);
      assert.equal(seen[0].state, 'healthy');
    });

    it('does NOT fire onRouteablePromoted when admission fails', async () => {
      const seen = [];
      const { service } = makeService({
        onRouteablePromoted: async (capability) => {
          seen.push(capability);
        },
      });
      const result = await service.approveRouteable({
        pluginId: 'clowder-code',
        capId: 'clowder-code',
        catId: 'anthropic', // reserved-baseline collision
      });
      assert.equal(result.ok, false);
      assert.equal(seen.length, 0, 'hook must not fire on admission denial');
    });

    it('does NOT fire onRouteablePromoted when health fails', async () => {
      const seen = [];
      const failingExecutor = async (ctx) => ({
        passed: false,
        checkedAt: 1,
        ttlMs: 60_000,
        descriptorHash: ctx.descriptorHash,
        failureReason: 'test-induced',
      });
      const { service } = makeService({
        healthExecutor: failingExecutor,
        onRouteablePromoted: async (capability) => {
          seen.push(capability);
        },
      });
      const result = await service.approveRouteable({
        pluginId: 'clowder-code',
        capId: 'clowder-code',
        catId: 'clowder-cat',
      });
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'health-check-failed');
      assert.equal(seen.length, 0, 'hook must not fire on health failure');
    });

    it('rolls back effective routeable + records lastSyncError when the hook throws; preserves approval intent', async () => {
      const { service, store } = makeService({
        onRouteablePromoted: async () => {
          throw new Error('sync coordinator unavailable');
        },
      });
      const result = await service.approveRouteable({
        pluginId: 'clowder-code',
        capId: 'clowder-code',
        catId: 'clowder-cat',
      });
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'post-approval-sync-failed');
      assert.match(result.details, /sync coordinator unavailable/);

      const persisted = store.get().capabilities[0].agentProvider;
      // Routeable rolled back, approval intent + health preserved.
      assert.equal(persisted.routeable, false);
      assert.equal(persisted.routeableApproved, true);
      assert.ok(persisted.health);
      assert.equal(persisted.health.passed, true);
      assert.ok(persisted.lastSyncError);
      assert.match(persisted.lastSyncError.message, /sync coordinator unavailable/);
    });
  });
});
