import assert from 'node:assert/strict';
import test from 'node:test';
import { createClowderServer } from '../dist/server.js';

test('createClowderServer exposes start and close methods', async () => {
  const server = await createClowderServer({ port: 3314, host: '127.0.0.1', memoryStore: true });
  assert.equal(typeof server.start, 'function');
  assert.equal(typeof server.close, 'function');
});
