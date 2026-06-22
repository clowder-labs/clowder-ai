/**
 * F241 Phase B Slice 2a: agentProvider manifest activation stays non-routeable.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { PluginResourceActivator } = await import('../dist/domains/plugin/PluginResourceActivator.js');

function makeAgentProviderResource(overrides = {}) {
  return {
    type: 'agentProvider',
    name: 'clowder-code',
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
      ...overrides.agentProvider,
    },
    ...overrides,
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
