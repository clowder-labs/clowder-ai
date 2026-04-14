import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

const { applyConnectorSecretUpdates } = await import('../dist/config/connector-secret-updater.js');
const { buildEnvSummary } = await import('../dist/config/env-registry.js');
const { createProviderProfile, resolveAnthropicRuntimeProfileById } = await import(
  '../dist/config/provider-profiles.js'
);
const { WeixinSessionStore } = await import('../dist/infrastructure/connectors/WeixinSessionStore.js');
const {
  createProjectModelConfigSource,
  deleteProjectModelConfigSource,
  findProjectModelConfigBinding,
  updateProjectModelConfigSource,
} = await import('../dist/config/model-config-profiles.js');
const {
  buildConnectorEnvRefVarName,
  decodeSecretRefForTests,
  resetLocalSecretBackendForTests,
  setLocalSecretBackendForTests,
} = await import('../dist/config/local-secret-store.js');

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

function clearEnv(keys) {
  for (const key of keys) {
    delete process.env[key];
  }
}

describe('windows secret-backed persistence', () => {
  afterEach(() => {
    resetLocalSecretBackendForTests();
    clearEnv([
      'DINGTALK_APP_KEY',
      'DINGTALK_APP_SECRET',
      'DINGTALK_APP_SECRET_REF',
      'FEISHU_APP_SECRET',
      'FEISHU_APP_SECRET_REF',
      'OFFICE_CLAW_GLOBAL_CONFIG_ROOT',
    ]);
  });

  it('writes connector secrets as refs while keeping plaintext out of .env', async () => {
    const { backend, store } = createMemoryBackend();
    setLocalSecretBackendForTests(backend);
    const tempDir = mkdtempSync(join(tmpdir(), 'connector-secret-ref-'));
    const envFilePath = join(tempDir, '.env');

    try {
      await applyConnectorSecretUpdates(
        [
          { name: 'DINGTALK_APP_KEY', value: 'ding-key' },
          { name: 'DINGTALK_APP_SECRET', value: 'ding-secret' },
        ],
        { envFilePath },
      );

      const saved = readFileSync(envFilePath, 'utf8');
      assert.match(saved, /DINGTALK_APP_KEY=ding-key/);
      assert.ok(!saved.includes('ding-secret'));
      assert.match(saved, /DINGTALK_APP_SECRET_REF=wincred:\/\/Clowder\/env\/DINGTALK_APP_SECRET/);

      const ref = process.env.DINGTALK_APP_SECRET_REF;
      assert.ok(ref);
      assert.equal(store.get(decodeSecretRefForTests(ref)), 'ding-secret');
      assert.equal(process.env.DINGTALK_APP_SECRET, 'ding-secret');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('masks connector secret refs in env summary even when plaintext env is absent', () => {
    const { backend, store } = createMemoryBackend();
    setLocalSecretBackendForTests(backend);
    const refName = buildConnectorEnvRefVarName('FEISHU_APP_SECRET');
    const refValue = 'wincred://Clowder/env/FEISHU_APP_SECRET';
    process.env[refName] = refValue;
    store.set('Clowder/env/FEISHU_APP_SECRET', 'feishu-secret');

    const entry = buildEnvSummary().find((item) => item.name === 'FEISHU_APP_SECRET');
    assert.ok(entry);
    assert.equal(entry.currentValue, '***');
  });

  it('stores provider profile api keys via refs and resolves runtime secrets from the backend', async () => {
    const { backend } = createMemoryBackend();
    setLocalSecretBackendForTests(backend);
    const projectRoot = mkdtempSync(join(tmpdir(), 'provider-secret-ref-'));
    const previousGlobalRoot = process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
    process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = projectRoot;

    try {
      const profile = await createProviderProfile(projectRoot, {
        displayName: 'Windows Sponsor',
        authType: 'api_key',
        protocol: 'anthropic',
        baseUrl: 'https://api.sponsor.dev',
        apiKey: 'sk-windows-secret',
      });

      const secretsPath = join(projectRoot, '.office-claw', 'provider-profiles.secrets.local.json');
      const raw = readFileSync(secretsPath, 'utf8');
      assert.ok(!raw.includes('sk-windows-secret'));
      assert.ok(raw.includes('"apiKeyRef"'));

      const runtime = await resolveAnthropicRuntimeProfileById(projectRoot, profile.id);
      assert.equal(runtime.apiKey, 'sk-windows-secret');
    } finally {
      if (previousGlobalRoot === undefined) delete process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
      else process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = previousGlobalRoot;
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('stores model-config api keys via refs and resolves runtime secrets from the backend', async () => {
    const { backend, store } = createMemoryBackend();
    setLocalSecretBackendForTests(backend);
    const projectRoot = mkdtempSync(join(tmpdir(), 'model-config-secret-ref-'));
    const previousGlobalRoot = process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
    process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = projectRoot;

    try {
      await createProjectModelConfigSource(projectRoot, {
        id: 'my-openai-proxy',
        displayName: 'My OpenAI Proxy',
        baseUrl: 'https://proxy.example.com/v1',
        apiKey: 'sk-model-config-secret',
        models: ['gpt-4o-mini'],
      });

      const modelPath = join(projectRoot, '.office-claw', 'model.json');
      const raw = readFileSync(modelPath, 'utf8');
      assert.ok(!raw.includes('sk-model-config-secret'));
      assert.ok(raw.includes('"apiKeyRef"'));

      const saved = JSON.parse(raw);
      const ref = saved['my-openai-proxy'].apiKeyRef;
      assert.equal(store.get(decodeSecretRefForTests(ref)), 'sk-model-config-secret');

      const runtime = await findProjectModelConfigBinding(projectRoot, 'my-openai-proxy');
      assert.equal(runtime?.apiKey, 'sk-model-config-secret');

      await updateProjectModelConfigSource(projectRoot, 'my-openai-proxy', {
        apiKey: 'sk-model-config-updated',
      });
      assert.equal(store.get(decodeSecretRefForTests(ref)), 'sk-model-config-updated');

      await deleteProjectModelConfigSource(projectRoot, 'my-openai-proxy');
      assert.equal(store.size, 0);
    } finally {
      if (previousGlobalRoot === undefined) delete process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
      else process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = previousGlobalRoot;
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('migrates plaintext model-config api keys to refs when secret storage is enabled', async () => {
    const { backend, store } = createMemoryBackend();
    setLocalSecretBackendForTests(backend);
    const projectRoot = mkdtempSync(join(tmpdir(), 'model-config-secret-migrate-'));
    const previousGlobalRoot = process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
    process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = projectRoot;

    try {
      const { mkdirSync, writeFileSync } = await import('node:fs');
      mkdirSync(join(projectRoot, '.office-claw'), { recursive: true });
      writeFileSync(
        join(projectRoot, '.office-claw', 'model.json'),
        `${JSON.stringify(
          {
            legacy: {
              protocol: 'openai',
              displayName: 'Legacy',
              baseUrl: 'https://legacy.example.com/v1',
              apiKey: 'sk-legacy-plain',
              models: [{ id: 'gpt-4o-mini' }],
            },
          },
          null,
          2,
        )}\n`,
        'utf8',
      );

      const runtime = await findProjectModelConfigBinding(projectRoot, 'legacy');
      assert.equal(runtime?.apiKey, 'sk-legacy-plain');

      const migratedRaw = readFileSync(join(projectRoot, '.office-claw', 'model.json'), 'utf8');
      assert.ok(!migratedRaw.includes('sk-legacy-plain'));
      assert.ok(migratedRaw.includes('"apiKeyRef"'));

      const migrated = JSON.parse(migratedRaw);
      const ref = migrated.legacy.apiKeyRef;
      assert.equal(store.get(decodeSecretRefForTests(ref)), 'sk-legacy-plain');
    } finally {
      if (previousGlobalRoot === undefined) delete process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT;
      else process.env.OFFICE_CLAW_GLOBAL_CONFIG_ROOT = previousGlobalRoot;
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('stores WeChat session tokens via refs instead of plaintext file content', () => {
    const { backend, store } = createMemoryBackend();
    setLocalSecretBackendForTests(backend);
    const hostRoot = mkdtempSync(join(tmpdir(), 'weixin-secret-ref-'));

    try {
      const sessionStore = new WeixinSessionStore(hostRoot);
      sessionStore.save('wx-secret-token');

      const sessionPath = join(hostRoot, '.office-claw', 'weixin-session.local.json');
      const raw = readFileSync(sessionPath, 'utf8');
      assert.ok(!raw.includes('wx-secret-token'));
      assert.ok(raw.includes('"botTokenRef"'));

      const restored = sessionStore.load();
      assert.equal(restored?.botToken, 'wx-secret-token');

      sessionStore.clear();
      assert.equal(store.size, 0);
    } finally {
      rmSync(hostRoot, { recursive: true, force: true });
    }
  });
});
