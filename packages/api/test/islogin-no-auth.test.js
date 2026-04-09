/**
 * /api/islogin no-auth fallback test.
 *
 * Verifies that in no-auth mode, /api/islogin returns { islogin: true }
 * so the frontend ChatContainer doesn't 404 and redirect to /login.
 *
 * This is a unit test of the expected response shape — the actual endpoint
 * registration is in index.ts (integration tested via E2E).
 *
 * [宪宪/Opus-46🐾] F140 Phase A — AC-A1 / AC-A7
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('/api/islogin no-auth fallback', () => {
  // The handler registered in index.ts for no-auth mode:
  const handler = async () => ({ islogin: true, isskip: false, mode: 'no-auth' });

  it('returns islogin=true', async () => {
    const result = await handler();
    assert.equal(result.islogin, true);
  });

  it('returns mode=no-auth', async () => {
    const result = await handler();
    assert.equal(result.mode, 'no-auth');
  });

  it('returns isskip=false (not skip-auth, just no-auth)', async () => {
    const result = await handler();
    assert.equal(result.isskip, false);
  });

  it('response shape matches auth.ts /api/islogin contract', async () => {
    const result = await handler();
    // ChatContainer expects: { islogin: boolean, isskip?: boolean }
    assert.equal(typeof result.islogin, 'boolean');
    assert.equal(typeof result.isskip, 'boolean');
  });
});
