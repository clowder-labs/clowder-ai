/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, beforeEach, describe, it, mock } from 'node:test';
import Fastify from 'fastify';

async function importAuthRoutesFresh() {
  const moduleUrl = `${pathToFileURL(resolve('dist/routes/auth.js')).href}?t=${Date.now()}-${Math.random()}`;
  return import(moduleUrl);
}

describe('auth routes', () => {
  let app;
  let sessions;
  let configRoot = '';
  const originalHome = process.env.HOME;
  let refreshCount = 0;
  const domainName = `domain-${randomUUID()}`;
  const userId = `${domainName}:${domainName}`;

  before(async () => {
    configRoot = mkdtempSync(join(tmpdir(), 'cat-cafe-auth-routes-'));
    process.env.HOME = configRoot;
    const authModule = await importAuthRoutesFresh();
    sessions = authModule.sessions;
    app = Fastify();
    app.get('/api/maas-models', async (request) => {
      refreshCount += 1;
      assert.equal(request.headers['x-cat-cafe-user'], userId);
      assert.equal(request.headers['x-refresh'], 'true');
      assert.ok(sessions.has(userId));
      return { models: [] };
    });
    await app.register(authModule.authRoutes);
    await app.ready();
  });

  beforeEach(() => {
    mock.restoreAll();
    sessions.clear();
    refreshCount = 0;

    mock.method(globalThis, 'fetch', async (url) => {
      if (String(url).includes('/v3/auth/tokens')) {
        return new Response(
          JSON.stringify({
            token: {
              user: { domain: { id: domainName } },
              expires_at: new Date(Date.now() + 60_000).toISOString(),
            },
          }),
          {
            status: 201,
            headers: {
              'content-type': 'application/json',
              'x-subject-token': 'token-123',
            },
          },
        );
      }

      if (String(url).includes('/v1/claw/client-subscription')) {
        return new Response(
          JSON.stringify({
            model_info: {
              model_api_url_base: 'https://maas.example.com',
              model_auth_info: {
                model_app_key: 'app-key',
                model_app_secret: 'app-secret',
              },
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
  });

  after(async () => {
    mock.restoreAll();
    sessions.clear();
    await app.close();
    process.env.HOME = originalHome;
    rmSync(configRoot, { recursive: true, force: true });
  });

  it('refreshes maas models on the first islogin call for an already logged-in user', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/login',
      payload: {
        domainName,
        password: 'secret',
        userType: 'huawei',
      },
    });

    assert.equal(loginResponse.statusCode, 200);
    assert.equal(loginResponse.json().success, true);

    sessions.clear();
    refreshCount = 0;

    const firstResponse = await app.inject({
      method: 'GET',
      url: '/api/islogin',
      headers: { 'x-cat-cafe-user': userId },
    });

    assert.equal(firstResponse.statusCode, 200);
    assert.equal(JSON.parse(firstResponse.body).islogin, true);
    assert.equal(refreshCount, 1);

    const secondResponse = await app.inject({
      method: 'GET',
      url: '/api/islogin',
      headers: { 'x-cat-cafe-user': userId },
    });

    assert.equal(secondResponse.statusCode, 200);
    assert.equal(JSON.parse(secondResponse.body).islogin, true);
    assert.equal(refreshCount, 1);
  });
});
