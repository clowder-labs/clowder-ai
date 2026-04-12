import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

const originalDefaultOwnerUserId = process.env.DEFAULT_OWNER_USER_ID;

afterEach(() => {
  if (originalDefaultOwnerUserId == null) {
    delete process.env.DEFAULT_OWNER_USER_ID;
  } else {
    process.env.DEFAULT_OWNER_USER_ID = originalDefaultOwnerUserId;
  }
});

describe('request identity resolution', () => {
  it('maps frontend default-user to DEFAULT_OWNER_USER_ID when configured', async () => {
    process.env.DEFAULT_OWNER_USER_ID = 'owner-123';
    const { resolveEffectiveUserId } = await import('../dist/utils/request-identity.js');
    assert.equal(resolveEffectiveUserId('default-user'), 'owner-123');
  });

  it('keeps explicit non-default user ids unchanged', async () => {
    process.env.DEFAULT_OWNER_USER_ID = 'owner-123';
    const { resolveEffectiveUserId } = await import('../dist/utils/request-identity.js');
    assert.equal(resolveEffectiveUserId('alice'), 'alice');
  });

  it('falls back to default-user when no owner override is configured', async () => {
    delete process.env.DEFAULT_OWNER_USER_ID;
    const { resolveEffectiveUserId } = await import('../dist/utils/request-identity.js');
    assert.equal(resolveEffectiveUserId('default-user'), 'default-user');
  });
});
