/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import Conf from 'conf';
import Fastify from 'fastify';
import { authRoutes, sessions } from '../dist/routes/auth.js';

const secureConfig = new Conf({
  projectName: 'secure-config',
  encryptionKey: 'clowder-ai-secure-key',
  encryptionAlgorithm: 'aes-256-gcm',
});

describe('auth routes', () => {
  let app;
  let refreshCount = 0;
  const userId = `domain-${randomUUID()}:user-${randomUUID()}`;
  const expiresAt = new Date(Date.now() + 60_000).toISOString();

  before(async () => {
    app = Fastify();
    app.get('/api/maas-models', async (request) => {
      refreshCount += 1;
      assert.equal(request.headers['x-office-claw-user'], userId);
      assert.equal(request.headers['x-refresh'], 'true');
      return { models: [] };
    });
    await app.register(authRoutes);
    await app.ready();
  });

  beforeEach(() => {
    refreshCount = 0;
    sessions.clear();
    secureConfig.set(userId, expiresAt);
    secureConfig.set(`${userId}-new`, {
      userId,
      token: '',
      expiresAt,
      credential: {},
      modelInfo: {},
    });
  });

  after(async () => {
    sessions.clear();
    secureConfig.delete(userId);
    secureConfig.delete(`${userId}-new`);
    await app.close();
  });

  it('refreshes maas models on the first islogin call for an already logged-in user', async () => {
    const firstResponse = await app.inject({
      method: 'GET',
      url: '/api/islogin',
      headers: { 'x-office-claw-user': userId },
    });

    assert.equal(firstResponse.statusCode, 200);
    assert.equal(JSON.parse(firstResponse.body).islogin, true);
    assert.equal(refreshCount, 1);

    const secondResponse = await app.inject({
      method: 'GET',
      url: '/api/islogin',
      headers: { 'x-office-claw-user': userId },
    });

    assert.equal(secondResponse.statusCode, 200);
    assert.equal(JSON.parse(secondResponse.body).islogin, true);
    assert.equal(refreshCount, 1);
  });
});
