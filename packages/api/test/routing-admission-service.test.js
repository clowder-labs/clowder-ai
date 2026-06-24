/**
 * F241 Phase B Slice 2b: Routing admission service unit tests.
 *
 * Covers each denial branch + happy path, and the structural invariant
 * that callers MUST exclude the candidate from the snapshot (the function
 * has no way to enforce this, so the test documents it explicitly).
 */

import './helpers/setup-cat-registry.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { admitForRouting } = await import('../dist/domains/plugin/RoutingAdmissionService.js');

function makeCandidate(overrides = {}) {
  return {
    pluginId: 'clowder-code',
    capId: 'clowder-code-provider',
    providerId: 'clowder-code',
    catId: 'clowder-cat',
    profileId: 'clowder-profile',
    mentionPatterns: ['clowder'],
    healthCheck: { type: 'cliProbe' },
    ...overrides,
  };
}

function makeSnapshot(overrides = {}) {
  return {
    templateBaselineIds: new Set(['anthropic', 'openai', 'google', 'kimi']),
    existingRouteableIdentities: new Set(),
    activeNonProviderTransportIdentities: new Set(),
    ...overrides,
  };
}

describe('RoutingAdmissionService — admitForRouting', () => {
  describe('happy path', () => {
    it('admits a candidate whose identities do not collide with any snapshot entry', () => {
      const result = admitForRouting(makeCandidate(), makeSnapshot());
      assert.deepEqual(result, { admitted: true });
    });

    it('admits when mentionPatterns is undefined', () => {
      const result = admitForRouting(makeCandidate({ mentionPatterns: undefined }), makeSnapshot());
      assert.deepEqual(result, { admitted: true });
    });

    it('admits when mentionPatterns contains only the same string as providerId (deduped)', () => {
      const result = admitForRouting(makeCandidate({ mentionPatterns: ['clowder-code'] }), makeSnapshot());
      assert.deepEqual(result, { admitted: true });
    });
  });

  describe('Step 5 admission precondition — health check declaration required', () => {
    it('denies when healthCheck is undefined', () => {
      const result = admitForRouting(makeCandidate({ healthCheck: undefined }), makeSnapshot());
      assert.equal(result.admitted, false);
      assert.equal(result.reason, 'missing-health-check');
      assert.match(result.details, /requires a declared healthCheck/);
    });

    it('denies missing healthCheck BEFORE checking identity collisions', () => {
      // Even if the identity would collide with reserved, we report the
      // healthCheck failure first (cheaper / more-fundamental check).
      const result = admitForRouting(
        makeCandidate({ healthCheck: undefined, providerId: 'anthropic' }),
        makeSnapshot(),
      );
      assert.equal(result.reason, 'missing-health-check');
    });
  });

  describe('identity claim validity', () => {
    it('denies when all identity fields are empty', () => {
      const result = admitForRouting(
        makeCandidate({
          providerId: '',
          catId: '',
          profileId: undefined,
          mentionPatterns: [],
        }),
        makeSnapshot(),
      );
      assert.equal(result.admitted, false);
      assert.equal(result.reason, 'invalid-identity-claim');
    });

    it('treats whitespace-only identity strings as absent', () => {
      const result = admitForRouting(
        makeCandidate({
          providerId: '   ',
          catId: '',
          profileId: undefined,
          mentionPatterns: ['  '],
        }),
        makeSnapshot(),
      );
      assert.equal(result.admitted, false);
      assert.equal(result.reason, 'invalid-identity-claim');
    });
  });

  describe('reserved-baseline collision', () => {
    it('denies when providerId collides with the cat-template baseline', () => {
      const result = admitForRouting(makeCandidate({ providerId: 'anthropic' }), makeSnapshot());
      assert.equal(result.reason, 'reserved-baseline-collision');
      assert.equal(result.conflictingIdentity, 'anthropic');
    });

    it('denies when catId collides with the cat-template baseline', () => {
      const result = admitForRouting(makeCandidate({ providerId: 'clowder-code', catId: 'openai' }), makeSnapshot());
      assert.equal(result.reason, 'reserved-baseline-collision');
      assert.equal(result.conflictingIdentity, 'openai');
    });

    it('denies when mentionPatterns collides with the cat-template baseline', () => {
      const result = admitForRouting(makeCandidate({ mentionPatterns: ['kimi'] }), makeSnapshot());
      assert.equal(result.reason, 'reserved-baseline-collision');
      assert.equal(result.conflictingIdentity, 'kimi');
    });
  });

  describe('existing-routeable collision', () => {
    it('denies when providerId collides with an existing routeable identity', () => {
      const result = admitForRouting(
        makeCandidate(),
        makeSnapshot({
          existingRouteableIdentities: new Set(['clowder-code']),
        }),
      );
      assert.equal(result.reason, 'existing-routeable-collision');
      assert.equal(result.conflictingIdentity, 'clowder-code');
    });

    it('denies when mentionPatterns collides with an existing routeable identity', () => {
      const result = admitForRouting(
        makeCandidate({ mentionPatterns: ['plugin-a', 'plugin-b'] }),
        makeSnapshot({
          existingRouteableIdentities: new Set(['plugin-b']),
        }),
      );
      assert.equal(result.reason, 'existing-routeable-collision');
      assert.equal(result.conflictingIdentity, 'plugin-b');
    });
  });

  describe('active-cat collision', () => {
    it('denies when catId collides with an active non-providerTransport cat', () => {
      const result = admitForRouting(
        makeCandidate({ catId: 'opus' }),
        makeSnapshot({
          activeNonProviderTransportIdentities: new Set(['opus', 'codex']),
        }),
      );
      assert.equal(result.reason, 'active-cat-collision');
      assert.equal(result.conflictingIdentity, 'opus');
    });

    it('denies when profileId collides with an active cat', () => {
      const result = admitForRouting(
        makeCandidate({ profileId: 'sonnet' }),
        makeSnapshot({
          activeNonProviderTransportIdentities: new Set(['sonnet']),
        }),
      );
      assert.equal(result.reason, 'active-cat-collision');
      assert.equal(result.conflictingIdentity, 'sonnet');
    });
  });

  describe('check order — fail-closed by most fundamental denial', () => {
    it('reports reserved-baseline collision before existing-routeable collision', () => {
      const result = admitForRouting(
        makeCandidate({ providerId: 'anthropic' }),
        makeSnapshot({
          existingRouteableIdentities: new Set(['anthropic']),
        }),
      );
      assert.equal(result.reason, 'reserved-baseline-collision');
    });

    it('reports existing-routeable collision before active-cat collision', () => {
      const result = admitForRouting(
        makeCandidate({ providerId: 'mock-existing-routeable-id' }),
        makeSnapshot({
          existingRouteableIdentities: new Set(['mock-existing-routeable-id']),
          activeNonProviderTransportIdentities: new Set(['mock-existing-routeable-id']),
        }),
      );
      assert.equal(result.reason, 'existing-routeable-collision');
    });
  });

  describe('snapshot exclusion invariant (documented contract)', () => {
    it('denies its own identity if the caller forgets to exclude the candidate from existingRouteableIdentities — caller bug, but admission still fail-closes', () => {
      // This documents the red line: if the caller builds the snapshot WITHOUT
      // excluding the candidate, admission will reject the candidate against
      // its own identity. That is the desired fail-closed behavior — better
      // a false denial than a parsing-order self-exemption.
      const candidate = makeCandidate();
      const result = admitForRouting(
        candidate,
        makeSnapshot({
          existingRouteableIdentities: new Set([candidate.providerId]),
        }),
      );
      assert.equal(result.admitted, false);
      assert.equal(result.reason, 'existing-routeable-collision');
    });
  });
});
