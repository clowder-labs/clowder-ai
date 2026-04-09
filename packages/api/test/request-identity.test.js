/**
 * request-identity.ts unit tests — C2 cut point verification.
 *
 * Ensures query.userId is NOT accepted as an identity source (security: C2).
 *
 * [宪宪/Opus-46🐾] F140 Phase A — C2 Security Cut
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveUserId, resolveHeaderUserId } from '../dist/utils/request-identity.js';

function fakeRequest(headers = {}, query = {}) {
  return { headers, query };
}

describe('resolveHeaderUserId', () => {
  it('reads X-Cat-Cafe-User header', () => {
    assert.equal(resolveHeaderUserId(fakeRequest({ 'x-cat-cafe-user': 'alice' })), 'alice');
  });

  it('returns null when header is absent', () => {
    assert.equal(resolveHeaderUserId(fakeRequest()), null);
  });

  it('returns null for empty/whitespace header', () => {
    assert.equal(resolveHeaderUserId(fakeRequest({ 'x-cat-cafe-user': '  ' })), null);
  });
});

describe('resolveUserId', () => {
  it('resolves from X-Cat-Cafe-User header', () => {
    assert.equal(resolveUserId(fakeRequest({ 'x-cat-cafe-user': 'alice' })), 'alice');
  });

  it('does NOT resolve from query.userId — C2 security cut', () => {
    // query.userId was a legacy path that allowed caller-controlled identity injection.
    // After C2 cut, this must return null (not 'attacker').
    const result = resolveUserId(fakeRequest({}, { userId: 'attacker' }));
    assert.equal(result, null, 'query.userId must not be accepted as identity source');
  });

  it('does NOT accept fallbackUserId — body identity injection blocked (P1)', () => {
    // After P1 fix, resolveUserId must NOT have a fallbackUserId path.
    // Caller-controlled identity (body userId) is the same class of injection as query.userId (C2).
    const result = resolveUserId(fakeRequest(), { fallbackUserId: 'from-body' });
    assert.equal(result, null, 'body userId via fallbackUserId must not be accepted as identity source');
  });

  it('falls back to options.defaultUserId', () => {
    assert.equal(resolveUserId(fakeRequest(), { defaultUserId: 'default-user' }), 'default-user');
  });

  it('returns null when no identity source available', () => {
    assert.equal(resolveUserId(fakeRequest()), null);
  });

  it('header takes priority over fallback', () => {
    assert.equal(
      resolveUserId(fakeRequest({ 'x-cat-cafe-user': 'header-user' }), { defaultUserId: 'default' }),
      'header-user',
    );
  });
});
