/**
 * F241 Phase A: CLI JSONL provider transport factory.
 */

import './helpers/setup-cat-registry.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { createCliJsonlProviderTransportFactory } = await import(
  '../dist/domains/cats/services/agents/providers/cli-jsonl/CliJsonlProviderTransportFactory.js'
);

function makeInput(providerTransport) {
  return {
    projectRoot: '/tmp/project',
    profileId: 'clowder-code',
    providerTransport,
    config: {
      id: 'clowder-code',
      defaultModel: 'reference-runtime',
    },
  };
}

describe('CliJsonlProviderTransportFactory', () => {
  it('creates a service from a valid cli-jsonl declaration', async () => {
    const factory = createCliJsonlProviderTransportFactory({ log: { warn: () => {} } });

    const result = await factory.create(
      makeInput({
        transport: 'cli-jsonl',
        command: 'clowder-code',
        startupArgs: ['--json', '--non-interactive'],
        outputProfile: 'clowder-code-turn-result-v1',
      }),
    );

    assert.equal(result.handled, true);
    assert.ok(result.service);
  });

  it('defaults startupArgs for the clowder-code turn_result profile', async () => {
    const factory = createCliJsonlProviderTransportFactory({ log: { warn: () => {} } });

    const result = await factory.create(makeInput({ transport: 'cli-jsonl', command: 'clowder-code' }));

    assert.equal(result.handled, true);
    assert.ok(result.service);
  });

  it('returns handled null for invalid cli-jsonl declarations', async () => {
    const warnings = [];
    const factory = createCliJsonlProviderTransportFactory({
      log: { warn: (payload, message) => warnings.push({ payload, message }) },
    });

    const result = await factory.create(makeInput({ transport: 'cli-jsonl', startupArgs: ['--json'] }));

    assert.equal(result.handled, true);
    assert.equal(result.service, null);
    assert.equal(warnings.length, 1);
  });
});
