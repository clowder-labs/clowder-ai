import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import Fastify from 'fastify';
import { connectorHubRoutes } from '../dist/routes/connector-hub.js';

function createThreadStore() {
  return {
    async list() {
      return [];
    },
  };
}

describe('POST /api/connector/test/feishu', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('validates app credentials via tenant token and bot info APIs', async () => {
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('/auth/v3/tenant_access_token/internal')) {
        return new Response(JSON.stringify({
          tenant_access_token: 'tenant-token',
          expire: 7200,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (String(url).includes('/bot/v3/info')) {
        return new Response(JSON.stringify({
          code: 0,
          msg: 'success',
          bot: { open_id: 'ou_bot_123', name: 'Clowder Bot' },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const app = Fastify();
    await app.register(connectorHubRoutes, { threadStore: createThreadStore() });

    const res = await app.inject({
      method: 'POST',
      url: '/api/connector/test/feishu',
      headers: { 'X-Cat-Cafe-User': 'tester' },
      payload: {
        FEISHU_APP_ID: 'cli_test_app',
        FEISHU_APP_SECRET: 'secret_test',
        FEISHU_CONNECTION_MODE: 'webhook',
      },
    });

    assert.equal(res.statusCode, 200);
    const data = res.json();
    assert.equal(data.ok, true);
    assert.equal(data.bot.name, 'Clowder Bot');
    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /tenant_access_token\/internal/);
    assert.match(calls[1].url, /bot\/v3\/info/);

    await app.close();
  });

  it('returns warning when webhook mode has no verification token', async () => {
    globalThis.fetch = async (url) => {
      if (String(url).includes('/auth/v3/tenant_access_token/internal')) {
        return new Response(JSON.stringify({
          tenant_access_token: 'tenant-token',
          expire: 7200,
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        code: 0,
        msg: 'success',
        bot: { open_id: 'ou_bot_123', name: 'Clowder Bot' },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    const app = Fastify();
    await app.register(connectorHubRoutes, { threadStore: createThreadStore() });

    const res = await app.inject({
      method: 'POST',
      url: '/api/connector/test/feishu',
      headers: { 'X-Cat-Cafe-User': 'tester' },
      payload: {
        FEISHU_APP_ID: 'cli_test_app',
        FEISHU_APP_SECRET: 'secret_test',
      },
    });

    assert.equal(res.statusCode, 200);
    const data = res.json();
    assert.equal(data.ok, true);
    assert.equal(Array.isArray(data.warnings), true);
    assert.equal(data.warnings.length, 1);

    await app.close();
  });

  it('rejects requests without app credentials', async () => {
    const app = Fastify();
    await app.register(connectorHubRoutes, { threadStore: createThreadStore() });

    const res = await app.inject({
      method: 'POST',
      url: '/api/connector/test/feishu',
      headers: { 'X-Cat-Cafe-User': 'tester' },
      payload: {},
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.json().ok, false);

    await app.close();
  });
});
