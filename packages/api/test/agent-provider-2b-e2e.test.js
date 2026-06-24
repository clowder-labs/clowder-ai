/**
 * F241 Phase B Slice 2b: End-to-end integration test.
 *
 * Wires the full pipeline:
 *   activator → approval service → projection → synthetic CatConfig
 *
 * Proves the 7 invariants the slice commits to:
 *   1. Activator writes descriptorHash on first activation.
 *   2. Activator preserves host-owned state on identical re-activation.
 *   3. Activator resets approval/health on descriptor delta.
 *   4. Approval orchestration promotes routeable=true with binding persisted.
 *   5. Projection skips capabilities whose health/admission no longer holds.
 *   6. Projection produces a synthetic CatConfig keyed by the operator's catId.
 *   7. Re-activation after approval with the SAME descriptor preserves approval
 *      (so a no-op restart doesn't drop a live routeable plugin).
 */

import './helpers/setup-cat-registry.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { PluginResourceActivator } = await import('../dist/domains/plugin/PluginResourceActivator.js');
const { AgentProviderApprovalService } = await import('../dist/domains/plugin/agent-provider-approval-service.js');
const { listApprovedRouteableRows, projectRouteableAgentProviders } = await import(
  '../dist/domains/plugin/agent-provider-projection.js'
);

function makeManifest(overrides = {}) {
  const { agentProvider: agentProviderOverrides, ...rest } = overrides;
  return {
    id: 'clowder-code',
    name: 'Clowder Code',
    version: '1.0.0',
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
          resumeArgs: ['resume', '{sessionId}'],
          sessionPolicy: 'resume',
          outputProfile: 'clowder-code-turn-result-v1',
          mcpWhitelistRequest: ['cat-cafe-collab'],
          sandboxRequest: 'workspace-write',
          healthCheck: { type: 'cliProbe' },
          ...agentProviderOverrides,
        },
      },
    ],
    ...rest,
  };
}

function makeStore() {
  let state = null;
  return {
    read: async () => (state ? structuredClone(state) : null),
    write: async (next) => {
      state = structuredClone(next);
    },
    get: () => state,
  };
}

function makePipeline() {
  const capStore = makeStore();
  const providerTransportRegistry = { has: (id) => id === 'cli-jsonl' || id === 'acp' };
  const activator = new PluginResourceActivator({
    resolveProjectRoot: () => '/tmp/project',
    pluginsDir: '/tmp/project/plugins',
    limbRegistry: { register: async () => {}, deregister: () => {} },
    readCapabilities: capStore.read,
    writeCapabilities: capStore.write,
    withCapabilityLock: async (fn) => fn(),
    providerTransportRegistry,
  });
  const buildSnapshotFn = (_pluginId, _capId, _config) => ({
    templateBaselineIds: new Set(['anthropic', 'openai', 'google', 'kimi']),
    existingRouteableIdentities: new Set(),
    activeNonProviderTransportIdentities: new Set(['opus', 'codex']),
  });
  const approvalService = new AgentProviderApprovalService({
    readCapabilities: capStore.read,
    writeCapabilities: capStore.write,
    withCapabilityLock: async (fn) => fn(),
    buildAdmissionSnapshot: async (pluginId, capId, config) => buildSnapshotFn(pluginId, capId, config),
    getHealthExecutorContext: () => ({
      providerTransportRegistry,
      now: () => 1_700_000_000_000,
    }),
  });
  return { capStore, activator, approvalService, buildSnapshotFn };
}

describe('F241 Phase B Slice 2b — end-to-end pipeline', () => {
  it('full happy path: activate → approve → project produces a synthetic CatConfig keyed by binding.catId', async () => {
    const { capStore, activator, approvalService, buildSnapshotFn } = makePipeline();

    // 1. Activate the plugin — writes descriptorHash, routeable=false, approved=false.
    const activateResult = await activator.enablePlugin(makeManifest());
    assert.equal(activateResult.status, 'success');
    const activatedRow = capStore.get().capabilities[0];
    const activatedDescriptor = activatedRow.agentProvider;
    const writtenCapId = activatedRow.id; // resourceCapId — opaque, use the actual value
    assert.ok(activatedDescriptor.descriptorHash);
    assert.equal(activatedDescriptor.routeable, false);
    assert.equal(activatedDescriptor.routeableApproved, false);

    // 2. Operator approves the routeable promotion with a binding.
    const approveResult = await approvalService.approveRouteable({
      pluginId: 'clowder-code',
      capId: writtenCapId,
      catId: 'clowder-cat',
      mentionPatterns: ['clowder'],
    });
    assert.equal(approveResult.ok, true);
    const approvedDescriptor = capStore.get().capabilities[0].agentProvider;
    assert.equal(approvedDescriptor.routeable, true);
    assert.equal(approvedDescriptor.routeableApproved, true);
    assert.equal(approvedDescriptor.routeableBinding.catId, 'clowder-cat');
    assert.equal(approvedDescriptor.health.passed, true);
    assert.equal(approvedDescriptor.health.descriptorHash, approvedDescriptor.descriptorHash);

    // 3. Projection turns the row into a synthetic CatConfig.
    const rows = listApprovedRouteableRows(capStore.get());
    assert.equal(rows.length, 1);
    const projection = projectRouteableAgentProviders({
      rows,
      buildSnapshot: (pluginId, capId) => buildSnapshotFn(pluginId, capId, capStore.get()),
      now: () => 1_700_000_000_000 + 5_000, // 5s after approval; well within TTL
    });
    assert.equal(projection.admitted.length, 1);
    assert.equal(projection.skipped.length, 0);
    const synth = projection.configs['clowder-cat'];
    assert.ok(synth, 'projection should produce a synthetic CatConfig keyed by binding.catId');
    assert.equal(synth.id, 'clowder-cat');
    assert.equal(synth.providerTransport.transport, 'cli-jsonl');
    assert.equal(synth.providerTransport.command, 'clowder-code');
    assert.equal(synth.pluginProjection.pluginId, 'clowder-code');
    assert.equal(synth.pluginProjection.descriptorHash, approvedDescriptor.descriptorHash);
  });

  it('descriptor delta after approval: activator resets approval + invalidates health, projection skips', async () => {
    const { capStore, activator, approvalService, buildSnapshotFn } = makePipeline();

    // 1. Activate + approve as usual.
    await activator.enablePlugin(makeManifest());
    const writtenCapId = capStore.get().capabilities[0].id;
    const approveResult = await approvalService.approveRouteable({
      pluginId: 'clowder-code',
      capId: writtenCapId,
      catId: 'clowder-cat',
    });
    assert.equal(approveResult.ok, true, 'baseline approval should succeed');
    const approvedHash = capStore.get().capabilities[0].agentProvider.descriptorHash;

    // 2. Manifest mutates (e.g. command changed). Re-activate.
    await activator.enablePlugin(makeManifest({ agentProvider: { command: '/usr/local/bin/clowder-code-NEXT' } }));
    const afterMutation = capStore.get().capabilities[0].agentProvider;
    assert.notEqual(afterMutation.descriptorHash, approvedHash, 'descriptorHash must change');
    assert.equal(afterMutation.routeableApproved, false, 'approval must be reset');
    assert.equal(afterMutation.routeable, false, 'routeable must be reset');
    assert.equal(afterMutation.health, undefined, 'health must be invalidated');

    // 3. Projection sees a non-routeable row → nothing to project.
    const rows = listApprovedRouteableRows(capStore.get());
    assert.equal(rows.length, 0, 'projection list filter drops the row');
    const projection = projectRouteableAgentProviders({
      rows,
      buildSnapshot: (pluginId, capId) => buildSnapshotFn(pluginId, capId, capStore.get()),
      now: () => 1_700_000_000_000,
    });
    assert.equal(projection.admitted.length, 0);
    assert.deepEqual(projection.configs, {});
  });

  it('re-activation with identical descriptor preserves an already-approved routeable row', async () => {
    const { capStore, activator, approvalService } = makePipeline();

    // 1. Activate + approve.
    await activator.enablePlugin(makeManifest());
    const writtenCapId = capStore.get().capabilities[0].id;
    await approvalService.approveRouteable({
      pluginId: 'clowder-code',
      capId: writtenCapId,
      catId: 'clowder-cat',
    });
    const approvedDescriptor = capStore.get().capabilities[0].agentProvider;

    // 2. Restart-equivalent: re-activate with the EXACT same manifest.
    await activator.enablePlugin(makeManifest());
    const afterReactivation = capStore.get().capabilities[0].agentProvider;

    // Approval / health / routeable preserved (no requirement to re-approve).
    assert.equal(afterReactivation.routeable, true);
    assert.equal(afterReactivation.routeableApproved, true);
    assert.equal(afterReactivation.state, 'healthy');
    assert.equal(afterReactivation.descriptorHash, approvedDescriptor.descriptorHash);
    assert.equal(afterReactivation.health.passed, true);
    assert.equal(afterReactivation.routeableBinding.catId, 'clowder-cat');
  });

  it('approval is rejected when operator picks a catId that collides with a reserved baseline', async () => {
    const { capStore, activator, approvalService } = makePipeline();

    await activator.enablePlugin(makeManifest());
    const writtenCapId = capStore.get().capabilities[0].id;
    const result = await approvalService.approveRouteable({
      pluginId: 'clowder-code',
      capId: writtenCapId,
      catId: 'anthropic', // baseline collision
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'reserved-baseline-collision');
  });

  it('approval rolls back routeable + records lastSyncError if the post-approval sync hook throws', async () => {
    const { capStore, activator } = makePipeline();
    const approvalService = new AgentProviderApprovalService({
      readCapabilities: capStore.read,
      writeCapabilities: capStore.write,
      withCapabilityLock: async (fn) => fn(),
      buildAdmissionSnapshot: async () => ({
        templateBaselineIds: new Set(),
        existingRouteableIdentities: new Set(),
        activeNonProviderTransportIdentities: new Set(),
      }),
      getHealthExecutorContext: () => ({
        providerTransportRegistry: { has: () => true },
        now: () => 1_700_000_000_000,
      }),
      onRouteablePromoted: async () => {
        throw new Error('agent registry sync failed');
      },
    });

    await activator.enablePlugin(makeManifest());
    const writtenCapId = capStore.get().capabilities[0].id;
    const result = await approvalService.approveRouteable({
      pluginId: 'clowder-code',
      capId: writtenCapId,
      catId: 'clowder-cat',
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'post-approval-sync-failed');

    // Routeable rolled back; approval intent + health preserved (retry doesn't need re-approval).
    const after = capStore.get().capabilities[0].agentProvider;
    assert.equal(after.routeable, false);
    assert.equal(after.routeableApproved, true);
    assert.ok(after.health);
    assert.equal(after.health.passed, true);
    assert.ok(after.lastSyncError);
    assert.match(after.lastSyncError.message, /agent registry sync failed/);
  });
});
