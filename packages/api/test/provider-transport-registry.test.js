/**
 * F241 Phase A: host-owned provider transport registry.
 */

import './helpers/setup-cat-registry.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { ProviderTransportRegistry, markActiveProviderTransportProfile } = await import(
  '../dist/domains/cats/services/agents/providers/transport/ProviderTransportRegistry.js'
);

function makeService() {
  return {
    async *invoke() {
      yield { type: 'done', catId: 'test-cat', timestamp: Date.now() };
    },
  };
}

function makeInput(profileId = 'test-cat') {
  return {
    projectRoot: '/tmp/project',
    profileId,
    config: { id: profileId, clientId: 'acp' },
  };
}

describe('ProviderTransportRegistry', () => {
  it('rejects duplicate transport factory ids', () => {
    const registry = new ProviderTransportRegistry();
    const factory = { id: 'acp', create: async () => ({ handled: false }) };
    registry.register(factory);
    assert.throws(() => registry.register(factory), /already registered/);
  });

  it('falls through when no registered transport handles the config', async () => {
    const registry = new ProviderTransportRegistry();
    registry.register({ id: 'acp', create: async () => ({ handled: false }) });

    const result = await registry.createServiceForConfig(makeInput());

    assert.deepEqual(result, { handled: false });
  });

  it('returns a handled transport service before caller provider switch fallback', async () => {
    const registry = new ProviderTransportRegistry();
    const service = makeService();
    registry.register({ id: 'acp', create: async () => ({ handled: true, service }) });

    const result = await registry.createServiceForConfig(makeInput());

    assert.equal(result.handled, true);
    assert.equal(result.transportId, 'acp');
    assert.equal(result.service, service);
  });

  it('keeps handled null terminal so invalid declared transports cannot fall back to clientId switch', async () => {
    const registry = new ProviderTransportRegistry();
    registry.register({ id: 'acp', create: async () => ({ handled: true, service: null }) });

    const result = await registry.createServiceForConfig(makeInput());

    assert.equal(result.handled, true);
    assert.equal(result.transportId, 'acp');
    assert.equal(result.service, null);
  });

  it('passes active profile ids to each transport closeStale hook', async () => {
    const registry = new ProviderTransportRegistry();
    const seen = [];
    registry.register({
      id: 'acp',
      create: async () => ({ handled: false }),
      closeStale: async (activeProfileIds, options) => {
        seen.push({ activeProfileIds: [...activeProfileIds], reason: options?.reason });
      },
    });
    const active = new Map();
    markActiveProviderTransportProfile(active, 'acp', 'cat-a');
    markActiveProviderTransportProfile(active, 'acp', 'cat-b');

    await registry.closeStale(active, { reason: 'config-sync' });

    assert.deepEqual(seen, [{ activeProfileIds: ['cat-a', 'cat-b'], reason: 'config-sync' }]);
  });
});
