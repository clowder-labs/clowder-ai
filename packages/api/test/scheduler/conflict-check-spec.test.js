import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const { TaskStore } = await import('../../dist/domains/cats/services/stores/ports/TaskStore.js');
const { createConflictCheckTaskSpec } = await import('../../dist/infrastructure/email/ConflictCheckTaskSpec.js');

describe('conflict scheduler F280 adapter', () => {
  test('collects merge state for active PR tasks', async () => {
    const taskStore = new TaskStore();
    await taskStore.create({
      kind: 'pr_tracking',
      subjectKey: 'pr:owner/repo#7',
      threadId: 'thread_1',
      title: 'PR wait',
      ownerCatId: 'codex-sol',
      why: 'test',
      createdBy: 'codex-sol',
      userId: 'user_1',
    });
    const spec = createConflictCheckTaskSpec({
      taskStore,
      checkMergeable: async () => ({ mergeState: 'MERGEABLE', headSha: 'aaa' }),
      conflictRouter: { route: async () => ({ kind: 'skipped', reason: 'state-only' }) },
      log: { info() {}, warn() {}, error() {} },
    });
    const gate = await spec.admission.gate();
    assert.equal(gate.run, true);
    assert.equal(gate.workItems[0].signal.signal.mergeState, 'MERGEABLE');
  });

  test('does not invoke when typed wait remains state-only', async () => {
    const calls = [];
    const spec = createConflictCheckTaskSpec({
      taskStore: new TaskStore(),
      checkMergeable: async () => ({ mergeState: 'CONFLICTING', headSha: 'aaa' }),
      conflictRouter: { route: async () => ({ kind: 'skipped', reason: 'predicates_not_matched' }) },
      invokeTrigger: { trigger: async (...args) => calls.push(args) },
      log: { info() {}, warn() {}, error() {} },
    });
    await spec.run.execute(
      {
        signal: { repoFullName: 'owner/repo', prNumber: 7, headSha: 'aaa', mergeState: 'CONFLICTING' },
        task: { userId: 'user_1' },
      },
      conflictRouter: router,
      log: noopLog,
    });
    const result = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(callCount, 2);
    assert.equal(result.run, true);
    assert.equal(result.workItems.length, 1);
    assert.equal(result.workItems[0].subjectKey, 'pr:c/d#2');
  });

  it('execute delegates to ConflictRouter and triggers on notified (AC-A2)', async () => {
    const { createConflictCheckTaskSpec } = await import('../../dist/infrastructure/email/ConflictCheckTaskSpec.js');
    const routerCalls = [];
    const triggerCalls = [];
    const mockRouter = {
      async route(signal) {
        routerCalls.push(signal);
        return { kind: 'notified', threadId: 'th-1', catId: 'opus', messageId: 'msg-1', content: 'conflict msg' };
      },
    };
    const mockTrigger = {
      trigger(...args) {
        triggerCalls.push(args);
        return Promise.resolve();
      },
    };
    const spec = createConflictCheckTaskSpec({
      taskStore: mockTaskStore([]),
      checkMergeable: async () => ({ mergeState: 'CONFLICTING', headSha: 'sha1' }),
      conflictRouter: mockRouter,
      invokeTrigger: mockTrigger,
      log: noopLog,
    });
    const workItem = {
      signal: { repoFullName: 'owner/repo', prNumber: 42, headSha: 'sha1', mergeState: 'CONFLICTING' },
      task: mockTask({ repoFullName: 'owner/repo', prNumber: 42, userId: 'u-1' }),
    };
    await spec.run.execute(workItem, 'pr:owner/repo#42');
    assert.equal(routerCalls.length, 1);
    assert.equal(triggerCalls.length, 1);
    assert.equal(triggerCalls[0][0], 'th-1'); // threadId
    assert.equal(triggerCalls[0][1], 'opus'); // catId
    assert.equal(triggerCalls[0][6].priority, 'urgent');
    assert.equal(triggerCalls[0][6].reason, 'github_pr_conflict');
    assert.notEqual(
      triggerCalls[0][6].eventDrivenExternalWaitCoverage,
      true,
      'conflict wake must not claim follow-up callback coverage',
    );
  });

  it('execute does not trigger when router skips', async () => {
    const { createConflictCheckTaskSpec } = await import('../../dist/infrastructure/email/ConflictCheckTaskSpec.js');
    const triggerCalls = [];
    const mockRouter = {
      async route() {
        return { kind: 'skipped', reason: 'not conflicting' };
      },
    };
    const mockTrigger = {
      trigger(...args) {
        triggerCalls.push(args);
        return Promise.resolve();
      },
    };
    const spec = createConflictCheckTaskSpec({
      taskStore: mockTaskStore([]),
      checkMergeable: async () => ({ mergeState: 'MERGEABLE', headSha: 'sha1' }),
      conflictRouter: mockRouter,
      invokeTrigger: mockTrigger,
      log: noopLog,
    });
    const workItem = {
      signal: { repoFullName: 'owner/repo', prNumber: 42, headSha: 'sha1', mergeState: 'MERGEABLE' },
      task: mockTask({ repoFullName: 'owner/repo', prNumber: 42, userId: 'u-1' }),
    };
    await spec.run.execute(workItem, 'pr:owner/repo#42');
    assert.equal(triggerCalls.length, 0);
  });
});
