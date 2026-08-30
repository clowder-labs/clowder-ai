import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { ActivityEventBus } from '../dist/domains/activity/ActivityEventBus.js';
import { MemoryProjector } from '../dist/domains/activity/MemoryProjector.js';

describe('MemoryProjector', () => {
  /** @type {ActivityEventBus} */
  let bus;
  /** @type {{ items: Array<Object>, upsert: Function }} */
  let mockStore;
  /** @type {MemoryProjector} */
  let projector;

  beforeEach(() => {
    bus = new ActivityEventBus();
    mockStore = {
      items: [],
      async upsert(batch) {
        mockStore.items.push(...batch);
      },
    };
    projector = new MemoryProjector(bus, mockStore);
  });

  function emit(type, actorId = 'ragdoll', metadata = {}, threadId = undefined) {
    bus.record(type, actorId, metadata, threadId);
    return mockStore.items;
  }

  async function emitAndWait(type, actorId = 'ragdoll', metadata = {}, threadId = undefined) {
    bus.record(type, actorId, metadata, threadId);
    await new Promise((r) => setTimeout(r, 20));
    return mockStore.items;
  }

  // ── Always promote ────────────────────────────────────────────

  describe('always promote', () => {
    it('promotes deep_collab_completed', async () => {
      const items = await emitAndWait('deep_collab_completed', 'ragdoll', {
        participants: ['ragdoll', 'persian'],
      });
      assert.equal(items.length, 1);
      assert.equal(items[0].kind, 'discussion');
      assert.ok(items[0].anchor.startsWith('activity-collab-'));
    });

    it('promotes bug_caught', async () => {
      const items = await emitAndWait('bug_caught', 'ragdoll', {}, 'thread-1');
      assert.equal(items.length, 1);
      assert.equal(items[0].kind, 'lesson');
      assert.ok(items[0].anchor.startsWith('activity-bug-'));
    });

    it('promotes evidence_cited', async () => {
      const items = await emitAndWait('evidence_cited', 'ragdoll', { citedAnchor: 'doc-123' });
      assert.equal(items.length, 1);
      assert.equal(items[0].kind, 'research');
      assert.ok(items[0].anchor.includes('doc-123'));
    });
  });

  // ── Conditional promote ───────────────────────────────────────

  describe('conditional promote', () => {
    it('promotes review_submitted when hasFindings is true', async () => {
      const items = await emitAndWait('review_submitted', 'ragdoll', {
        hasFindings: true,
        findingCount: 3,
      });
      assert.equal(items.length, 1);
      assert.equal(items[0].kind, 'discussion');
    });

    it('does NOT promote review_submitted without hasFindings', async () => {
      const items = await emitAndWait('review_submitted', 'ragdoll', { hasFindings: false });
      assert.equal(items.length, 0);
    });

    it('promotes decision_confirmed when threadId is present', async () => {
      const items = await emitAndWait('decision_confirmed', 'co-creator', {}, 'thread-42');
      assert.equal(items.length, 1);
      assert.equal(items[0].kind, 'decision');
    });

    it('does NOT promote decision_confirmed without threadId', async () => {
      const items = await emitAndWait('decision_confirmed', 'co-creator', {});
      assert.equal(items.length, 0);
    });

    it('promotes feedback_applied unconditionally', async () => {
      const items = await emitAndWait('feedback_applied', 'ragdoll', {
        sourceMessageId: 'msg-1',
      });
      assert.equal(items.length, 1);
      assert.equal(items[0].kind, 'lesson');
    });
  });

  // ── Never promote ─────────────────────────────────────────────

  describe('never promote', () => {
    it('does NOT promote tool_used', async () => {
      const items = await emitAndWait('tool_used', 'ragdoll', {});
      assert.equal(items.length, 0);
    });

    it('does NOT promote message_sent', async () => {
      const items = await emitAndWait('message_sent', 'ragdoll', {});
      assert.equal(items.length, 0);
    });

    it('does NOT promote session_sealed', async () => {
      const items = await emitAndWait('session_sealed', 'ragdoll', {});
      assert.equal(items.length, 0);
    });

    it('does NOT promote multi_mention_completed', async () => {
      const items = await emitAndWait('multi_mention_completed', 'ragdoll', {});
      assert.equal(items.length, 0);
    });

    it('does NOT promote clarification_requested', async () => {
      const items = await emitAndWait('clarification_requested', 'ragdoll', {});
      assert.equal(items.length, 0);
    });

    it('does NOT promote task_completed', async () => {
      const items = await emitAndWait('task_completed', 'ragdoll', {});
      assert.equal(items.length, 0);
    });
  });

  // ── Evidence item structure ───────────────────────────────────

  describe('evidence item structure', () => {
    it('includes title, summary, keywords, and status', async () => {
      const items = await emitAndWait('bug_caught', 'ragdoll', {}, 'thread-5');
      assert.equal(items.length, 1);
      const item = items[0];
      assert.equal(item.status, 'active');
      assert.ok(item.title.includes('ragdoll'));
      assert.ok(item.summary.includes('ragdoll'));
      assert.ok(item.keywords.includes('bug_caught'));
      assert.ok(item.keywords.includes('ragdoll'));
      assert.ok(item.keywords.includes('thread:thread-5'));
      assert.ok(item.updatedAt);
    });

    it('uses metadata.summary when provided', async () => {
      const items = await emitAndWait('bug_caught', 'ragdoll', {
        summary: 'Custom summary text',
      });
      assert.equal(items[0].summary, 'Custom summary text');
    });

    it('excludes co-creator actorId from keywords', async () => {
      const items = await emitAndWait('deep_collab_completed', 'co-creator', {
        participants: ['ragdoll'],
      });
      assert.equal(items.length, 1);
      assert.ok(!items[0].keywords.includes('co-creator'));
    });
  });

  // ── Anchor uniqueness ─────────────────────────────────────────

  describe('anchor uniqueness', () => {
    it('deep_collab anchor is stable for same participants', async () => {
      await emitAndWait(
        'deep_collab_completed',
        'ragdoll',
        {
          participants: ['b', 'a'],
        },
        'thread-1',
      );
      const anchor1 = mockStore.items[0].anchor;

      mockStore.items = [];
      await emitAndWait(
        'deep_collab_completed',
        'persian',
        {
          participants: ['a', 'b'],
        },
        'thread-1',
      );
      const anchor2 = mockStore.items[0].anchor;

      assert.equal(anchor1, anchor2);
    });
  });

  // ── dispose ───────────────────────────────────────────────────

  describe('dispose', () => {
    it('unsubscribes from bus', async () => {
      projector.dispose();
      const items = await emitAndWait('bug_caught');
      assert.equal(items.length, 0);
    });
  });
});
