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

describe('POST /api/connector/test/xiaoyi', () => {
  it('rejects requests without required credentials', async () => {
    const app = Fastify();
    await app.register(connectorHubRoutes, { threadStore: createThreadStore() });

    const res = await app.inject({
      method: 'POST',
      url: '/api/connector/test/xiaoyi',
      headers: { 'X-Cat-Cafe-User': 'tester' },
      payload: { XIAOYI_AK: 'ak-only' },
    });

    assert.equal(res.statusCode, 400);
    const data = res.json();
    assert.equal(data.ok, false);
    assert.match(data.error, /XIAOYI_AK|XIAOYI_SK|XIAOYI_AGENT_ID/);

    await app.close();
  });

  it('rejects requests with no credentials at all', async () => {
    const app = Fastify();
    await app.register(connectorHubRoutes, { threadStore: createThreadStore() });

    const res = await app.inject({
      method: 'POST',
      url: '/api/connector/test/xiaoyi',
      headers: { 'X-Cat-Cafe-User': 'tester' },
      payload: {},
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.json().ok, false);

    await app.close();
  });

  it('returns 401 without identity header', async () => {
    const app = Fastify();
    await app.register(connectorHubRoutes, { threadStore: createThreadStore() });

    const res = await app.inject({
      method: 'POST',
      url: '/api/connector/test/xiaoyi',
      payload: {
        XIAOYI_AK: 'ak',
        XIAOYI_SK: 'sk',
        XIAOYI_AGENT_ID: 'agent_001',
      },
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.json().error, '缺少用户身份，请先登录或携带 X-Cat-Cafe-User 请求头');

    await app.close();
  });
});
