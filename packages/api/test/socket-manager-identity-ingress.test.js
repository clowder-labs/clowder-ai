import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { join } from 'node:path';

describe('socket manager identity ingress hardening', () => {
  it('does not trust client-reported socket.io userId fields', () => {
    const source = readFileSync(
      join(process.cwd(), 'src', 'infrastructure', 'websocket', 'SocketManager.ts'),
      'utf8',
    );

    assert.doesNotMatch(source, /handshake\.auth\.userId/);
    assert.doesNotMatch(source, /handshake\.query\??\.userId/);
    assert.doesNotMatch(source, /readSocketHandshakeUserId/);
    assert.match(source, /resolveEffectiveUserId\(FRONTEND_DEFAULT_USER_ID\)/);
  });
});
