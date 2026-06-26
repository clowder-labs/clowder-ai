// @ts-check
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import {
  PluginResourceActivator,
  rehydrateEnabledPluginSchedules,
} from '../dist/domains/plugin/PluginResourceActivator.js';
import { parsePluginManifest, validateEnvSafety } from '../dist/domains/plugin/plugin-manifest.js';
import { ScheduleFactoryRegistry } from '../dist/domains/plugin/ScheduleFactoryRegistry.js';
import {
  buildSignalsMigrationEntries,
  markSignalsScheduleMigrationDone,
  registerSignalsScheduleFactories,
  shouldRunSignalsScheduleMigration,
} from '../dist/domains/plugin/signals-schedule-factories.js';
import { resolveSignalPaths } from '../dist/domains/signals/config/signal-paths.js';

const stubLog = {
  info: () => {},
  error: () => {},
  warn: () => {},
};

function signalsManifest() {
  return parsePluginManifest(join(__dirname, '../../../plugins/signals/plugin.yaml'));
}

function createTempRoot(prefix = 'cat-cafe-signals-schedule-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeNotifications(paths, dailyDigest = '09:45', timezone = 'America/Los_Angeles') {
  mkdirSync(paths.configDir, { recursive: true });
  writeFileSync(
    join(paths.configDir, 'notifications.yaml'),
    [
      'version: 1',
      'notifications:',
      '  email:',
      '    enabled: false',
      '    provider: gmail',
      '    smtp:',
      '      host: smtp.gmail.com',
      '      port: 587',
      '      secure: false',
      '    to: owner@example.com',
      '    from: Clowder AI Signals <noreply@example.com>',
      '  in_app:',
      '    enabled: true',
      '    thread: signals',
      '  system:',
      '    enabled: false',
      '  schedule:',
      `    daily_digest: "${dailyDigest}"`,
      `    timezone: ${timezone}`,
      '',
    ].join('\n'),
    'utf-8',
  );
}

function successSummary(overrides = {}) {
  return {
    dryRun: false,
    fetchedAt: '2026-06-26T01:45:00.000Z',
    processedSources: 3,
    skippedSources: 40,
    fetchedArticles: 10,
    newArticles: 2,
    storedArticles: 2,
    duplicateArticles: 8,
    errors: [],
    notifications: {
      email: { status: 'skipped' },
      inApp: { status: 'sent' },
    },
    ...overrides,
  };
}

function makeTaskRunner() {
  const live = new Set();
  return {
    registered: [],
    unregistered: [],
    registerPostStart(task) {
      if (live.has(task.id)) throw new Error(`duplicate task id ${task.id}`);
      live.add(task.id);
      this.registered.push(task);
    },
    register(task) {
      if (live.has(task.id)) throw new Error(`duplicate task id ${task.id}`);
      live.add(task.id);
      this.registered.push(task);
    },
    unregister(taskId) {
      if (!live.has(taskId)) return false;
      live.delete(taskId);
      this.unregistered.push(taskId);
      return true;
    },
  };
}

function makeCapabilitiesStore(initial = { version: 1, capabilities: [] }) {
  let config = structuredClone(initial);
  return {
    get: () => config,
    read: async () => config,
    write: async (next) => {
      config = structuredClone(next);
    },
  };
}

describe('signals schedule plugin manifest', () => {
  test('declares one schedule resource and passes plugin env safety', () => {
    const manifest = signalsManifest();

    assert.equal(manifest.id, 'signals');
    assert.equal(manifest.resources.length, 1);
    assert.deepEqual(manifest.resources[0], {
      type: 'schedule',
      name: 'auto-fetch',
      factoryId: 'signals.auto-fetch',
      path: undefined,
      command: undefined,
      args: undefined,
      transport: undefined,
      url: undefined,
    });
    assert.equal(manifest.config[0].envName, 'SIGNALS_GITHUB_API_TOKEN');
    assert.equal(validateEnvSafety(manifest, new Map()).ok, true);
  });
});

describe('signals.auto-fetch schedule factory', () => {
  test('builds a cron task from notifications.yaml and calls runSignalFetchScheduler directly', async () => {
    const tempRoot = createTempRoot();
    try {
      const paths = resolveSignalPaths(tempRoot);
      writeNotifications(paths, '09:45', 'America/Los_Angeles');

      const registry = new ScheduleFactoryRegistry();
      registerSignalsScheduleFactories(registry);
      const factory = registry.getForPlugin('signals.auto-fetch', 'signals');
      assert.ok(factory, 'signals factory should be registered');

      const calls = [];
      const spec = factory.createTaskSpec('schedule:signals:auto-fetch', {
        log: stubLog,
        signalsPaths: paths,
        getSignalGitHubApiToken: () => 'plugin-token',
        runSignalFetchScheduler: async (options) => {
          calls.push(options);
          return successSummary();
        },
      });

      assert.equal(spec.id, 'schedule:signals:auto-fetch');
      assert.deepEqual(spec.trigger, {
        type: 'cron',
        expression: '45 9 * * *',
        timezone: 'America/Los_Angeles',
      });

      const gate = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
      assert.equal(gate.run, true);
      assert.equal(gate.workItems[0].subjectKey, 'signals:auto-fetch');

      await spec.run.execute({ kind: 'signals:auto-fetch' }, 'signals:auto-fetch', {});
      assert.equal(calls.length, 1);
      assert.equal(calls[0].paths.rootDir, tempRoot);
      assert.equal(calls[0].getGitHubApiToken(), 'plugin-token');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('fails the scheduled run when fetch or notification errors are returned', async () => {
    const tempRoot = createTempRoot();
    try {
      const paths = resolveSignalPaths(tempRoot);
      writeNotifications(paths);

      const registry = new ScheduleFactoryRegistry();
      registerSignalsScheduleFactories(registry);
      const factory = registry.getForPlugin('signals.auto-fetch', 'signals');
      assert.ok(factory);

      const spec = factory.createTaskSpec('schedule:signals:auto-fetch', {
        log: stubLog,
        signalsPaths: paths,
        runSignalFetchScheduler: async () =>
          successSummary({
            errors: [{ sourceId: 'openai-news-rss', code: 'RSS_FETCH_FAILED', message: 'boom' }],
          }),
      });

      await assert.rejects(
        () => spec.run.execute({ kind: 'signals:auto-fetch' }, 'signals:auto-fetch', {}),
        /openai-news-rss:RSS_FETCH_FAILED/,
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

describe('signals schedule activation and rehydration', () => {
  test('enable registers one task and rehydration restores it from capabilities', async () => {
    const tempRoot = createTempRoot();
    try {
      const paths = resolveSignalPaths(join(tempRoot, 'signals'));
      writeNotifications(paths);

      const manifest = signalsManifest();
      const registry = new ScheduleFactoryRegistry();
      registerSignalsScheduleFactories(registry);
      const capStore = makeCapabilitiesStore();
      const taskRunner = makeTaskRunner();
      const scheduleFactoryDeps = {
        log: stubLog,
        signalsPaths: paths,
        runSignalFetchScheduler: async () => successSummary(),
      };

      const activator = new PluginResourceActivator({
        resolveProjectRoot: () => tempRoot,
        pluginsDir: join(tempRoot, 'plugins'),
        limbRegistry: { register: async () => {}, deregister: () => {} },
        readCapabilities: () => capStore.read(),
        writeCapabilities: (config) => capStore.write(config),
        withCapabilityLock: async (fn) => fn(),
        scheduleFactoryRegistry: registry,
        taskRunner,
        scheduleFactoryDeps,
      });

      const result = await activator.enablePlugin(manifest);
      assert.equal(result.status, 'success');
      assert.equal(taskRunner.registered.length, 1);
      assert.equal(taskRunner.registered[0].id, 'schedule:signals:auto-fetch');

      const entry = capStore.get().capabilities[0];
      assert.equal(entry.id, 'plugin:signals:auto-fetch');
      assert.equal(entry.enabled, true);
      assert.equal(entry.scheduleTaskId, 'schedule:signals:auto-fetch');

      const rehydratedRunner = makeTaskRunner();
      await rehydrateEnabledPluginSchedules({
        capabilities: capStore.get(),
        pluginRegistry: { getManifest: (pluginId) => (pluginId === 'signals' ? manifest : undefined) },
        scheduleFactoryRegistry: registry,
        taskRunner: rehydratedRunner,
        scheduleFactoryDeps,
        log: stubLog,
      });

      assert.equal(rehydratedRunner.registered.length, 1);
      assert.equal(rehydratedRunner.registered[0].id, 'schedule:signals:auto-fetch');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

describe('signals schedule migration helpers', () => {
  test('one-time migration entries are idempotent and respect explicit disable marker', () => {
    const tempRoot = createTempRoot();
    try {
      const manifest = signalsManifest();
      const emptyCaps = { version: 1, capabilities: [] };

      assert.equal(shouldRunSignalsScheduleMigration(tempRoot, emptyCaps), true);
      const entries = buildSignalsMigrationEntries(manifest);
      assert.deepEqual(entries, [
        {
          id: 'plugin:signals:auto-fetch',
          type: 'schedule',
          enabled: true,
          source: 'cat-cafe',
          pluginId: 'signals',
          scheduleTaskId: 'schedule:signals:auto-fetch',
        },
      ]);

      const capsWithEntry = { version: 1, capabilities: entries };
      assert.equal(shouldRunSignalsScheduleMigration(tempRoot, capsWithEntry), false);

      markSignalsScheduleMigrationDone(tempRoot);
      assert.equal(
        existsSync(join(tempRoot, '.cat-cafe/f021-signals-schedule-migrated')),
        true,
        'migration marker should be persisted',
      );
      assert.equal(
        shouldRunSignalsScheduleMigration(tempRoot, emptyCaps),
        false,
        'marker must prevent re-enable after explicit disable removed the capability row',
      );
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
