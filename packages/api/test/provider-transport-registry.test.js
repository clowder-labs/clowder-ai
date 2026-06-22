/**
 * F241 Phase A: host-owned provider transport registry.
 */

import './helpers/setup-cat-registry.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { ProviderTransportRegistry, deriveReservedProviderTransportIdentities, markActiveProviderTransportProfile } =
  await import('../dist/domains/cats/services/agents/providers/transport/ProviderTransportRegistry.js');

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
    config: { id: profileId, clientId: 'clowder-code' },
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

  it('keeps an explicit unknown transport terminal instead of falling back', async () => {
    const registry = new ProviderTransportRegistry();

    const result = await registry.createServiceForConfig({
      ...makeInput(),
      providerTransport: { transport: 'missing-transport' },
    });

    assert.equal(result.handled, true);
    assert.equal(result.transportId, 'missing-transport');
    assert.equal(result.service, null);
  });

  it('keeps a malformed explicit transport terminal instead of falling back', async () => {
    const registry = new ProviderTransportRegistry();

    const result = await registry.createServiceForConfig({
      ...makeInput(),
      providerTransport: { command: 'clowder-code' },
    });

    assert.equal(result.handled, true);
    assert.equal(result.transportId, 'invalid');
    assert.equal(result.service, null);
  });

  it('rejects explicit providerTransport declarations on builtin client identities', async () => {
    const registry = new ProviderTransportRegistry();
    registry.register({ id: 'cli-jsonl', create: async () => ({ handled: true, service: makeService() }) });

    const result = await registry.createServiceForConfig({
      ...makeInput('custom-external'),
      config: { id: 'custom-external', clientId: 'openai' },
      providerTransport: { transport: 'cli-jsonl', command: 'clowder-code' },
    });

    assert.equal(result.handled, true);
    assert.equal(result.transportId, 'cli-jsonl');
    assert.equal(result.service, null);
    assert.equal(result.rejectionReason, 'builtin-client:openai');
  });

  it('rejects explicit providerTransport declarations that claim routeable builtin cat ids', async () => {
    const registry = new ProviderTransportRegistry();
    registry.register({ id: 'cli-jsonl', create: async () => ({ handled: true, service: makeService() }) });

    const result = await registry.createServiceForConfig({
      ...makeInput('codex'),
      providerTransport: { transport: 'cli-jsonl', command: 'clowder-code' },
      reservedRouteableIds: new Set(['codex']),
    });

    assert.equal(result.handled, true);
    assert.equal(result.transportId, 'cli-jsonl');
    assert.equal(result.service, null);
    assert.equal(result.rejectionReason, 'builtin-cat:codex');
  });

  it('derives reserved routeable identities from template baseline plus active non-transport cats', () => {
    const reserved = deriveReservedProviderTransportIdentities({
      configs: {
        'template-builtin': { id: 'template-builtin', clientId: 'clowder-code' },
        'legacy-cat': { id: 'legacy-cat', clientId: 'anthropic' },
        'external-provider': { id: 'external-provider', clientId: 'clowder-code' },
      },
      providerTransportsByProfileId: new Map([
        ['template-builtin', { transport: 'cli-jsonl' }],
        ['external-provider', { transport: 'cli-jsonl' }],
      ]),
      templateBuiltinIds: new Set(['template-builtin']),
    });

    assert.equal(reserved.has('template-builtin'), true, 'template builtin stays reserved even after PT injection');
    assert.equal(reserved.has('legacy-cat'), true, 'active non-PT legacy cats stay reserved');
    assert.equal(reserved.has('external-provider'), false, 'new external PT profiles remain activatable');
  });

  it('rejects self-hijack when a template builtin gains providerTransport and non-builtin clientId', async () => {
    const registry = new ProviderTransportRegistry();
    registry.register({ id: 'cli-jsonl', create: async () => ({ handled: true, service: makeService() }) });

    const result = await registry.createServiceForConfig({
      ...makeInput('future-builtin'),
      config: { id: 'future-builtin', clientId: 'clowder-code' },
      providerTransport: { transport: 'cli-jsonl', command: 'clowder-code' },
      reservedRouteableIds: new Set(['future-builtin']),
    });

    assert.equal(result.handled, true);
    assert.equal(result.transportId, 'cli-jsonl');
    assert.equal(result.service, null);
    assert.equal(result.rejectionReason, 'builtin-cat:future-builtin');
  });

  it('rejects explicit providerTransport declarations when reserved identity baseline is unavailable', async () => {
    const registry = new ProviderTransportRegistry();
    registry.register({ id: 'cli-jsonl', create: async () => ({ handled: true, service: makeService() }) });

    const result = await registry.createServiceForConfig({
      ...makeInput('external-provider'),
      providerTransport: { transport: 'cli-jsonl', command: 'clowder-code' },
      reservedRouteableIdentityError: 'template-baseline-unavailable',
    });

    assert.equal(result.handled, true);
    assert.equal(result.transportId, 'cli-jsonl');
    assert.equal(result.service, null);
    assert.equal(result.rejectionReason, 'reserved-routeable-identities-unavailable');
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
