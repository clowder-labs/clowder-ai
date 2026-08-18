import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const { TaskStore } = await import('../../dist/domains/cats/services/stores/ports/TaskStore.js');
const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');

async function createTracked(store) {
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
      review: { lastInlineCommentCursor: 10, lastConversationCommentCursor: 20, lastDecisionCursor: 30 },
      await: {
        v: 1,
        generation: 1,
        subjectRef: 'pr:owner/repo#7',
        ownerFence: { kind: 'containing_task', generation: 1 },
        baseline: {
          capturedAt: 100,
          headSha: 'aaa',
          review: { inlineCommentCursor: 10, conversationCommentCursor: 20, decisionCursor: 30 },
        },
        continuation: {
          when: [{ kind: 'pr_review_decision_changed' }],
          // biome-ignore lint/suspicious/noThenProperty: F280's frozen wait contract field.
          then: 'continue',
        },
        expiresAt: Date.now() + 60_000,
        createdAt: 100,
      },
    },
  });
}

function options(taskStore, router, overrides = {}) {
  return {
    taskStore,
    fetchPrMetadata: async () => ({ headSha: 'aaa', prState: 'open' }),
    fetchComments: async () => [],
    fetchReviews: async () => [],
    reviewFeedbackRouter: router,
    log: { info() {}, warn() {}, error() {} },
    ...overrides,
  };
}

describe('review scheduler F280 adapter', () => {
  test('current facts are evaluated even when no raw source body is deliverable', async () => {
    const taskStore = new TaskStore();
    await createTracked(taskStore);
    const spec = createReviewFeedbackTaskSpec(
      options(taskStore, { route: async () => ({ kind: 'skipped', reason: 'not matched' }) }),
    );
    const gate = await spec.admission.gate();
    assert.equal(gate.run, true);
    assert.equal(gate.workItems.length, 1);
  });

  test('only router-confirmed typed outcome invokes with the unified reason', async () => {
    const taskStore = new TaskStore();
    await createTracked(taskStore);
    const calls = [];
    const spec = createReviewFeedbackTaskSpec(
      options(
        taskStore,
        {
          route: async () => ({
            kind: 'notified',
            threadId: 'thread_1',
            catId: 'codex-sol',
            messageId: 'msg_1',
            content: 'compact wait',
          }),
        },
        {
          fetchReviews: async () => [
            {
              id: 31,
              author: 'reviewer',
              state: 'APPROVED',
              body: 'SOURCE',
              submittedAt: '2026-07-30T00:00:00Z',
              commitId: 'aaa',
            },
          ],
          invokeTrigger: { trigger: async (...args) => calls.push(args) },
        },
      ),
    );
    const gate = await spec.admission.gate();
    assert.equal(gate.run, true);
    await spec.run.execute(gate.workItems[0].signal, gate.workItems[0].subjectKey, {});
    assert.equal(calls.length, 1);
    assert.equal(calls[0][6].reason, 'github_wait_satisfied');
    assert.equal(calls[0][6].suggestedSkill, undefined);
  });

  test('plain @codex review advances the source frontier without forcing invocation', async () => {
    const taskStore = new TaskStore();
    const task = await createTracked(taskStore);
    const calls = [];
    const spec = createReviewFeedbackTaskSpec(
      options(
        taskStore,
        { route: async () => ({ kind: 'skipped', reason: 'predicates_not_matched' }) },
        {
          fetchComments: async () => [
            {
              id: 21,
              author: 'human',
              body: '@codex review',
              createdAt: '2026-07-30T00:00:00Z',
              commentType: 'conversation',
            },
          ],
          invokeTrigger: { trigger: async (...args) => calls.push(args) },
        },
      ),
    );
    const gate = await spec.admission.gate();
    await spec.run.execute(gate.workItems[0].signal, gate.workItems[0].subjectKey, {});
    assert.equal(calls.length, 0);
    assert.equal((await taskStore.get(task.id)).automationState.review.lastConversationCommentCursor, 21);
  });

  test('PR terminal truth is routed through the wait lifecycle even when CI collection is unavailable', async () => {
    const taskStore = new TaskStore();
    await createTracked(taskStore);
    const routerCalls = [];
    const triggerCalls = [];
    const spec = createReviewFeedbackTaskSpec(
      options(
        taskStore,
        {
          route: async (signal) => {
            routerCalls.push(signal);
            return {
              kind: 'notified',
              threadId: 'thread_1',
              catId: 'codex-sol',
              messageId: 'terminal_msg',
              content: 'compact terminal wait',
            };
          },
        },
        {
          fetchPrMetadata: async () => ({ headSha: 'aaa', prState: 'merged' }),
          invokeTrigger: { trigger: async (...args) => triggerCalls.push(args) },
        },
      ),
    );

    const gate = await spec.admission.gate();
    assert.equal(gate.run, true);
    assert.equal(gate.workItems.length, 1);
    assert.equal(gate.workItems[0].signal.subjectState, 'merged');
    await spec.run.execute(gate.workItems[0].signal, gate.workItems[0].subjectKey, {});
    assert.equal(routerCalls.length, 1);
    assert.equal(triggerCalls.length, 1);
    assert.equal(triggerCalls[0][6].priority, 'normal');
  });

  it('execute scopes review-feedback coalescing by target cat when PR ownership changes', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter();
    const triggerCalls = [];
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([]),
      fetchComments: async () => [],
      fetchReviews: async () => [],
      reviewFeedbackRouter: router,
      invokeTrigger: {
        trigger(...args) {
          triggerCalls.push(args);
        },
      },
      log: noopLog,
    });

    const baseSignal = {
      repoFullName: 'owner/repo',
      prNumber: 42,
      newComments: [{ id: 1, author: 'alice', body: 'hi', createdAt: '2026-01-01', commentType: 'conversation' }],
      newDecisions: [],
      commitCursor: () => {},
    };

    await spec.run.execute({ ...baseSignal, repairedTask: mockTaskItem }, 'pr:owner/repo#42');
    await spec.run.execute(
      {
        ...baseSignal,
        repairedTask: mockTask({
          repoFullName: 'owner/repo',
          prNumber: 42,
          catId: 'codex',
          threadId: 'th-1',
          userId: 'u-1',
        }),
      },
      'pr:owner/repo#42',
    );

    assert.equal(triggerCalls.length, 2);
    assert.equal(triggerCalls[0][6].coalesceKey, 'pr:owner/repo#42:review-feedback:opus');
    assert.equal(triggerCalls[1][6].coalesceKey, 'pr:owner/repo#42:review-feedback:codex');
  });

  it('execute uses urgent priority for CHANGES_REQUESTED', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter();
    const triggerCalls = [];
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([]),
      fetchComments: async () => [],
      fetchReviews: async () => [],
      reviewFeedbackRouter: router,
      invokeTrigger: {
        trigger(...args) {
          triggerCalls.push(args);
        },
      },
      log: noopLog,
    });

    const signal = {
      repairedTask: mockTaskItem,
      repoFullName: 'owner/repo',
      prNumber: 42,
      newComments: [],
      newDecisions: [{ id: 1, author: 'bob', state: 'CHANGES_REQUESTED', body: 'fix it', submittedAt: '2026-01-01' }],
      commitCursor: () => {},
    };
    await spec.run.execute(signal, 'pr:owner/repo#42');

    assert.equal(triggerCalls[0][6].priority, 'urgent');
  });

  it('gate filters out echo comments via isEchoComment predicate', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter();
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([mockTaskItem]),
      fetchComments: async () => [
        {
          id: 1,
          author: 'zts212653',
          body: '@codex review\n\nPlease review latest commit abc123',
          createdAt: '2026-01-01',
          commentType: 'conversation',
        },
        {
          id: 2,
          author: 'alice',
          body: 'Looks good, minor nit on line 42',
          createdAt: '2026-01-01',
          commentType: 'conversation',
        },
      ],
      fetchReviews: async () => [],
      reviewFeedbackRouter: router,
      log: noopLog,
      isEchoComment: (c) => /^@\w+\s+review\b/i.test(c.body),
    });
    const result = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(result.run, true);
    assert.equal(result.workItems[0].signal.newComments.length, 1);
    assert.equal(result.workItems[0].signal.newComments[0].author, 'alice');
  });

  it('gate skips PR entirely when all comments are echo', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter();
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([mockTaskItem]),
      fetchComments: async () => [
        {
          id: 1,
          author: 'zts212653',
          body: '@codex review\n\nPlease review latest commit abc123',
          createdAt: '2026-01-01',
          commentType: 'conversation',
        },
      ],
      fetchReviews: async () => [],
      reviewFeedbackRouter: router,
      log: noopLog,
      isEchoComment: (c) => /^@\w+\s+review\b/i.test(c.body),
    });
    const result = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(result.run, false);
  });

  it('echo filter still advances cursor for filtered comments', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter();
    let fetchCount = 0;
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([mockTaskItem]),
      fetchComments: async () => {
        fetchCount++;
        return [
          {
            id: 10,
            author: 'zts212653',
            body: '@codex review\n\nPlease review abc',
            createdAt: '2026-01-01',
            commentType: 'conversation',
          },
        ];
      },
      fetchReviews: async () => [],
      reviewFeedbackRouter: router,
      log: noopLog,
      isEchoComment: (c) => /^@\w+\s+review\b/i.test(c.body),
    });

    // First gate: echo comment filtered, run=false, but cursor should advance past it
    const r1 = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(r1.run, false);

    // Second gate: same echo comment should not reappear (cursor advanced)
    const r2 = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 2 });
    assert.equal(r2.run, false);
  });

  it('echo filter with author check does not filter external reviewer comments (P1 regression)', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter();
    const selfLogin = 'zts212653';
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([mockTaskItem]),
      fetchComments: async () => [
        {
          id: 1,
          author: 'external-reviewer',
          body: '@opus review this PR please',
          createdAt: '2026-01-01',
          commentType: 'conversation',
        },
        {
          id: 2,
          author: selfLogin,
          body: '@codex review\n\nPlease review latest commit abc123',
          createdAt: '2026-01-01',
          commentType: 'conversation',
        },
      ],
      fetchReviews: async () => [],
      reviewFeedbackRouter: router,
      log: noopLog,
      // Author + body: only OUR account's trigger comments are echo
      isEchoComment: (c) =>
        c.author === selfLogin && c.commentType === 'conversation' && /^@\w+\s+review\b/i.test(c.body),
    });
    const result = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(result.run, true);
    // External reviewer's comment MUST pass through — not filtered
    assert.equal(result.workItems[0].signal.newComments.length, 1);
    assert.equal(result.workItems[0].signal.newComments[0].author, 'external-reviewer');
  });

  // ── F140 Phase E.1 Task 4: isNoiseComment option ───────────────

  it('gate filters bot setup-only noise via isNoiseComment; human inline preserved', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter();
    const bots = new Set(['chatgpt-codex-connector[bot]']);
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([mockTaskItem]),
      fetchComments: async () => [
        {
          id: 1,
          author: 'chatgpt-codex-connector[bot]',
          body: 'To use Codex here, create an environment for this repo.',
          createdAt: '2026-04-24',
          commentType: 'conversation',
        },
        {
          id: 2,
          author: 'octocat',
          body: '[P1] real finding on line 42',
          createdAt: '2026-04-24',
          commentType: 'inline',
          filePath: 'src/foo.ts',
          line: 42,
        },
      ],
      fetchReviews: async () => [],
      reviewFeedbackRouter: router,
      log: noopLog,
      isNoiseComment: (c) => {
        if (c.commentType !== 'conversation') return false;
        if (!bots.has(c.author)) return false;
        return (
          /to use codex here,/i.test(c.body) &&
          /environment for this repo\b/i.test(c.body) &&
          !/\bcodex review\b/i.test(c.body)
        );
      },
    });
    const result = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(result.run, true);
    assert.equal(result.workItems[0].signal.newComments.length, 1);
    assert.equal(result.workItems[0].signal.newComments[0].author, 'octocat');
  });

  it('isNoiseComment does NOT filter human quoting setup sentence (P1-1 guard)', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter();
    const bots = new Set(['chatgpt-codex-connector[bot]']);
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([mockTaskItem]),
      fetchComments: async () => [
        {
          id: 1,
          author: 'octocat',
          body: 'Quoting previous bot: To use Codex here, create an environment for this repo. FYI.',
          createdAt: '2026-04-24',
          commentType: 'conversation',
        },
      ],
      fetchReviews: async () => [],
      reviewFeedbackRouter: router,
      log: noopLog,
      isNoiseComment: (c) => {
        if (c.commentType !== 'conversation') return false;
        if (!bots.has(c.author)) return false;
        return (
          /to use codex here,/i.test(c.body) &&
          /environment for this repo\b/i.test(c.body) &&
          !/\bcodex review\b/i.test(c.body)
        );
      },
    });
    const result = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(result.run, true);
    assert.equal(result.workItems[0].signal.newComments.length, 1, 'human quote must pass through');
    assert.equal(result.workItems[0].signal.newComments[0].author, 'octocat');
  });

  it('isNoiseComment: all-skip of pure bot setup-only advances cursor', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter();
    const bots = new Set(['chatgpt-codex-connector[bot]']);
    let fetchCount = 0;
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([mockTaskItem]),
      fetchComments: async () => {
        fetchCount++;
        return [
          {
            id: 99,
            author: 'chatgpt-codex-connector[bot]',
            body: 'To use Codex here, create an environment for this repo.',
            createdAt: '2026-04-24',
            commentType: 'conversation',
          },
        ];
      },
      fetchReviews: async () => [],
      reviewFeedbackRouter: router,
      log: noopLog,
      isNoiseComment: (c) => {
        if (c.commentType !== 'conversation') return false;
        if (!bots.has(c.author)) return false;
        return (
          /to use codex here,/i.test(c.body) &&
          /environment for this repo\b/i.test(c.body) &&
          !/\bcodex review\b/i.test(c.body)
        );
      },
    });

    // First gate: all noise → run=false, cursor should advance (persistFirst)
    const r1 = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(r1.run, false, 'all filtered → run=false');

    // Second gate: same comment won't re-trigger (cursor is past it)
    const r2 = await spec.admission.gate({ taskId: spec.id, lastRunAt: Date.now(), tickCount: 2 });
    assert.equal(r2.run, false, 'cursor must not stall');
    assert.equal(fetchCount, 2, 'fetch ran twice but second gate still run=false');
  });

  it('execute does not commit cursor when router skips', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter('skipped');
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([]),
      fetchComments: async () => [],
      fetchReviews: async () => [],
      reviewFeedbackRouter: router,
      log: noopLog,
    });

    let cursorCommitted = false;
    const signal = {
      repairedTask: mockTaskItem,
      repoFullName: 'owner/repo',
      prNumber: 42,
      newComments: [],
      newDecisions: [],
      commitCursor: () => {
        cursorCommitted = true;
      },
    };
    await spec.run.execute(signal, 'pr:owner/repo#42');

    assert.equal(cursorCommitted, false, 'cursor should not advance when delivery skipped');
  });

  // ── F140 double-consume fix: shared feedback filter tests ──

  it('self-authored ordinary comment is filtered (Rule A)', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter();
    const self = 'zts212653';
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([mockTaskItem]),
      fetchComments: async () => [
        { id: 1, author: self, body: 'LGTM, looks good to me', createdAt: '2026-01-01', commentType: 'conversation' },
        { id: 2, author: 'alice', body: 'Please fix the typo', createdAt: '2026-01-01', commentType: 'conversation' },
      ],
      fetchReviews: async () => [],
      reviewFeedbackRouter: router,
      log: noopLog,
      isEchoComment: (c) => c.author === self,
    });
    const result = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(result.run, true);
    assert.equal(result.workItems[0].signal.newComments.length, 1);
    assert.equal(result.workItems[0].signal.newComments[0].author, 'alice');
  });

  it('self-authored review decision is filtered (Rule A + isEchoReview)', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter();
    const self = 'zts212653';
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([mockTaskItem]),
      fetchComments: async () => [],
      fetchReviews: async () => [
        { id: 1, author: self, state: 'COMMENTED', body: 'Looks fine', submittedAt: '2026-01-01' },
        { id: 2, author: 'bob', state: 'APPROVED', body: 'Ship it', submittedAt: '2026-01-01' },
      ],
      reviewFeedbackRouter: router,
      log: noopLog,
      isEchoReview: (r) => r.author === self,
    });
    const result = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(result.run, true);
    assert.equal(result.workItems[0].signal.newDecisions.length, 1);
    assert.equal(result.workItems[0].signal.newDecisions[0].author, 'bob');
  });

  it('external human "@opus review ..." is NOT filtered (Rule A negative)', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter();
    const self = 'zts212653';
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([mockTaskItem]),
      fetchComments: async () => [
        {
          id: 1,
          author: 'external-dev',
          body: '@opus review this change',
          createdAt: '2026-01-01',
          commentType: 'conversation',
        },
      ],
      fetchReviews: async () => [],
      reviewFeedbackRouter: router,
      log: noopLog,
      isEchoComment: (c) => c.author === self,
    });
    const result = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(result.run, true);
    assert.equal(result.workItems[0].signal.newComments.length, 1);
    assert.equal(result.workItems[0].signal.newComments[0].author, 'external-dev');
  });

  it('isEcho predicates can filter all-bot batches (custom predicate, post-E.2)', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter();
    const bot = 'chatgpt-codex-connector[bot]';
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([mockTaskItem]),
      fetchComments: async () => [
        {
          id: 1,
          author: bot,
          body: "Codex Review: Didn't find any major issues.",
          createdAt: '2026-01-01',
          commentType: 'conversation',
        },
      ],
      fetchReviews: async () => [
        { id: 1, author: bot, state: 'COMMENTED', body: 'Codex Review', submittedAt: '2026-01-01' },
      ],
      reviewFeedbackRouter: router,
      log: noopLog,
      isEchoComment: (c) => c.author === bot,
      isEchoReview: (r) => r.author === bot,
    });
    const result = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(result.run, false, 'all-bot batch should be skipped');
  });

  // ── F140 Phase C: review intent routing ──

  it('CHANGES_REQUESTED triggers with suggestedSkill=receive-review (Phase C)', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const triggered = [];
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([mockTaskItem]),
      fetchComments: async () => [],
      fetchReviews: async () => [
        { id: 1, author: 'reviewer', state: 'CHANGES_REQUESTED', body: 'Fix the bug', submittedAt: '2026-01-01' },
      ],
      reviewFeedbackRouter: {
        async route() {
          return { kind: 'notified', threadId: 't1', catId: 'opus', messageId: 'm1', content: 'review' };
        },
      },
      invokeTrigger: {
        trigger: (...args) => {
          triggered.push(args);
          return Promise.resolve();
        },
      },
      log: noopLog,
    });
    const gateResult = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(gateResult.run, true);
    await spec.run.execute(gateResult.workItems[0].signal, 'pr:owner/repo#42', {});
    assert.equal(triggered.length, 1);
    const policy = triggered[0][6];
    assert.equal(policy.priority, 'urgent');
    assert.equal(policy.suggestedSkill, 'receive-review');
  });

  it('APPROVED triggers with suggestedSkill=merge-gate (Phase C)', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const triggered = [];
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([mockTaskItem]),
      fetchComments: async () => [],
      fetchReviews: async () => [
        { id: 1, author: 'reviewer', state: 'APPROVED', body: 'LGTM', submittedAt: '2026-01-01' },
      ],
      reviewFeedbackRouter: {
        async route() {
          return { kind: 'notified', threadId: 't1', catId: 'opus', messageId: 'm1', content: 'approved' };
        },
      },
      invokeTrigger: {
        trigger: (...args) => {
          triggered.push(args);
          return Promise.resolve();
        },
      },
      log: noopLog,
    });
    const gateResult = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(gateResult.run, true);
    await spec.run.execute(gateResult.workItems[0].signal, 'pr:owner/repo#42', {});
    assert.equal(triggered.length, 1);
    const policy = triggered[0][6];
    assert.equal(policy.priority, 'normal');
    assert.equal(policy.suggestedSkill, 'merge-gate');
    assert.notEqual(
      policy.eventDrivenExternalWaitCoverage,
      true,
      'review-intent approval wake must not claim CI-pass callback coverage',
    );
  });

  it('APPROVED merge-intent wake grants event-driven wait coverage (Phase C)', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const triggered = [];
    const mergeIntentTask = mockTask(
      {
        repoFullName: 'owner/repo',
        prNumber: 42,
        catId: 'opus',
        threadId: 'th-1',
        userId: 'u-1',
      },
      { automationState: { intent: 'merge' } },
    );
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([mergeIntentTask]),
      fetchComments: async () => [],
      fetchReviews: async () => [
        { id: 1, author: 'reviewer', state: 'APPROVED', body: 'LGTM', submittedAt: '2026-01-01' },
      ],
      reviewFeedbackRouter: {
        async route() {
          return { kind: 'notified', threadId: 't1', catId: 'opus', messageId: 'm1', content: 'approved' };
        },
      },
      invokeTrigger: {
        trigger: (...args) => {
          triggered.push(args);
          return Promise.resolve();
        },
      },
      log: noopLog,
    });
    const gateResult = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(gateResult.run, true);
    await spec.run.execute(gateResult.workItems[0].signal, 'pr:owner/repo#42', {});
    assert.equal(triggered.length, 1);
    const policy = triggered[0][6];
    assert.equal(policy.priority, 'normal');
    assert.equal(policy.suggestedSkill, 'merge-gate');
    assert.equal(policy.eventDrivenExternalWaitCoverage, true);
  });

  it('COMMENTED-only triggers with no suggestedSkill (Phase C)', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const triggered = [];
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([mockTaskItem]),
      fetchComments: async () => [],
      fetchReviews: async () => [
        { id: 1, author: 'reviewer', state: 'COMMENTED', body: 'Interesting approach', submittedAt: '2026-01-01' },
      ],
      reviewFeedbackRouter: {
        async route() {
          return { kind: 'notified', threadId: 't1', catId: 'opus', messageId: 'm1', content: 'comment' };
        },
      },
      invokeTrigger: {
        trigger: (...args) => {
          triggered.push(args);
          return Promise.resolve();
        },
      },
      log: noopLog,
    });
    const gateResult = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(gateResult.run, true);
    await spec.run.execute(gateResult.workItems[0].signal, 'pr:owner/repo#42', {});
    assert.equal(triggered.length, 1);
    const policy = triggered[0][6];
    assert.equal(policy.priority, 'normal');
    assert.equal(policy.suggestedSkill, undefined);
  });

  // ── #406: restart cursor persistence ──

  it('gate seeds cursor from automationState.review on fresh instance (#406)', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter();
    // Task has persisted cursor at comment=5, decision=3
    const taskWithCursors = mockTask(
      { repoFullName: 'owner/repo', prNumber: 42, catId: 'opus', threadId: 'th-1', userId: 'u-1' },
      {
        automationState: {
          review: { lastCommentCursor: 5, lastDecisionCursor: 3 },
        },
      },
    );
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([taskWithCursors]),
      // Comments with id <= 5 should be skipped (below persisted cursor)
      fetchComments: async () => [
        { id: 3, author: 'old', body: 'old comment', createdAt: '2026-01-01', commentType: 'conversation' },
        { id: 5, author: 'old', body: 'last seen', createdAt: '2026-01-01', commentType: 'conversation' },
        { id: 8, author: 'alice', body: 'new comment', createdAt: '2026-01-02', commentType: 'conversation' },
      ],
      fetchReviews: async () => [
        { id: 2, author: 'old', state: 'COMMENTED', body: 'old', submittedAt: '2026-01-01' },
        { id: 3, author: 'old', state: 'APPROVED', body: 'old', submittedAt: '2026-01-01' },
      ],
      reviewFeedbackRouter: router,
      log: noopLog,
    });
    const result = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(result.run, true);
    // Only comment id=8 is new (above cursor 5)
    assert.equal(result.workItems[0].signal.newComments.length, 1);
    assert.equal(result.workItems[0].signal.newComments[0].id, 8);
    // Reviews id=2,3 are at/below cursor 3 → none new
    assert.equal(result.workItems[0].signal.newDecisions.length, 0);
  });

  it('gate prefers advanced persisted cursors over stale in-memory cursors (#406 sibling)', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter();
    const taskWithCursors = mockTask(
      { repoFullName: 'owner/repo', prNumber: 43, catId: 'opus', threadId: 'th-1', userId: 'u-1' },
      {
        automationState: {
          review: { lastCommentCursor: 5, lastDecisionCursor: 3 },
        },
      },
    );
    const commentSinceIds = [];
    const reviewSinceIds = [];
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([taskWithCursors]),
      fetchComments: async (_repoFullName, _prNumber, sinceId) => {
        commentSinceIds.push(sinceId);
        return sinceId === 5
          ? [{ id: 7, author: 'alice', body: 'new comment', createdAt: '2026-01-02', commentType: 'conversation' }]
          : [];
      },
      fetchReviews: async (_repoFullName, _prNumber, sinceId) => {
        reviewSinceIds.push(sinceId);
        return sinceId === 3
          ? [{ id: 4, author: 'bob', state: 'COMMENTED', body: 'new review', submittedAt: '2026-01-02' }]
          : [];
      },
      reviewFeedbackRouter: router,
      log: noopLog,
    });

    const first = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(first.run, true);
    await first.workItems[0].signal.commitCursor();

    taskWithCursors.automationState = { review: { lastCommentCursor: 10, lastDecisionCursor: 9 } };

    const second = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 2 });
    assert.equal(second.run, false);
    assert.deepEqual(commentSinceIds, [5, 10]);
    assert.deepEqual(reviewSinceIds, [3, 9]);
  });

  it('gate excludes done tasks — no work items, no fetch (#406 regression)', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter();
    let fetchCalled = false;
    const doneTask = mockTask(
      { repoFullName: 'owner/repo', prNumber: 99, catId: 'opus', threadId: 'th-done', userId: 'u-1' },
      { status: 'done' },
    );
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([doneTask]),
      fetchComments: async () => {
        fetchCalled = true;
        return [{ id: 1, author: 'alice', body: 'new', createdAt: '2026-01-01', commentType: 'conversation' }];
      },
      fetchReviews: async () => [],
      reviewFeedbackRouter: router,
      log: noopLog,
    });
    const result = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(result.run, false, 'done task must be excluded from gate');
    assert.equal(fetchCalled, false, 'should not even fetch comments for done tasks');
  });

  it('gate marks merged PR done via review-feedback metadata and does not fetch feedback (F140 backlog guard)', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter();
    const store = mockTaskStore([mockTaskItem]);
    let fetchCalled = false;
    const spec = createReviewFeedbackTaskSpec({
      taskStore: store,
      fetchPrMetadata: async () => ({ prState: 'merged', headSha: 'merged-head' }),
      fetchComments: async () => {
        fetchCalled = true;
        return [{ id: 1, author: 'alice', body: 'late review', createdAt: '2026-01-01', commentType: 'conversation' }];
      },
      fetchReviews: async () => {
        fetchCalled = true;
        return [{ id: 1, author: 'alice', state: 'COMMENTED', body: 'late review', submittedAt: '2026-01-01' }];
      },
      reviewFeedbackRouter: router,
      log: noopLog,
    });

    const result = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });

    assert.equal(result.run, false);
    assert.equal(fetchCalled, false, 'merged PRs must not fetch review feedback');
    assert.equal(store._updateCalls.length, 1);
    assert.equal(store._updateCalls[0].taskId, mockTaskItem.id);
    assert.equal(store._updateCalls[0].input.status, 'done');
  });

  it('gate continues with fresh feedback when PR metadata lookup is unavailable', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter();
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([mockTaskItem]),
      fetchPrMetadata: async () => null,
      fetchComments: async () => [
        { id: 10, author: 'alice', body: 'fresh review comment', createdAt: '2026-01-01', commentType: 'conversation' },
      ],
      fetchReviews: async () => [],
      reviewFeedbackRouter: router,
      log: noopLog,
    });

    const result = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });

    assert.equal(result.run, true, 'missing PR metadata should degrade to normal feedback processing');
    assert.equal(result.workItems.length, 1);
    assert.equal(result.workItems[0].signal.newComments.length, 1);
    assert.equal(result.workItems[0].signal.newComments[0].id, 10);
  });

  it('gate advances cursor and skips stale commit feedback when PR head moved (F140 backlog guard)', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter();
    const store = mockTaskStore([mockTaskItem]);
    const spec = createReviewFeedbackTaskSpec({
      taskStore: store,
      fetchPrMetadata: async () => ({ prState: 'open', headSha: 'head-new' }),
      fetchComments: async () => [
        {
          id: 10,
          author: 'alice',
          body: 'old inline finding',
          createdAt: '2026-01-01',
          commentType: 'inline',
          filePath: 'src/a.ts',
          line: 1,
          commitId: 'head-old',
        },
      ],
      fetchReviews: async () => [
        {
          id: 20,
          author: 'chatgpt-codex-connector[bot]',
          state: 'COMMENTED',
          body: 'old commit review',
          submittedAt: '2026-01-01',
          commitId: 'head-old',
        },
      ],
      reviewFeedbackRouter: router,
      log: noopLog,
    });

    const result = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });

    assert.equal(result.run, false, 'stale-only feedback should not notify');
    assert.equal(store._patchCalls.length, 1, 'stale-only feedback should still advance cursors');
    assert.equal(store._patchCalls[0].patch.review.lastCommentCursor, 10);
    assert.equal(store._patchCalls[0].patch.review.lastDecisionCursor, 20);
  });

  it('gate returns run:false when all items below persisted cursor (#406)', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter();
    const taskWithCursors = mockTask(
      { repoFullName: 'owner/repo', prNumber: 42, catId: 'opus', threadId: 'th-1', userId: 'u-1' },
      {
        automationState: {
          review: { lastCommentCursor: 10, lastDecisionCursor: 5 },
        },
      },
    );
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([taskWithCursors]),
      fetchComments: async () => [
        { id: 3, author: 'old', body: 'old', createdAt: '2026-01-01', commentType: 'conversation' },
        { id: 8, author: 'old', body: 'old', createdAt: '2026-01-01', commentType: 'conversation' },
      ],
      fetchReviews: async () => [{ id: 2, author: 'old', state: 'APPROVED', body: '', submittedAt: '2026-01-01' }],
      reviewFeedbackRouter: router,
      log: noopLog,
    });
    const result = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(result.run, false, 'no new items above persisted cursor');
  });

  it('commitCursor persists to automationState.review via patchAutomationState (#406)', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const store = mockTaskStore([mockTaskItem]);
    const spec = createReviewFeedbackTaskSpec({
      taskStore: store,
      fetchComments: async () => [
        { id: 7, author: 'alice', body: 'new', createdAt: '2026-01-01', commentType: 'conversation' },
      ],
      fetchReviews: async () => [{ id: 4, author: 'bob', state: 'APPROVED', body: 'LGTM', submittedAt: '2026-01-01' }],
      reviewFeedbackRouter: {
        async route() {
          return { kind: 'notified', threadId: 'th-1', catId: 'opus', messageId: 'm1', content: 'fb' };
        },
      },
      log: noopLog,
    });
    const gateResult = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(gateResult.run, true);
    await spec.run.execute(gateResult.workItems[0].signal, 'pr:owner/repo#42', {});

    // Verify patchAutomationState was called with correct cursor values.
    assert.ok(store._patchCalls.length >= 1, 'should have at least 1 patchAutomationState call');
    const cursorCall = store._patchCalls.find((c) => c.patch.review?.lastCommentCursor !== undefined);
    assert.ok(cursorCall, 'should have a cursor commit patch');
    assert.equal(cursorCall.taskId, mockTaskItem.id);
    assert.equal(cursorCall.patch.review.lastCommentCursor, 7);
    assert.equal(cursorCall.patch.review.lastDecisionCursor, 4);
    assert.equal(typeof cursorCall.patch.review.lastNotifiedAt, 'number');
  });

  it('echo-skip path also persists cursor to automationState (#406)', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const store = mockTaskStore([mockTaskItem]);
    const spec = createReviewFeedbackTaskSpec({
      taskStore: store,
      fetchComments: async () => [
        { id: 10, author: 'self', body: '@codex review', createdAt: '2026-01-01', commentType: 'conversation' },
      ],
      fetchReviews: async () => [],
      reviewFeedbackRouter: {
        async route() {
          return { kind: 'skipped', reason: 'test' };
        },
      },
      log: noopLog,
      isEchoComment: (c) => c.author === 'self',
    });
    const result = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(result.run, false, 'all echo → skip');

    // Echo-skip should still persist cursor
    assert.equal(store._patchCalls.length, 1);
    assert.equal(store._patchCalls[0].patch.review.lastCommentCursor, 10);
  });

  it('echo-skip persist failure logs warning and allows retry next tick (#406 P2)', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const warnings = [];
    const failingStore = {
      listByKind: async () => [mockTaskItem],
      patchAutomationState: async () => {
        throw new Error('Redis unavailable');
      },
      _patchCalls: [],
    };
    const spec = createReviewFeedbackTaskSpec({
      taskStore: failingStore,
      fetchComments: async () => [
        { id: 10, author: 'self', body: '@codex review', createdAt: '2026-01-01', commentType: 'conversation' },
      ],
      fetchReviews: async () => [],
      reviewFeedbackRouter: {
        async route() {
          return { kind: 'skipped', reason: 'test' };
        },
      },
      log: { ...noopLog, warn: (...args) => warnings.push(args) },
      isEchoComment: (c) => c.author === 'self',
    });

    // First gate: persist fails, warn logged, memory NOT advanced
    const r1 = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(r1.run, false, 'echo-skip still returns run:false');
    assert.ok(warnings.length > 0, 'should log warning on persist failure');
    assert.ok(warnings[0][0].includes('echo-skip persist failed'), 'warning message identifies echo-skip');

    // Second gate: same echo comment retried (memory cursor was NOT advanced)
    warnings.length = 0;
    const r2 = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 2 });
    assert.equal(r2.run, false, 'echo comment still filtered on retry');
    assert.ok(warnings.length > 0, 'retry also attempts persist and logs');
  });

  it('commitCursor persist failure after delivery still advances memory cursor (no duplicate spam)', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const warnings = [];
    const failingStore = {
      listByKind: async () => [mockTaskItem],
      patchAutomationState: async () => {
        throw new Error('Redis unavailable');
      },
      _patchCalls: [],
    };
    const spec = createReviewFeedbackTaskSpec({
      taskStore: failingStore,
      fetchComments: async () => [
        { id: 7, author: 'alice', body: 'new review', createdAt: '2026-01-01', commentType: 'conversation' },
      ],
      fetchReviews: async () => [],
      reviewFeedbackRouter: {
        async route() {
          return { kind: 'notified', threadId: 'th-1', catId: 'opus', messageId: 'm1', content: 'fb' };
        },
      },
      log: { ...noopLog, warn: (...args) => warnings.push(args) },
    });

    // Gate + execute: delivery succeeds, persist fails
    const gateResult = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(gateResult.run, true);
    await spec.run.execute(gateResult.workItems[0].signal, 'pr:owner/repo#42', {});

    // Persist failed → warn logged
    assert.ok(warnings.length > 0, 'should log warning on persist failure');
    assert.ok(warnings[0][0].includes('cursor persist failed'), 'warning identifies cursor persist');

    // But memory cursor advanced → next gate does NOT re-deliver (no duplicate spam)
    const r2 = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 2 });
    assert.equal(r2.run, false, 'memory cursor prevents duplicate delivery');
  });

  it('isEchoComment custom predicate scoping: only matches configured bot, not other bots', async () => {
    const { createReviewFeedbackTaskSpec } = await import('../../dist/infrastructure/email/ReviewFeedbackTaskSpec.js');
    const { router } = stubRouter();
    const authBot = 'chatgpt-codex-connector[bot]';
    const spec = createReviewFeedbackTaskSpec({
      taskStore: mockTaskStore([mockTaskItem]),
      fetchComments: async () => [
        {
          id: 1,
          author: 'dependabot[bot]',
          body: 'Bumps lodash from 4.17.20 to 4.17.21',
          createdAt: '2026-01-01',
          commentType: 'conversation',
        },
      ],
      fetchReviews: async () => [],
      reviewFeedbackRouter: router,
      log: noopLog,
      // Custom predicate scope: only the configured bot, not other bots
      isEchoComment: (c) => c.author === authBot,
    });
    const result = await spec.admission.gate({ taskId: spec.id, lastRunAt: null, tickCount: 1 });
    assert.equal(result.run, true);
    assert.equal(result.workItems[0].signal.newComments.length, 1);
    assert.equal(result.workItems[0].signal.newComments[0].author, 'dependabot[bot]');
  });
});
