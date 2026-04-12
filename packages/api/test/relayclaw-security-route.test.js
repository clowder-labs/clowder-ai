/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import Fastify from 'fastify';
import { configRoutes } from '../dist/routes/config.js';

describe('relayclaw security config route', () => {
  let app;

  afterEach(async () => {
    if (app) await app.close();
  });

  async function setup(client) {
    app = Fastify();
    await app.register(configRoutes, {
      relayClawSecurityClient: client,
    });
    await app.ready();
    return app;
  }

  it('loads relayclaw permissions through the API proxy', async () => {
    const calls = [];
    await setup({
      async getPermissions() {
        calls.push('get');
        return {
          enabled: true,
          tools: {
            mcp_exec_command: { '*': 'ask' },
          },
        };
      },
      async setPermissions() {
        throw new Error('not implemented');
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/config/relayclaw/security',
      headers: { 'x-cat-cafe-user': 'security-admin' },
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, ['get']);
    assert.deepEqual(res.json(), {
      permissions: {
        enabled: true,
        tools: {
          mcp_exec_command: { '*': 'ask' },
        },
      },
    });
  });

  it('persists relayclaw permissions changes through the API proxy', async () => {
    const updates = [];
    await setup({
      async getPermissions() {
        return { enabled: true, tools: {} };
      },
      async setPermissions(patch) {
        updates.push(patch);
        return {
          enabled: false,
          tools: {
            write_memory: 'ask',
          },
        };
      },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/config/relayclaw/security',
      headers: { 'x-cat-cafe-user': 'security-admin' },
      payload: {
        permissions: {
          enabled: false,
          tools: {
            write_memory: 'ask',
          },
        },
      },
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(updates, [
      {
        enabled: false,
        tools: {
          write_memory: 'ask',
        },
      },
    ]);
    assert.deepEqual(res.json(), {
      permissions: {
        enabled: false,
        tools: {
          write_memory: 'ask',
        },
      },
    });
  });

  it('surfaces proxy errors as a bad gateway response', async () => {
    await setup({
      async getPermissions() {
        throw new Error('relayclaw unavailable');
      },
      async setPermissions() {
        throw new Error('not implemented');
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/config/relayclaw/security',
      headers: { 'x-cat-cafe-user': 'security-admin' },
    });

    assert.equal(res.statusCode, 502);
    assert.match(res.json().error, /relayclaw unavailable/i);
  });
});
