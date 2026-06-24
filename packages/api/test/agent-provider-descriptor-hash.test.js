/**
 * F241 Phase B Slice 2b: Descriptor hash determinism + sensitivity tests.
 *
 * The hash is the trigger for resetting host-owned approval state, so two
 * properties matter equally:
 *   - DETERMINISTIC: same descriptor input → same hash (across runs, across
 *     equivalent restructurings).
 *   - SENSITIVE: any material change → different hash (so approval is reset).
 */

import './helpers/setup-cat-registry.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { computeAgentProviderDescriptorHash } = await import('../dist/domains/plugin/agent-provider-descriptor-hash.js');

function makeInputs(overrides = {}) {
  const { resource: resourceOverrides, ...topLevelOverrides } = overrides;
  return {
    pluginId: 'clowder-code',
    capId: 'clowder-code',
    ...topLevelOverrides,
    resource: {
      name: 'clowder-code',
      transport: 'cli-jsonl',
      command: 'clowder-code',
      startupArgs: ['--json', '--non-interactive'],
      resumeArgs: ['resume', '{sessionId}', '--json'],
      sessionPolicy: 'resume',
      outputProfile: 'clowder-code-turn-result-v1',
      timeoutMs: 60000,
      mcpWhitelistRequest: ['cat-cafe-collab', 'cat-cafe-memory'],
      sandboxRequest: 'workspace-write',
      healthCheck: { type: 'cliProbe' },
      ...resourceOverrides,
    },
  };
}

describe('computeAgentProviderDescriptorHash — determinism', () => {
  it('returns the same hash for identical inputs', () => {
    const a = computeAgentProviderDescriptorHash(makeInputs());
    const b = computeAgentProviderDescriptorHash(makeInputs());
    assert.equal(a, b);
  });

  it('returns the same hash regardless of mcpWhitelistRequest insertion order', () => {
    const a = computeAgentProviderDescriptorHash(
      makeInputs({ resource: { mcpWhitelistRequest: ['cat-cafe-collab', 'cat-cafe-memory'] } }),
    );
    const b = computeAgentProviderDescriptorHash(
      makeInputs({ resource: { mcpWhitelistRequest: ['cat-cafe-memory', 'cat-cafe-collab'] } }),
    );
    assert.equal(a, b);
  });

  it('produces a 64-character hex sha256 digest', () => {
    const h = computeAgentProviderDescriptorHash(makeInputs());
    assert.match(h, /^[0-9a-f]{64}$/);
  });
});

describe('computeAgentProviderDescriptorHash — sensitivity (every input matters)', () => {
  const baseline = computeAgentProviderDescriptorHash(makeInputs());

  const mutations = [
    ['pluginId', { pluginId: 'other-plugin' }],
    ['capId', { capId: 'other-cap' }],
    ['transport', { resource: { transport: 'acp' } }],
    ['command', { resource: { command: 'other-bin' } }],
    ['startupArgs (positional)', { resource: { startupArgs: ['--non-interactive', '--json'] } }],
    ['resumeArgs (positional)', { resource: { resumeArgs: ['{sessionId}', 'resume', '--json'] } }],
    ['sessionPolicy', { resource: { sessionPolicy: 'stateless' } }],
    ['outputProfile', { resource: { outputProfile: undefined } }],
    ['timeoutMs', { resource: { timeoutMs: 30000 } }],
    ['mcpWhitelistRequest (membership)', { resource: { mcpWhitelistRequest: ['cat-cafe-collab'] } }],
    ['sandboxRequest', { resource: { sandboxRequest: 'workspace-read' } }],
    ['healthCheck type', { resource: { healthCheck: { type: 'acpInitialize' } } }],
    ['pluginFingerprint added', { pluginFingerprint: 'sha256:abc' }],
  ];

  for (const [label, override] of mutations) {
    it(`differs when ${label} changes`, () => {
      const mutated = computeAgentProviderDescriptorHash(makeInputs(override));
      assert.notEqual(mutated, baseline, `Hash should change when ${label} mutates`);
    });
  }

  it('distinguishes absent optional field from explicit null in canonical form', () => {
    // If sessionPolicy is undefined vs explicit 'resume', hash MUST differ.
    const withPolicy = computeAgentProviderDescriptorHash(makeInputs({ resource: { sessionPolicy: 'resume' } }));
    const noPolicy = computeAgentProviderDescriptorHash(makeInputs({ resource: { sessionPolicy: undefined } }));
    assert.notEqual(withPolicy, noPolicy);
  });
});
