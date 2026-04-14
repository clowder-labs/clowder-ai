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
  const domainId = `domain-${randomUUID()}`;
  const userName = `user-${randomUUID()}`;
  const userId = `${domainId}:${userName}`;

  before(async () => {
    configRoot = mkdtempSync(join(tmpdir(), 'office-claw-auth-routes-'));
    process.env.HOME = configRoot;
    const authModule = await importAuthRoutesFresh();
    sessions = authModule.sessions;
    app = Fastify();
    app.get('/api/maas-models', async (request) => {
      refreshCount += 1;
      assert.equal(request.headers['x-office-claw-user'], userId);
      assert.equal(request.headers['x-refresh'], 'true');
      assert.ok(sessions.has(userId));
      return { models: [] };
    });
    await app.register(authModule.authRoutes);
    await app.ready();
  });

  beforeEach(async () => {
    mock.restoreAll();
    sessions.clear();
    refreshCount = 0;

    mock.method(globalThis, 'fetch', async (url) => {
      if (String(url).includes('/v1/claw/cas/login/ticket-validate')) {
        return new Response(
          JSON.stringify({
            access: 'ak-test',
            domain_id: domainId,
            domain_name: domainId,
            project_id: 'project-001',
            project_name: 'project-001',
            secret: 'sk-test',
            sts_token: 'sts-token-test',
            user_id: userName,
            user_name: userName,
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

      throw new Error(`unexpected outbound fetch in auth-routes.test: ${url}`);
    });

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/api/login/callback',
      payload: { ticket: 'ticket-auth-routes' },
    });

    assert.equal(loginResponse.statusCode, 200);
    assert.equal(loginResponse.json().success, true);
    sessions.clear();
    refreshCount = 0;
  });

  after(async () => {
    mock.restoreAll();
    sessions.clear();
    await app.close();
    process.env.HOME = originalHome;
    rmSync(configRoot, { recursive: true, force: true });
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
