/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import Fastify from 'fastify';
import { configRoutes } from '../dist/routes/config.js';
import { AgentRegistry } from '../dist/domains/cats/services/agents/registry/AgentRegistry.js';

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

  it('fans out relayclaw security patches to all live runtimes in the agent registry', async () => {
    const calls = [];
    const agentRegistry = new AgentRegistry();

    function createRuntime(scopeKey) {
      const requestQueues = new Map();
      const runtime = {
        scopeKey,
        homeDir: `/tmp/${scopeKey}`,
        resolvedUrl: `ws://127.0.0.1:${scopeKey === 'scope-a' ? '19091' : '19092'}`,
        requestQueues,
        sidecar: {
          async ensureStarted() {
            return runtime.resolvedUrl;
          },
          stop() {},
          getRecentLogs() {
            return '';
          },
        },
        connection: {
          async ensureConnected(url) {
            calls.push({ scopeKey, type: 'connect', url });
          },
          send(payload) {
            calls.push({ scopeKey, type: payload.req_method, params: payload.params });
            const queue = requestQueues.get(payload.request_id);
            assert.ok(queue, 'request queue should exist before send');
            if (payload.req_method === 'config.get') {
              queue.put({
                ok: true,
                payload: {
                  trees: {
                    permissions: {
                      enabled: false,
                      tools: { write_memory: 'ask' },
                    },
                  },
                },
              });
              return;
            }
            queue.put({
              ok: true,
              payload: {
                updated_top_level_keys: ['permissions'],
                reloaded: true,
              },
            });
          },
          close() {},
          isOpen() {
            return true;
          },
        },
      };
      return runtime;
    }

    agentRegistry.register('jiuwenclaw', {
      invoke() {
        throw new Error('not used in this test');
      },
      listRelayClawRuntimeHandles() {
        return [createRuntime('scope-a'), createRuntime('scope-b')];
      },
    });

    app = Fastify();
    await app.register(configRoutes, {
      agentRegistry,
    });
    await app.ready();

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
    assert.deepEqual(res.json(), {
      permissions: {
        enabled: false,
        tools: {
          write_memory: 'ask',
        },
      },
    });

    const configSetCalls = calls.filter((entry) => entry.type === 'config.set');
    assert.equal(configSetCalls.length, 2);
    assert.deepEqual(
      configSetCalls.map((entry) => entry.scopeKey).sort(),
      ['scope-a', 'scope-b'],
    );
    for (const entry of configSetCalls) {
      assert.deepEqual(entry.params, {
        config_yaml: {
          permissions: {
            enabled: false,
            tools: {
              write_memory: 'ask',
            },
          },
        },
      });
    }
  });
});
