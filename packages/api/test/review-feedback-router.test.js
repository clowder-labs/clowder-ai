import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

const { TaskStore } = await import('../dist/domains/cats/services/stores/ports/TaskStore.js');
const { MessageStore } = await import('../dist/domains/cats/services/stores/ports/MessageStore.js');
const { GitHubWaitLifecycleService } = await import('../dist/domains/github-signals/GitHubWaitLifecycleService.js');
const { ReviewFeedbackRouter, buildReviewFeedbackContent } = await import(
  '../dist/infrastructure/email/ReviewFeedbackRouter.js'
);

async function setup(when) {
  const taskStore = new TaskStore();
  const messageStore = new MessageStore();
  const task = await taskStore.create({
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
          headSha: 'aaa1111',
          review: { inlineCommentCursor: 10, conversationCommentCursor: 20, decisionCursor: 30 },
        },
        continuation: {
          when,
          // biome-ignore lint/suspicious/noThenProperty: F280's frozen wait contract field.
          then: 'Apply the exact review result.',
        },
        expiresAt: 10_000,
        createdAt: 100,
      },
    },
  });
  const lifecycle = new GitHubWaitLifecycleService({
    taskStore,
    deliveryDeps: { messageStore },
    now: () => 500,
    log: { info() {}, warn() {}, error() {} },
  });
  const router = new ReviewFeedbackRouter({
    deliveryDeps: { messageStore },
    waitLifecycle: lifecycle,
    log: { info() {}, warn() {}, error() {} },
  });
  return { router, task, messageStore, taskStore };
}

function signal(overrides = {}) {
  return {
    repoFullName: 'owner/repo',
    prNumber: 7,
    headSha: 'aaa1111',
    newComments: [],
    newDecisions: [
      {
        id: 31,
        author: 'reviewer',
        state: 'CHANGES_REQUESTED',
        body: 'SOURCE_BODY_SHOULD_NEVER_RENDER',
        submittedAt: '2026-07-30T00:00:00Z',
        commitId: 'aaa1111',
      },
    ],
    inlineCommentCursor: 10,
    conversationCommentCursor: 20,
    decisionCursor: 31,
    ...overrides,
  };
}

function noopLog() {
  const noop = () => {};
  return /** @type {any} */ ({
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    trace: noop,
    fatal: noop,
    child: () => noopLog(),
  });
}

const tracking = { threadId: 'th-1', catId: 'opus', userId: 'u-1' };

// ─── Tests ─────────────────────────────────────────────────────────

describe('ReviewFeedbackRouter', () => {
  let messageMock;
  let socketMock;

  function createRouter() {
    return new ReviewFeedbackRouter({
      deliveryDeps: { messageStore: messageMock.store, socketManager: socketMock.manager },
      log: noopLog(),
    });
  }

  beforeEach(() => {
    messageMock = mockMessageStore();
    socketMock = mockSocketManager();
  });

  describe('tracking instructions head binding', () => {
    it('keeps instructions when they describe the current review head', () => {
      const content = buildReviewFeedbackContent(
        {
          repoFullName: 'owner/repo',
          prNumber: 42,
          headSha: 'abc1234567890',
          newComments: [{ id: 1, author: 'bot', body: 'LGTM', createdAt: '2026-06-26', commentType: 'conversation' }],
          newDecisions: [],
        },
        'Proceed to merge readiness.',
        'abc1234567890',
      );

      assert.ok(content.includes('📌 **Tracking Instructions**'));
      assert.ok(content.includes('Proceed to merge readiness.'));
    });

    it('omits stale instructions when review feedback is for a newer head', () => {
      const content = buildReviewFeedbackContent(
        {
          repoFullName: 'owner/repo',
          prNumber: 42,
          headSha: 'newhead1234567890',
          newComments: [{ id: 1, author: 'bot', body: 'LGTM', createdAt: '2026-06-26', commentType: 'conversation' }],
          newDecisions: [],
        },
        'Handle old head review finding before merge.',
        'oldhead1234567890',
      );

      assert.ok(!content.includes('📌 **Tracking Instructions**'));
      assert.ok(!content.includes('Handle old head review finding before merge.'));
    });

    it('omits head-bound instructions when the current review head is unknown', () => {
      const content = buildReviewFeedbackContent(
        {
          repoFullName: 'owner/repo',
          prNumber: 42,
          newComments: [{ id: 1, author: 'bot', body: 'LGTM', createdAt: '2026-06-26', commentType: 'conversation' }],
          newDecisions: [],
        },
        'Handle old head review finding before merge.',
        'oldhead1234567890',
      );

      assert.ok(!content.includes('📌 **Tracking Instructions**'));
      assert.ok(!content.includes('Handle old head review finding before merge.'));
    });
  });

  it('delivers review feedback with correct connector (AC-A3/A4)', async () => {
    const router = createRouter();
    const result = await router.route(
      {
        repoFullName: 'owner/repo',
        prNumber: 42,
        newComments: [{ id: 1, author: 'alice', body: 'LGTM', createdAt: '2026-01-01', commentType: 'conversation' }],
        newDecisions: [{ id: 1, author: 'alice', state: 'APPROVED', body: '', submittedAt: '2026-01-01' }],
      },
      tracking,
    );

    assert.equal(result.kind, 'notified');
    assert.match(result.content, /review pending → CHANGES_REQUESTED/);
    assert.equal(result.content.includes('SOURCE_BODY_SHOULD_NEVER_RENDER'), false);
    assert.equal(messageStore.getByThread('thread_1').length, 1);
  });

  test('ordinary conversation activity advances facts but never wakes a head-only waiter', async () => {
    const { router, task, messageStore, taskStore } = await setup([{ kind: 'pr_head_changed' }]);
    const result = await router.route(
      signal({
        newComments: [
          {
            id: 21,
            author: 'human',
            body: '@codex review',
            createdAt: '2026-07-30T00:00:00Z',
            commentType: 'conversation',
          },
        ],
        newDecisions: [],
        conversationCommentCursor: 21,
        decisionCursor: 30,
      }),
      { taskId: task.id },
    );
    assert.equal(result.kind, 'skipped');
    assert.equal(messageStore.getByThread('thread_1').length, 0);
    assert.equal((await taskStore.get(task.id)).automationState.review.lastConversationCommentCursor, 21);
  });

  test('conversation-only clean result consumes the exact wait once without a review decision cursor', async () => {
    const { router, task, messageStore } = await setup([{ kind: 'pr_review_result_available' }]);
    const clean = signal({
      newComments: [],
      newDecisions: [],
      conversationCommentCursor: 21,
      decisionCursor: 30,
      resultSourceRef: 'conversation:21',
      resultConversationCommentCursor: 21,
    });

    const first = await router.route(clean, { taskId: task.id });
    assert.equal(first.kind, 'notified');
    assert.match(first.content, /RESULT_AVAILABLE/);
    assert.equal(messageStore.getByThread('thread_1').length, 1);

    const replay = await router.route(clean, { taskId: task.id });
    assert.equal(replay.kind, 'skipped');
    assert.equal(messageStore.getByThread('thread_1').length, 1);
  });

  test('terminal PR truth observed by the review collector consumes an active wait', async () => {
    const { router, task, messageStore, taskStore } = await setup([{ kind: 'pr_review_result_available' }]);
    const result = await router.route(
      signal({
        newComments: [],
        newDecisions: [],
        decisionCursor: 30,
        subjectState: 'merged',
      }),
      { taskId: task.id },
    );

    assert.equal(result.kind, 'notified');
    assert.match(result.content, /PR state: merged/);
    assert.equal(messageStore.getByThread('thread_1').length, 1);
    const stored = await taskStore.get(task.id);
    assert.equal(stored.status, 'done');
    assert.equal(stored.automationState.await, undefined);
    assert.equal(stored.automationState.waitOutcome.reason, 'subject_terminal');
    assert.equal(stored.automationState.waitOutcome.terminalSubjectState, 'merged');
  });
});

describe('review preview renderer', () => {
  test('does not include review/comment bodies or caller instructions', () => {
    const content = buildReviewFeedbackContent(
      signal({
        newComments: [
          {
            id: 21,
            author: 'human',
            body: 'SOURCE_SENTINEL',
            createdAt: '2026-07-30T00:00:00Z',
            commentType: 'conversation',
          },
        ],
      }),
      'LEGACY_SENTINEL',
    );
    assert.equal(content.includes('SOURCE_SENTINEL'), false);
    assert.equal(content.includes('LEGACY_SENTINEL'), false);
  });
});
