import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const { TaskStore } = await import('../../dist/domains/cats/services/stores/ports/TaskStore.js');
const { createCiCdCheckTaskSpec } = await import('../../dist/infrastructure/email/CiCdCheckTaskSpec.js');

async function trackedTask(store) {
  return store.create({
    kind: 'pr_tracking',
    subjectKey: 'pr:owner/repo#7',
    threadId: 'thread_1',
    title: 'PR wait',
    ownerCatId: 'codex-sol',
    why: 'test',
    createdBy: 'codex-sol',
    userId: 'user_1',
    automationState: {
      await: {
        v: 1,
        generation: 1,
        subjectRef: 'pr:owner/repo#7',
        ownerFence: { kind: 'containing_task', generation: 1 },
        baseline: { capturedAt: 100, headSha: 'aaa' },
        continuation: {
          when: [{ kind: 'pr_ci_terminal' }],
          // biome-ignore lint/suspicious/noThenProperty: F280's frozen wait contract field.
          then: 'continue',
        },
        expiresAt: 10_000,
        createdAt: 100,
      },
    },
  });
}

describe('CI scheduler F280 adapter', () => {
  test('gate emits one work item per active PR wait', async () => {
    const taskStore = new TaskStore();
    await trackedTask(taskStore);
    const spec = createCiCdCheckTaskSpec({
      taskStore,
      cicdRouter: { route: async () => ({ kind: 'skipped', reason: 'state-only' }) },
      fetchPrStatus: async () => ({
        repoFullName: 'owner/repo',
        prNumber: 7,
        headSha: 'aaa',
        prState: 'open',
        aggregateBucket: 'pending',
        checks: [],
      }),
      log: { info() {}, warn() {}, error() {} },
    });
    const gate = await spec.admission.gate();
    assert.equal(gate.run, true);
    assert.equal(gate.workItems.length, 1);
  });

  test('gate keeps a terminal task reachable until durable world-truth effects complete', async () => {
    const taskStore = new TaskStore();
    const task = await trackedTask(taskStore);
    await taskStore.update(task.id, { status: 'done' });
    await taskStore.patchAutomationState(task.id, { ci: { prState: 'merged' } });
    const spec = createCiCdCheckTaskSpec({
      taskStore,
      cicdRouter: { route: async () => ({ kind: 'skipped', reason: 'state-only' }) },
      fetchPrStatus: async () => null,
      log: { info() {}, warn() {}, error() {} },
    });

    assert.equal((await spec.admission.gate()).run, true);

    await taskStore.patchAutomationState(task.id, {
      ci: { terminalEffects: { prState: 'merged', completedAt: 500 } },
    });
    assert.equal((await spec.admission.gate()).run, false);
  });

  test('gate keeps a completed wait collectable while a configured external case is still open', async () => {
    const taskStore = new TaskStore();
    const task = await trackedTask(taskStore);
    await taskStore.update(task.id, { status: 'done' });
    const continuationChecks = [];
    const spec = createCiCdCheckTaskSpec({
      taskStore,
      cicdRouter: { route: async () => ({ kind: 'skipped', reason: 'state-only' }) },
      fetchPrStatus: async () => null,
      continueDoneTracking: async (repoFullName, prNumber) => {
        continuationChecks.push({ repoFullName, prNumber });
        return true;
      },
      log: { info() {}, warn() {}, error() {} },
    });

    const gate = await spec.admission.gate();
    assert.equal(gate.run, true);
    assert.equal(gate.workItems.length, 1);
    assert.deepEqual(continuationChecks, [{ repoFullName: 'owner/repo', prNumber: 7 }]);
  });

  test('only a notified typed outcome invokes the owner', async () => {
    const taskStore = new TaskStore();
    const task = await trackedTask(taskStore);
    const calls = [];
    const spec = createCiCdCheckTaskSpec({
      taskStore,
      cicdRouter: {
        route: async () => ({
          kind: 'notified',
          threadId: 'thread_1',
          catId: 'codex-sol',
          messageId: 'msg_1',
          bucket: 'pass',
          content: 'compact wait',
        }),
      },
      fetchPrStatus: async () => ({
        repoFullName: 'owner/repo',
        prNumber: 7,
        headSha: 'aaa',
        prState: 'open',
        aggregateBucket: 'pass',
        checks: [],
      }),
      invokeTrigger: { trigger: async (...args) => calls.push(args) },
      log: { info() {}, warn() {}, error() {} },
    });
  }

  it('execute stays SILENT for CI pass with intent=review (review-wait noise)', async () => {
    const { createCiCdCheckTaskSpec } = await import('../../dist/infrastructure/email/CiCdCheckTaskSpec.js');
    const triggered = [];
    const spec = passSpec(createCiCdCheckTaskSpec, triggered, 'review');
    const gateResult = await spec.admission.gate({ taskId: 'cicd-check', lastRunAt: null, tickCount: 1 });
    assert.equal(gateResult.run, true);
    await spec.run.execute(gateResult.workItems[0].signal, 'pr:a/b#1', {});
    assert.equal(triggered.length, 0, 'intent=review → CI pass must not wake (noise)');
  });

  it('execute stays SILENT for CI pass when intent is absent (defaults to review)', async () => {
    const { createCiCdCheckTaskSpec } = await import('../../dist/infrastructure/email/CiCdCheckTaskSpec.js');
    const triggered = [];
    const spec = passSpec(createCiCdCheckTaskSpec, triggered, undefined); // no intent → default review
    const gateResult = await spec.admission.gate({ taskId: 'cicd-check', lastRunAt: null, tickCount: 1 });
    await spec.run.execute(gateResult.workItems[0].signal, 'pr:a/b#1', {});
    assert.equal(triggered.length, 0, 'absent intent defaults to review → silent');
  });

  it('execute WAKES for CI pass with intent=merge (action signal → merge-gate)', async () => {
    const { createCiCdCheckTaskSpec } = await import('../../dist/infrastructure/email/CiCdCheckTaskSpec.js');
    const triggered = [];
    const spec = passSpec(createCiCdCheckTaskSpec, triggered, 'merge');
    const gateResult = await spec.admission.gate({ taskId: 'cicd-check', lastRunAt: null, tickCount: 1 });
    await spec.run.execute(gateResult.workItems[0].signal, 'pr:a/b#1', {});
    assert.equal(triggered.length, 1, 'intent=merge → CI pass must wake');
    const policy = triggered[0][6];
    assert.equal(policy.priority, 'normal');
    assert.equal(policy.reason, 'github_ci_pass');
    assert.equal(policy.suggestedSkill, 'merge-gate');
    assert.equal(policy.eventDrivenExternalWaitCoverage, true);
  });

  it('execute triggers CI fail for default review intent without event-driven wait coverage', async () => {
    const { createCiCdCheckTaskSpec } = await import('../../dist/infrastructure/email/CiCdCheckTaskSpec.js');
    const triggered = [];
    const tasks = [mockTask({ repoFullName: 'a/b', prNumber: 1, userId: 'u1' })];
    const spec = createCiCdCheckTaskSpec({
      taskStore: mockTaskStore(tasks),
      cicdRouter: {
        route: async () => ({
          kind: 'notified',
          bucket: 'fail',
          threadId: 't1',
          catId: 'opus',
          messageId: 'm1',
          content: 'CI failed',
        }),
      },
      fetchPrStatus: async () => ({ checks: [], headSha: 'sha1', prNumber: 1, repoFullName: 'a/b' }),
      invokeTrigger: {
        trigger: (...args) => {
          triggered.push(args);
          return Promise.resolve();
        },
      },
      log: { info: () => {}, error: () => {}, warn: () => {} },
    });
    const gateResult = await spec.admission.gate({ taskId: 'cicd-check', lastRunAt: null, tickCount: 1 });
    await spec.run.execute(gateResult.workItems[0].signal, 'pr:a/b#1', {});
    assert.equal(triggered.length, 1);
    const policy = triggered[0][6];
    assert.equal(policy.priority, 'urgent');
    assert.equal(policy.reason, 'github_ci_failure');
    assert.notEqual(
      policy.eventDrivenExternalWaitCoverage,
      true,
      'review-intent CI failure must not claim pass-wakeup coverage',
    );
  });

  it('execute marks CI fail as event-driven covered only when intent=merge', async () => {
    const { createCiCdCheckTaskSpec } = await import('../../dist/infrastructure/email/CiCdCheckTaskSpec.js');
    const triggered = [];
    const tasks = [
      mockTask({ repoFullName: 'a/b', prNumber: 1, userId: 'u1' }, { automationState: { intent: 'merge' } }),
    ];
    const spec = createCiCdCheckTaskSpec({
      taskStore: mockTaskStore(tasks),
      cicdRouter: {
        route: async () => ({
          kind: 'notified',
          bucket: 'fail',
          threadId: 't1',
          catId: 'opus',
          messageId: 'm1',
          content: 'CI failed',
        }),
      },
      fetchPrStatus: async () => ({ checks: [], headSha: 'sha1', prNumber: 1, repoFullName: 'a/b' }),
      invokeTrigger: {
        trigger: (...args) => {
          triggered.push(args);
          return Promise.resolve();
        },
      },
      log: { info: () => {}, error: () => {}, warn: () => {} },
    });
    const gateResult = await spec.admission.gate({ taskId: 'cicd-check', lastRunAt: null, tickCount: 1 });
    await spec.run.execute(gateResult.workItems[0].signal, 'pr:a/b#1', {});
    assert.equal(triggered.length, 1);
    const policy = triggered[0][6];
    assert.equal(policy.priority, 'urgent');
    assert.equal(policy.reason, 'github_ci_failure');
    assert.equal(policy.eventDrivenExternalWaitCoverage, true);
  });

  it('gate filters out ci.enabled=false', async () => {
    const { createCiCdCheckTaskSpec } = await import('../../dist/infrastructure/email/CiCdCheckTaskSpec.js');
    const tasks = [
      mockTask({ repoFullName: 'a/b', prNumber: 1 }),
      mockTask({ repoFullName: 'c/d', prNumber: 2, ciTrackingEnabled: false }),
    ];
    const spec = createCiCdCheckTaskSpec({
      taskStore: mockTaskStore(tasks),
      cicdRouter: { route: async () => ({ kind: 'noop' }) },
      log: { info: () => {}, error: () => {}, warn: () => {} },
    });
    const result = await spec.admission.gate({ taskId: 'cicd-check', lastRunAt: null, tickCount: 1 });
    assert.equal(result.run, true);
    assert.equal(result.workItems.length, 1);
  });
});
