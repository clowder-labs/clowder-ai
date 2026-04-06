import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it, beforeEach } from 'node:test';
import { IdentityResolver } from '../dist/identity/identity-resolver.js';

// ─── Helpers ─────────────────────────────────────────

/** Create a minimal Fastify-like request with headers */
function fakeRequest(headers = {}) {
  return { headers };
}

// ─── no-auth mode ────────────────────────────────────

describe('IdentityResolver no-auth', () => {
  it('returns default-user when no config overrides', async () => {
    const resolver = new IdentityResolver({ mode: 'no-auth' });
    const result = await resolver.resolve(fakeRequest());
    assert.equal(result.ok, true);
    assert.equal(result.identity.userId, 'default-user');
    assert.equal(result.identity.mode, 'no-auth');
    assert.equal(result.identity.source, 'default');
  });

  it('returns custom default user when configured', async () => {
    const resolver = new IdentityResolver({ mode: 'no-auth', defaultUserId: 'alice' });
    const result = await resolver.resolve(fakeRequest());
    assert.equal(result.ok, true);
    assert.equal(result.identity.userId, 'alice');
  });
});

// ─── trusted-header mode ─────────────────────────────

describe('IdentityResolver trusted-header', () => {
  it('resolves userId from default header', async () => {
    const resolver = new IdentityResolver({ mode: 'trusted-header' });
    const result = await resolver.resolve(fakeRequest({ 'x-cat-cafe-user': 'bob' }));
    assert.equal(result.ok, true);
    assert.equal(result.identity.userId, 'bob');
    assert.equal(result.identity.source, 'trusted-header');
  });

  it('resolves userId from custom header', async () => {
    const resolver = new IdentityResolver({
      mode: 'trusted-header',
      trustedHeader: { userHeader: 'x-my-user' },
    });
    const result = await resolver.resolve(fakeRequest({ 'x-my-user': 'carol' }));
    assert.equal(result.ok, true);
    assert.equal(result.identity.userId, 'carol');
  });

  it('rejects missing user header', async () => {
    const resolver = new IdentityResolver({ mode: 'trusted-header' });
    const result = await resolver.resolve(fakeRequest({}));
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'MISSING_IDENTITY');
    assert.equal(result.error.statusCode, 401);
  });

  it('rejects blank user header', async () => {
    const resolver = new IdentityResolver({ mode: 'trusted-header' });
    const result = await resolver.resolve(fakeRequest({ 'x-cat-cafe-user': '   ' }));
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'MISSING_IDENTITY');
  });
});

// ─── trusted-header with HMAC signing ────────────────

describe('IdentityResolver signed headers', () => {
  const SECRET = 'test-secret-key-12345';
  const SECRET_ENV = 'TEST_HEADER_SECRET';

  function makeSignedHeaders(userId, overrides = {}) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = 'test-nonce-' + Math.random().toString(36).slice(2);
    const signature = createHmac('sha256', SECRET)
      .update(`${userId}.${timestamp}.${nonce}`)
      .digest('hex');

    return {
      'x-cat-cafe-user': userId,
      'x-cat-cafe-timestamp': timestamp,
      'x-cat-cafe-nonce': nonce,
      'x-cat-cafe-signature': signature,
      ...overrides,
    };
  }

  let resolver;

  beforeEach(() => {
    process.env[SECRET_ENV] = SECRET;
    resolver = new IdentityResolver({
      mode: 'trusted-header',
      trustedHeader: {
        requireSignedHeaders: true,
        sharedSecretEnv: SECRET_ENV,
      },
    });
  });

  it('accepts valid signed request', async () => {
    const headers = makeSignedHeaders('dave');
    const result = await resolver.resolve(fakeRequest(headers));
    assert.equal(result.ok, true);
    assert.equal(result.identity.userId, 'dave');
  });

  it('rejects tampered signature', async () => {
    const headers = makeSignedHeaders('dave');
    headers['x-cat-cafe-signature'] = 'a'.repeat(64);
    const result = await resolver.resolve(fakeRequest(headers));
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'INVALID_SIGNATURE');
  });

  it('rejects expired timestamp', async () => {
    const oldTimestamp = String(Math.floor(Date.now() / 1000) - 120); // 2 min ago
    const nonce = 'nonce-1';
    const signature = createHmac('sha256', SECRET)
      .update(`eve.${oldTimestamp}.${nonce}`)
      .digest('hex');

    const result = await resolver.resolve(fakeRequest({
      'x-cat-cafe-user': 'eve',
      'x-cat-cafe-timestamp': oldTimestamp,
      'x-cat-cafe-nonce': nonce,
      'x-cat-cafe-signature': signature,
    }));
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'INVALID_SIGNATURE');
    assert.ok(result.error.message.includes('Timestamp'));
  });

  it('rejects missing signature headers', async () => {
    const result = await resolver.resolve(fakeRequest({ 'x-cat-cafe-user': 'frank' }));
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'INVALID_SIGNATURE');
  });

  it('rejects when secret env is not set', async () => {
    delete process.env[SECRET_ENV];
    const headers = makeSignedHeaders('george');
    // Need to recalculate since secret won't match, but actually
    // the error occurs before HMAC check — secret env missing
    const result = await resolver.resolve(fakeRequest(headers));
    assert.equal(result.ok, false);
    assert.ok(result.error.message.includes(SECRET_ENV));
  });

  it('detects nonce replay with store', async () => {
    const seenNonces = new Set();
    const nonceStore = {
      async checkAndMark(nonce, _ttl) {
        if (seenNonces.has(nonce)) return true;
        seenNonces.add(nonce);
        return false;
      },
    };

    const replayResolver = new IdentityResolver(
      {
        mode: 'trusted-header',
        trustedHeader: { requireSignedHeaders: true, sharedSecretEnv: SECRET_ENV },
      },
      nonceStore,
    );

    process.env[SECRET_ENV] = SECRET;
    const headers = makeSignedHeaders('helen');

    // First request succeeds
    const r1 = await replayResolver.resolve(fakeRequest(headers));
    assert.equal(r1.ok, true);

    // Replay of same headers fails
    const r2 = await replayResolver.resolve(fakeRequest(headers));
    assert.equal(r2.ok, false);
    assert.equal(r2.error.code, 'REPLAY_DETECTED');
  });
});

// ─── jwt mode (stub) ─────────────────────────────────

describe('IdentityResolver jwt', () => {
  it('returns not-implemented error', async () => {
    const resolver = new IdentityResolver({ mode: 'jwt' });
    const result = await resolver.resolve(fakeRequest());
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'JWT_INVALID');
    assert.equal(result.error.statusCode, 401);
  });
});
