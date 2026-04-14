/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';

const { resetLocalSecretBackendForTests, setLocalSecretBackendForTests } = await import(
  '../dist/config/local-secret-store.js'
);

const tempDirs = [];

function createMemoryBackend() {
  const store = new Map();
  return {
    store,
    backend: {
      get(key) {
        return store.has(key) ? store.get(key) : null;
      },
      set(key, value) {
        store.set(key, value);
      },
      delete(key) {
        store.delete(key);
      },
    },
  };
}

function createProjectRoot() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'model-config-route-'));
  tempDirs.push(projectRoot);
  process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = projectRoot;
  writeFileSync(join(projectRoot, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
  return projectRoot;
}

async function seedHuaweiSession(userId = 'demo-user') {
  const { sessions } = await import('../dist/routes/auth.js');
  sessions.set(userId, {
    userId,
    token: 'token-123',
    expiresAt: '2999-01-01T00:00:00.000Z',
    credential: {},
    modelInfo: {
      model_api_url_base: 'https://maas.example.com',
      model_auth_info: {
        model_app_key: 'app-key',
        model_app_secret: 'app-secret',
      },
    },
  });
}

describe('model config profiles routes', () => {
  let savedGlobalRoot;

  beforeEach(() => {
    savedGlobalRoot = process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
    resetLocalSecretBackendForTests();
  });

  after(() => {
    resetLocalSecretBackendForTests();
    if (savedGlobalRoot === undefined) delete process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
    else process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = savedGlobalRoot;
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('POST /api/model-config-profiles creates a custom source in ~/.office-claw/model.json and maas-models lists it', async () => {
    const projectRoot = createProjectRoot();
    const Fastify = (await import('fastify')).default;
    const { modelConfigProfilesRoutes } = await import('../dist/routes/model-config-profiles.js');
    const { maasModelsRoutes } = await import('../dist/routes/maas-models.js');

    const app = Fastify();
    await app.register(modelConfigProfilesRoutes);
    await app.register(maasModelsRoutes);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/model-config-profiles',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectPath: projectRoot,
        sourceId: 'my-openai-proxy',
        displayName: 'My OpenAI Proxy',
        baseUrl: 'https://proxy.example.com/v1',
        apiKey: 'sk-proxy',
        headers: {
          'X-App-Id': 'cat-cafe',
        },
        models: ['gpt-4o-mini', 'deepseek-chat'],
      }),
    });

    assert.equal(createRes.statusCode, 201);
    const createBody = JSON.parse(createRes.body);
    assert.equal(createBody.provider.id, 'my-openai-proxy');
    assert.equal(createBody.provider.displayName, 'My OpenAI Proxy');
    assert.deepEqual(createBody.provider.models, ['gpt-4o-mini', 'deepseek-chat']);

    const modelJson = JSON.parse(readFileSync(join(projectRoot, '.office-claw', 'model.json'), 'utf-8'));
    assert.deepEqual(modelJson['my-openai-proxy'], {
      protocol: 'openai',
      displayName: 'My OpenAI Proxy',
      baseUrl: 'https://proxy.example.com/v1',
      apiKey: 'sk-proxy',
      headers: { 'X-App-Id': 'cat-cafe' },
      models: [{ id: 'gpt-4o-mini' }, { id: 'deepseek-chat' }],
    });

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/maas-models?projectPath=${encodeURIComponent(projectRoot)}`,
    });

    assert.equal(listRes.statusCode, 200);
    const listBody = JSON.parse(listRes.body);
    assert.ok(Array.isArray(listBody.list));
    assert.ok(listBody.list.some((item) => item.id === 'model_config:my-openai-proxy:gpt-4o-mini'));
    assert.ok(listBody.list.some((item) => item.name === 'deepseek-chat' && item.provider === 'My OpenAI Proxy'));
  });

  it('GET /api/maas-models prefers cache when refresh header is not set', async () => {
    const projectRoot = createProjectRoot();
    const Fastify = (await import('fastify')).default;
    const { maasModelsRoutes } = await import('../dist/routes/maas-models.js');
    await seedHuaweiSession();

    mkdirSync(join(projectRoot, '.office-claw'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.office-claw', 'model.json'),
      JSON.stringify(
        {
          'huawei-maas': [
            {
              id: 'cached-model',
              name: 'Cached Model',
              description: 'from cache',
            },
          ],
        },
        null,
        2,
      ),
    );

    let fetchCount = 0;
    const app = Fastify();
    await app.register(maasModelsRoutes, {
      fetchImpl: async () => {
        fetchCount += 1;
        return new Response(
          JSON.stringify({
            data: [{ id: 'remote-model', name: 'Remote Model' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/maas-models?projectPath=${encodeURIComponent(projectRoot)}`,
      headers: {
        'x-office-claw-user': 'demo-user',
      },
    });

    assert.equal(listRes.statusCode, 200);
    const listBody = JSON.parse(listRes.body);
    assert.equal(fetchCount, 0);
    assert.ok(Array.isArray(listBody.list));
  });

  it('GET /api/maas-models bypasses cache when refresh header is true', async () => {
    const projectRoot = createProjectRoot();
    const Fastify = (await import('fastify')).default;
    const { maasModelsRoutes } = await import('../dist/routes/maas-models.js');
    await seedHuaweiSession();

    mkdirSync(join(projectRoot, '.office-claw'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.office-claw', 'model.json'),
      JSON.stringify(
        {
          'huawei-maas': [
            {
              id: 'cached-model',
              name: 'Cached Model',
            },
          ],
        },
        null,
        2,
      ),
    );

    let fetchCount = 0;
    const app = Fastify();
    await app.register(maasModelsRoutes, {
      fetchImpl: async () => {
        fetchCount += 1;
        return new Response(
          JSON.stringify({
            data: [{ id: 'remote-model', name: 'Remote Model' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      },
    });

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/maas-models?projectPath=${encodeURIComponent(projectRoot)}`,
      headers: {
        'x-office-claw-user': 'demo-user',
        'x-refresh': 'true',
      },
    });

    assert.equal(listRes.statusCode, 200);
    const listBody = JSON.parse(listRes.body);
    assert.equal(fetchCount, 1);
    assert.ok(Array.isArray(listBody.list));
  });

  it('PUT /api/model-config-profiles/:sourceId updates an existing source', async () => {
    const projectRoot = createProjectRoot();
    const Fastify = (await import('fastify')).default;
    const { modelConfigProfilesRoutes } = await import('../dist/routes/model-config-profiles.js');

    const app = Fastify();
    await app.register(modelConfigProfilesRoutes);

    // Create a source first
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/model-config-profiles',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectPath: projectRoot,
        sourceId: 'test-source',
        displayName: 'Test Source',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        models: ['model-a', 'model-b'],
      }),
    });
    assert.equal(createRes.statusCode, 201);

    // Update displayName and models
    const updateRes = await app.inject({
      method: 'PUT',
      url: '/api/model-config-profiles/test-source',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectPath: projectRoot,
        displayName: 'Updated Source',
        models: ['model-a', 'model-c', 'model-d'],
      }),
    });

    assert.equal(updateRes.statusCode, 200);
    const updateBody = JSON.parse(updateRes.body);
    assert.equal(updateBody.provider.id, 'test-source');
    assert.equal(updateBody.provider.displayName, 'Updated Source');
    assert.deepEqual(updateBody.provider.models, ['model-a', 'model-c', 'model-d']);

    // Verify the file was updated
    const modelJson = JSON.parse(readFileSync(join(projectRoot, '.office-claw', 'model.json'), 'utf-8'));
    assert.equal(modelJson['test-source'].displayName, 'Updated Source');
    assert.deepEqual(modelJson['test-source'].models, [{ id: 'model-a' }, { id: 'model-c' }, { id: 'model-d' }]);
    // Verify baseUrl and apiKey remain unchanged
    assert.equal(modelJson['test-source'].baseUrl, 'https://api.example.com/v1');
    assert.equal(modelJson['test-source'].apiKey, 'sk-test');
  });

  it('PUT /api/model-config-profiles/:sourceId updates baseUrl and apiKey', async () => {
    const projectRoot = createProjectRoot();
    const Fastify = (await import('fastify')).default;
    const { modelConfigProfilesRoutes } = await import('../dist/routes/model-config-profiles.js');

    const app = Fastify();
    await app.register(modelConfigProfilesRoutes);

    // Create a source first
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/model-config-profiles',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectPath: projectRoot,
        sourceId: 'test-source-2',
        displayName: 'Test Source 2',
        baseUrl: 'https://old-api.example.com/v1',
        apiKey: 'sk-old',
        models: ['model-x'],
      }),
    });
    assert.equal(createRes.statusCode, 201);

    // Update baseUrl and apiKey
    const updateRes = await app.inject({
      method: 'PUT',
      url: '/api/model-config-profiles/test-source-2',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectPath: projectRoot,
        baseUrl: 'https://new-api.example.com/v2',
        apiKey: 'sk-new-key',
      }),
    });

    assert.equal(updateRes.statusCode, 200);
    const updateBody = JSON.parse(updateRes.body);
    assert.equal(updateBody.provider.id, 'test-source-2');

    // Verify the file was updated
    const modelJson = JSON.parse(readFileSync(join(projectRoot, '.office-claw', 'model.json'), 'utf-8'));
    assert.equal(modelJson['test-source-2'].baseUrl, 'https://new-api.example.com/v2');
    assert.equal(modelJson['test-source-2'].apiKey, 'sk-new-key');
    // Verify other fields remain unchanged
    assert.equal(modelJson['test-source-2'].displayName, 'Test Source 2');
  });

  it('PUT /api/model-config-profiles/:sourceId returns 404 for non-existent source', async () => {
    const projectRoot = createProjectRoot();
    const Fastify = (await import('fastify')).default;
    const { modelConfigProfilesRoutes } = await import('../dist/routes/model-config-profiles.js');

    const app = Fastify();
    await app.register(modelConfigProfilesRoutes);

    const updateRes = await app.inject({
      method: 'PUT',
      url: '/api/model-config-profiles/non-existent',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectPath: projectRoot,
        displayName: 'Should Not Work',
      }),
    });

    assert.equal(updateRes.statusCode, 400);
    const updateBody = JSON.parse(updateRes.body);
    assert.ok(updateBody.error.includes('not found'));
  });

  it('PUT /api/model-config-profiles/:sourceId rejects huawei-maas source', async () => {
    const projectRoot = createProjectRoot();
    const Fastify = (await import('fastify')).default;
    const { modelConfigProfilesRoutes } = await import('../dist/routes/model-config-profiles.js');

    const app = Fastify();
    await app.register(modelConfigProfilesRoutes);

    const updateRes = await app.inject({
      method: 'PUT',
      url: '/api/model-config-profiles/huawei-maas',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectPath: projectRoot,
        displayName: 'Should Not Work',
      }),
    });

    assert.equal(updateRes.statusCode, 400);
    const updateBody = JSON.parse(updateRes.body);
    assert.ok(updateBody.error.includes('cannot be updated'));
  });

  it('DELETE /api/model-config-profiles/:sourceId deletes a source', async () => {
    const projectRoot = createProjectRoot();
    const Fastify = (await import('fastify')).default;
    const { modelConfigProfilesRoutes } = await import('../dist/routes/model-config-profiles.js');

    const app = Fastify();
    await app.register(modelConfigProfilesRoutes);

    // Create a source first
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/model-config-profiles',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectPath: projectRoot,
        sourceId: 'to-delete',
        displayName: 'To Delete',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-delete',
        models: ['model-1'],
      }),
    });
    assert.equal(createRes.statusCode, 201);

    // Delete the source
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/model-config-profiles/to-delete?projectPath=${encodeURIComponent(projectRoot)}`,
    });

    assert.equal(deleteRes.statusCode, 200);
    const deleteBody = JSON.parse(deleteRes.body);
    assert.equal(deleteBody.success, true);

    // Verify the source is gone from the file
    const modelJson = JSON.parse(readFileSync(join(projectRoot, '.office-claw', 'model.json'), 'utf-8'));
    assert.equal(modelJson['to-delete'], undefined);
  });

  // ─── description and icon field tests ────────────────────

  it('POST /api/model-config-profiles creates source with description and icon', async () => {
    const projectRoot = createProjectRoot();
    const Fastify = (await import('fastify')).default;
    const { modelConfigProfilesRoutes } = await import('../dist/routes/model-config-profiles.js');

    const app = Fastify();
    await app.register(modelConfigProfilesRoutes);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/model-config-profiles',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectPath: projectRoot,
        sourceId: 'with-desc-icon',
        displayName: 'Test Model',
        description: 'A test model description',
        icon: '/images/test.svg',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        models: ['model-1'],
      }),
    });

    assert.equal(createRes.statusCode, 201);
    const createBody = JSON.parse(createRes.body);
    assert.equal(createBody.provider.description, 'A test model description');
    assert.equal(createBody.provider.icon, '/images/test.svg');

    // Verify persisted in file
    const modelJson = JSON.parse(readFileSync(join(projectRoot, '.office-claw', 'model.json'), 'utf-8'));
    assert.equal(modelJson['with-desc-icon'].description, 'A test model description');
    assert.equal(modelJson['with-desc-icon'].icon, '/images/test.svg');
  });

  it('POST /api/model-config-profiles creates source without displayName (uses id as fallback)', async () => {
    const projectRoot = createProjectRoot();
    const Fastify = (await import('fastify')).default;
    const { modelConfigProfilesRoutes } = await import('../dist/routes/model-config-profiles.js');

    const app = Fastify();
    await app.register(modelConfigProfilesRoutes);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/model-config-profiles',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectPath: projectRoot,
        sourceId: 'no-display-name',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        models: ['model-1'],
      }),
    });

    assert.equal(createRes.statusCode, 201);
    const createBody = JSON.parse(createRes.body);
    // displayName should fallback to id
    assert.equal(createBody.provider.displayName, 'no-display-name');
    assert.equal(createBody.provider.name, 'no-display-name');
  });

  it('PUT /api/model-config-profiles/:sourceId clears description and icon with null', async () => {
    const projectRoot = createProjectRoot();
    const Fastify = (await import('fastify')).default;
    const { modelConfigProfilesRoutes } = await import('../dist/routes/model-config-profiles.js');

    const app = Fastify();
    await app.register(modelConfigProfilesRoutes);

    // Create with description and icon
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/model-config-profiles',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectPath: projectRoot,
        sourceId: 'clear-fields',
        displayName: 'Test',
        description: 'Original description',
        icon: '/images/original.svg',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        models: ['model-1'],
      }),
    });
    assert.equal(createRes.statusCode, 201);

    // Clear description and icon
    const updateRes = await app.inject({
      method: 'PUT',
      url: '/api/model-config-profiles/clear-fields',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectPath: projectRoot,
        description: null,
        icon: null,
      }),
    });

    assert.equal(updateRes.statusCode, 200);
    const updateBody = JSON.parse(updateRes.body);
    assert.equal(updateBody.provider.description, undefined);
    assert.equal(updateBody.provider.icon, undefined);

    // Verify cleared in file
    const modelJson = JSON.parse(readFileSync(join(projectRoot, '.office-claw', 'model.json'), 'utf-8'));
    assert.equal(modelJson['clear-fields'].description, undefined);
    assert.equal(modelJson['clear-fields'].icon, undefined);
  });

  it('PUT /api/model-config-profiles/:sourceId clears displayName to empty string (uses id as fallback)', async () => {
    const projectRoot = createProjectRoot();
    const Fastify = (await import('fastify')).default;
    const { modelConfigProfilesRoutes } = await import('../dist/routes/model-config-profiles.js');

    const app = Fastify();
    await app.register(modelConfigProfilesRoutes);

    // Create with displayName
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/model-config-profiles',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectPath: projectRoot,
        sourceId: 'clear-display',
        displayName: 'Original Display Name',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        models: ['model-1'],
      }),
    });
    assert.equal(createRes.statusCode, 201);

    // Clear displayName (empty string)
    const updateRes = await app.inject({
      method: 'PUT',
      url: '/api/model-config-profiles/clear-display',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectPath: projectRoot,
        displayName: '',
      }),
    });

    assert.equal(updateRes.statusCode, 200);
    const updateBody = JSON.parse(updateRes.body);
    // displayName should fallback to id when cleared
    assert.equal(updateBody.provider.displayName, 'clear-display');

    // Verify in file - displayName should be set to id (fallback behavior)
    const modelJson = JSON.parse(readFileSync(join(projectRoot, '.office-claw', 'model.json'), 'utf-8'));
    assert.equal(modelJson['clear-display'].displayName, 'clear-display');
  });

  it('POST /api/model-config-profiles stores apiKey as ref when secret storage is enabled', async () => {
    const { backend } = createMemoryBackend();
    setLocalSecretBackendForTests(backend);
    const projectRoot = createProjectRoot();
    const Fastify = (await import('fastify')).default;
    const { modelConfigProfilesRoutes } = await import('../dist/routes/model-config-profiles.js');

    const app = Fastify();
    await app.register(modelConfigProfilesRoutes);

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/model-config-profiles',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectPath: projectRoot,
        sourceId: 'secret-proxy',
        displayName: 'Secret Proxy',
        baseUrl: 'https://proxy.example.com/v1',
        apiKey: 'sk-secret-proxy',
        models: ['gpt-4o-mini'],
      }),
    });

    assert.equal(createRes.statusCode, 201);
    const modelJson = JSON.parse(readFileSync(join(projectRoot, '.office-claw', 'model.json'), 'utf-8'));
    assert.equal(typeof modelJson['secret-proxy'].apiKeyRef, 'string');
    assert.equal(modelJson['secret-proxy'].apiKey, undefined);
    assert.ok(!JSON.stringify(modelJson).includes('sk-secret-proxy'));
  });

  it('GET /api/model-config-profiles does not return plaintext apiKey', async () => {
    const { backend } = createMemoryBackend();
    setLocalSecretBackendForTests(backend);
    const projectRoot = createProjectRoot();
    const Fastify = (await import('fastify')).default;
    const { modelConfigProfilesRoutes } = await import('../dist/routes/model-config-profiles.js');

    const app = Fastify();
    await app.register(modelConfigProfilesRoutes);

    await app.inject({
      method: 'POST',
      url: '/api/model-config-profiles',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectPath: projectRoot,
        sourceId: 'masked-proxy',
        displayName: 'Masked Proxy',
        baseUrl: 'https://proxy.example.com/v1',
        apiKey: 'sk-masked',
        models: ['gpt-4o-mini'],
      }),
    });

    const listRes = await app.inject({
      method: 'GET',
      url: `/api/model-config-profiles?projectPath=${encodeURIComponent(projectRoot)}`,
    });

    assert.equal(listRes.statusCode, 200);
    const listBody = JSON.parse(listRes.body);
    const provider = listBody.providers.find((item) => item.id === 'masked-proxy');
    assert.ok(provider);
    assert.equal(provider.hasApiKey, true);
    assert.equal('apiKey' in provider, false);
    assert.ok(!listRes.body.includes('sk-masked'));
  });

  it('PUT /api/model-config-profiles/:sourceId keeps apiKeyRef when secret storage is enabled', async () => {
    const { backend } = createMemoryBackend();
    setLocalSecretBackendForTests(backend);
    const projectRoot = createProjectRoot();
    const Fastify = (await import('fastify')).default;
    const { modelConfigProfilesRoutes } = await import('../dist/routes/model-config-profiles.js');

    const app = Fastify();
    await app.register(modelConfigProfilesRoutes);

    await app.inject({
      method: 'POST',
      url: '/api/model-config-profiles',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectPath: projectRoot,
        sourceId: 'test-source-ref',
        displayName: 'Test Source Ref',
        baseUrl: 'https://old-api.example.com/v1',
        apiKey: 'sk-old',
        models: ['model-x'],
      }),
    });

    const updateRes = await app.inject({
      method: 'PUT',
      url: '/api/model-config-profiles/test-source-ref',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectPath: projectRoot,
        baseUrl: 'https://new-api.example.com/v2',
        apiKey: 'sk-new-key',
      }),
    });

    assert.equal(updateRes.statusCode, 200);
    const modelJson = JSON.parse(readFileSync(join(projectRoot, '.office-claw', 'model.json'), 'utf-8'));
    assert.equal(modelJson['test-source-ref'].baseUrl, 'https://new-api.example.com/v2');
    assert.equal(typeof modelJson['test-source-ref'].apiKeyRef, 'string');
    assert.equal(modelJson['test-source-ref'].apiKey, undefined);
  });
});
