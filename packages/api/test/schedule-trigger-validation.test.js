import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import Fastify from 'fastify';

const { scheduleRoutes } = await import('../dist/routes/schedule.js');
const { TaskRunnerV2 } = await import('../dist/infrastructure/scheduler/TaskRunnerV2.js');

function createTemplate(templateId = 'reminder') {
  return {
    templateId,
    label: '提醒',
    category: 'system',
    description: '提醒任务',
    defaultTrigger: { type: 'cron', expression: '0 9 * * *' },
    paramSchema: {},
    createSpec(instanceId, p) {
      return {
        id: instanceId,
        profile: 'awareness',
        trigger: p.trigger,
        admission: {
          async gate() {
            return { run: false, reason: 'test-only' };
          },
        },
        run: {
          overlap: 'skip',
          timeoutMs: 1_000,
          async execute() {},
        },
        state: { runLedger: 'sqlite' },
        outcome: { whenNoSignal: 'record' },
        enabled: () => true,
        display: { label: '提醒', category: 'system' },
      };
    },
  };
}

function createDynamicTaskStore() {
  const defs = [];
  return {
    defs,
    insert(def) {
      defs.push(structuredClone(def));
    },
    remove() {
      return false;
    },
    setEnabled() {
      return false;
    },
    getById() {
      return null;
    },
    getAll() {
      return defs.slice();
    },
  };
}

function createTaskRunnerStub() {
  const registered = [];
  return {
    registered,
    registerDynamic(spec, dynamicDefId) {
      registered.push({ spec, dynamicDefId });
    },
    unregister() {
      return true;
    },
    getRegisteredTasks() {
      return registered.map((entry) => entry.spec.id);
    },
    getTaskSummaries() {
      return registered.map((entry) => ({
        id: entry.spec.id,
        profile: entry.spec.profile,
        trigger: entry.spec.trigger,
        enabled: true,
        effectiveEnabled: true,
        lastRun: null,
        runStats: { total: 0, delivered: 0, failed: 0, skipped: 0 },
        display: entry.spec.display,
        subjectPreview: null,
        source: 'dynamic',
        dynamicTaskId: entry.dynamicDefId,
      }));
    },
    getLedger() {
      return {
        query() {
          return [];
        },
        queryBySubject() {
          return [];
        },
      };
    },
    async triggerNow() {},
    setDynamicEnabled() {
      return false;
    },
  };
}

async function createApp() {
  const taskRunner = createTaskRunnerStub();
  const dynamicTaskStore = createDynamicTaskStore();
  const templateRegistry = {
    get(id) {
      return id === 'reminder' ? createTemplate(id) : null;
    },
    list() {
      return [createTemplate('reminder')];
    },
  };
  const app = Fastify({ logger: false });
  await app.register(scheduleRoutes, {
    taskRunner,
    dynamicTaskStore,
    templateRegistry,
  });
  await app.ready();
  return { app, taskRunner, dynamicTaskStore };
}

function createRunner() {
  const ledger = {
    query: () => [],
    stats: () => ({ total: 0, delivered: 0, failed: 0, skipped: 0 }),
    record: () => {},
  };
  return new TaskRunnerV2({
    logger: { info: () => {}, error: () => {} },
    ledger,
  });
}

describe('schedule trigger validation', () => {
  test('POST /api/schedule/tasks normalizes once delayMs into fireAt', async () => {
    const { app, dynamicTaskStore, taskRunner } = await createApp();

    const before = Date.now();
    const response = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'default-user',
      },
      payload: {
        templateId: 'reminder',
        trigger: { type: 'once', delayMs: 60_000 },
        params: { message: 'one shot' },
        deliveryThreadId: 'thread-test',
      },
    });
    const after = Date.now();

    assert.equal(response.statusCode, 200);
    assert.equal(taskRunner.registered.length, 1);
    assert.equal(taskRunner.registered[0].spec.trigger.type, 'once');
    assert.equal(dynamicTaskStore.defs.length, 1);
    assert.equal(dynamicTaskStore.defs[0].trigger.type, 'once');
    assert.equal(typeof dynamicTaskStore.defs[0].trigger.fireAt, 'number');
    assert.ok(dynamicTaskStore.defs[0].trigger.fireAt >= before + 60_000);
    assert.ok(dynamicTaskStore.defs[0].trigger.fireAt <= after + 60_000 + 50);

    await app.close();
  });

  test('POST /api/schedule/tasks rejects interval trigger without ms', async () => {
    const { app, taskRunner } = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'default-user',
      },
      payload: {
        templateId: 'reminder',
        trigger: { type: 'interval' },
        params: { message: 'bad interval' },
        deliveryThreadId: 'thread-test',
      },
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.body, /interval trigger ms/i);
    assert.equal(taskRunner.registered.length, 0);

    await app.close();
  });

  test('POST /api/schedule/tasks/preview rejects interval trigger below minimum 10s', async () => {
    const { app, taskRunner } = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks/preview',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'default-user',
      },
      payload: {
        templateId: 'reminder',
        trigger: { type: 'interval', ms: 5_000 },
        params: { message: 'too fast' },
        deliveryThreadId: 'thread-test',
      },
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.body, /interval trigger ms must be a finite number >= 10000/i);
    assert.equal(taskRunner.registered.length, 0);

    await app.close();
  });

  test('POST /api/schedule/tasks rejects once trigger with delayMs below 1s', async () => {
    const { app, taskRunner } = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'default-user',
      },
      payload: {
        templateId: 'reminder',
        trigger: { type: 'once', delayMs: 500 },
        params: { message: 'too soon' },
        deliveryThreadId: 'thread-test',
      },
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.body, /once trigger delayMs must be a finite number >= 1000/i);
    assert.equal(taskRunner.registered.length, 0);

    await app.close();
  });

  test('POST /api/schedule/tasks rejects once trigger with past fireAt', async () => {
    const { app, taskRunner } = await createApp();

    const response = await app.inject({
      method: 'POST',
      url: '/api/schedule/tasks',
      headers: {
        'content-type': 'application/json',
        'x-office-claw-user': 'default-user',
      },
      payload: {
        templateId: 'reminder',
        trigger: { type: 'once', fireAt: Date.now() - 60_000 },
        params: { message: 'already passed' },
        deliveryThreadId: 'thread-test',
      },
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.body, /once trigger fireAt must be a finite epoch ms in the future/i);
    assert.equal(taskRunner.registered.length, 0);

    await app.close();
  });

  test('TaskRunnerV2 throws for invalid interval trigger instead of scheduling undefined ms', () => {
    const runner = createRunner();
    runner.register({
      id: 'bad-interval',
      profile: 'awareness',
      trigger: { type: 'interval' },
      admission: {
        async gate() {
          return { run: false, reason: 'test-only' };
        },
      },
      run: {
        overlap: 'skip',
        timeoutMs: 1_000,
        async execute() {},
      },
      state: { runLedger: 'sqlite' },
      outcome: { whenNoSignal: 'record' },
      enabled: () => true,
    });

    assert.throws(() => runner.start(), /interval trigger ms must be a finite number >= 10000/);
  });
});
