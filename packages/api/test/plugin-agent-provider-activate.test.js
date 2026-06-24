/**
 * F241 Phase B Slice 2a: agentProvider manifest activation stays non-routeable.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { PluginResourceActivator } = await import('../dist/domains/plugin/PluginResourceActivator.js');

function makeAgentProviderResource(overrides = {}) {
  const { agentProvider: agentProviderOverrides, ...topLevelOverrides } = overrides;
  return {
    type: 'agentProvider',
    name: 'clowder-code',
    ...topLevelOverrides,
    agentProvider: {
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
      ...agentProviderOverrides,
    },
  };
}

function makeManifest(resource = makeAgentProviderResource()) {
  return {
    id: 'clowder-code',
    name: 'Clowder Code',
    version: '1.0.0',
    builtin: false,
    config: [],
    resources: [resource],
  };
}

function makeCapabilitiesStore() {
  let state = null;
  return {
    read: async () => state,
    write: async (next) => {
      state = structuredClone(next);
    },
    get: () => state,
  };
}

function makeActivator({ providerTransportRegistry = { has: (transportId) => transportId === 'cli-jsonl' } } = {}) {
  const capStore = makeCapabilitiesStore();
  const activator = new PluginResourceActivator({
    resolveProjectRoot: () => '/tmp/project',
    pluginsDir: '/tmp/project/plugins',
    limbRegistry: { register: async () => {}, deregister: () => {} },
    readCapabilities: capStore.read,
    writeCapabilities: capStore.write,
    withCapabilityLock: async (fn) => fn(),
    providerTransportRegistry,
  });
  return { activator, capStore };
}

describe('PluginResourceActivator - agentProvider resources', () => {
  it('activates agentProvider as transportReady but not routeable', async () => {
    const { activator, capStore } = makeActivator();

    const result = await activator.enablePlugin(makeManifest());

    assert.equal(result.status, 'success');
    assert.equal(result.resources[0].ok, true);

    const entry = capStore.get()?.capabilities[0];
    assert.ok(entry);
    assert.equal(entry.type, 'agentProvider');
    assert.equal(entry.enabled, true);
    assert.equal(entry.pluginId, 'clowder-code');
    assert.equal(entry.agentProvider.state, 'transportReady');
    assert.equal(entry.agentProvider.routeable, false);
    assert.equal(entry.agentProvider.routeableApproved, false);
    assert.equal(entry.agentProvider.name, 'clowder-code');
    assert.equal(entry.agentProvider.transport, 'cli-jsonl');
    assert.deepEqual(entry.agentProvider.mcpWhitelistRequest, ['cat-cafe-collab']);
  });

  it('rejects agentProvider activation when host transport is not registered', async () => {
    const { activator, capStore } = makeActivator({ providerTransportRegistry: { has: () => false } });

    const result = await activator.enablePlugin(makeManifest());

    assert.equal(result.status, 'failed');
    assert.equal(result.resources[0].ok, false);
    assert.match(result.resources[0].error ?? '', /Unknown agentProvider transport/);
    assert.equal(capStore.get(), null);
  });
});

// ─── F241 Phase B Slice 2b: descriptor hash + activator integration ───────

describe('PluginResourceActivator - agentProvider descriptor hash (Slice 2b)', () => {
  it('writes a stable descriptorHash on first activation', async () => {
    const { activator, capStore } = makeActivator();
    await activator.enablePlugin(makeManifest());
    const entry = capStore.get()?.capabilities[0];
    assert.ok(entry?.agentProvider?.descriptorHash, 'descriptorHash should be present after activation');
    assert.match(entry.agentProvider.descriptorHash, /^[0-9a-f]{64}$/);
  });

  it('preserves host-owned routeableApproved/health/lastSyncError when re-activated with identical descriptor', async () => {
    const { activator, capStore } = makeActivator();
    // First activation lays the row down.
    await activator.enablePlugin(makeManifest());

    // Simulate downstream flow: operator approved, health passed, AgentRegistry synced.
    // Directly mutate the persisted snapshot to seed host-owned state — this mirrors
    // what Step 4 (approval admin surface) and Step 6 (sync coordinator) will do.
    const current = capStore.get();
    const seeded = structuredClone(current);
    seeded.capabilities[0].agentProvider.routeableApproved = true;
    seeded.capabilities[0].agentProvider.routeable = true;
    seeded.capabilities[0].agentProvider.state = 'healthy';
    seeded.capabilities[0].agentProvider.health = {
      passed: true,
      checkedAt: 1000,
      ttlMs: 60000,
      descriptorHash: current.capabilities[0].agentProvider.descriptorHash,
    };
    seeded.capabilities[0].agentProvider.lastSyncError = undefined;
    await capStore.write(seeded);

    // Re-activate with identical manifest — must NOT clobber the host-owned state.
    await activator.enablePlugin(makeManifest());

    const entry = capStore.get()?.capabilities[0];
    assert.equal(entry.agentProvider.routeableApproved, true, 'approval should be preserved');
    assert.equal(entry.agentProvider.routeable, true, 'routeable should be preserved');
    assert.equal(entry.agentProvider.state, 'healthy', 'lifecycle state should be preserved');
    assert.ok(entry.agentProvider.health, 'health result should be preserved');
    assert.equal(entry.agentProvider.health.passed, true);
  });

  it('resets routeableApproved + invalidates health when descriptor changes', async () => {
    const { activator, capStore } = makeActivator();
    await activator.enablePlugin(makeManifest());

    // Seed approval + health as above.
    const current = capStore.get();
    const seeded = structuredClone(current);
    seeded.capabilities[0].agentProvider.routeableApproved = true;
    seeded.capabilities[0].agentProvider.routeable = true;
    seeded.capabilities[0].agentProvider.state = 'healthy';
    seeded.capabilities[0].agentProvider.health = {
      passed: true,
      checkedAt: 1000,
      ttlMs: 60000,
      descriptorHash: current.capabilities[0].agentProvider.descriptorHash,
    };
    await capStore.write(seeded);

    // Re-activate with a CHANGED descriptor (different command).
    const mutated = makeAgentProviderResource({
      agentProvider: { command: '/usr/local/bin/clowder-code-next' },
    });
    await activator.enablePlugin(makeManifest(mutated));

    const entry = capStore.get()?.capabilities[0];
    assert.equal(entry.agentProvider.routeableApproved, false, 'approval must be reset on descriptor delta');
    assert.equal(entry.agentProvider.routeable, false, 'routeable must be reset on descriptor delta');
    assert.equal(entry.agentProvider.state, 'transportReady', 'state must drop back to transportReady');
    assert.equal(entry.agentProvider.health, undefined, 'health must be invalidated on descriptor delta');
    assert.equal(entry.agentProvider.lastSyncError, undefined, 'lastSyncError must be cleared on descriptor delta');
    assert.notEqual(
      entry.agentProvider.descriptorHash,
      current.capabilities[0].agentProvider.descriptorHash,
      'descriptorHash must be updated to the new value',
    );
  });

  it('migrates a 2a-shipped row (no descriptorHash) by filling in the hash on next activation', async () => {
    const { activator, capStore } = makeActivator();
    // First activation produces the canonical row layout.
    await activator.enablePlugin(makeManifest());

    // Simulate a 2a-shipped row by stripping descriptorHash from the persisted state.
    // Real 2a never wrote this field; on upgrade to 2b the first re-activation should
    // fill it in (mismatch with undefined → reset branch). approval/health stay at the
    // 2a defaults (false / undefined) so resetting is a no-op semantically.
    const seeded = structuredClone(capStore.get());
    seeded.capabilities[0].agentProvider.descriptorHash = undefined;
    await capStore.write(seeded);

    await activator.enablePlugin(makeManifest());

    const entry = capStore.get()?.capabilities[0];
    assert.ok(entry.agentProvider.descriptorHash, 'descriptorHash should be filled in after re-activation');
    assert.match(entry.agentProvider.descriptorHash, /^[0-9a-f]{64}$/);
    assert.equal(entry.agentProvider.routeableApproved, false);
    assert.equal(entry.agentProvider.routeable, false);
    assert.equal(entry.agentProvider.state, 'transportReady');
  });
});
