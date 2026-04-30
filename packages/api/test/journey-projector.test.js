import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { ActivityEventBus } from '../dist/domains/activity/ActivityEventBus.js';
import { JourneyProjector } from '../dist/domains/activity/JourneyProjector.js';

describe('JourneyProjector', () => {
  /** @type {ActivityEventBus} */
  let bus;
  /** @type {{ calls: Array<{catId: string, source: string, multiplier?: number}>, bonds: Array<{catA: string, catB: string}>, awardFootfall: Function, recordBondEvent: Function }} */
  let mockService;
  /** @type {JourneyProjector} */
  let projector;

  beforeEach(() => {
    bus = new ActivityEventBus();
    mockService = {
      calls: [],
      bonds: [],
      awardFootfall(catId, source, multiplier) {
        mockService.calls.push({ catId, source, multiplier });
      },
      recordBondEvent(catA, catB) {
        mockService.bonds.push({ catA, catB });
      },
    };
    projector = new JourneyProjector(bus, mockService);
  });

  function emit(type, actorId = 'ragdoll', metadata = {}) {
    bus.record(type, actorId, metadata);
    return mockService.calls;
  }

  // ── Basic event→footfall mapping ─────────────────────────────

  describe('event→footfall mapping', () => {
    it('awards tool_use on tool_used', () => {
      const calls = emit('tool_used');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].source, 'tool_use');
      assert.equal(calls[0].catId, 'ragdoll');
    });

    it('awards task_complete on task_completed', () => {
      const calls = emit('task_completed');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].source, 'task_complete');
    });

    it('awards discussion on message_sent', () => {
      const calls = emit('message_sent');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].source, 'discussion');
    });

    it('awards review_given on review_submitted', () => {
      const calls = emit('review_submitted');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].source, 'review_given');
    });

    it('awards bug_caught on bug_caught', () => {
      const calls = emit('bug_caught');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].source, 'bug_caught');
    });

    it('awards mention_collab on multi_mention_completed', () => {
      const calls = emit('multi_mention_completed', 'ragdoll', { participants: ['ragdoll'] });
      assert.ok(calls.some((c) => c.source === 'mention_collab'));
    });

    it('awards deep_collab on deep_collab_completed', () => {
      const calls = emit('deep_collab_completed', 'ragdoll', { participants: ['ragdoll'] });
      assert.ok(calls.some((c) => c.source === 'deep_collab'));
    });

    it('awards evidence_cite on evidence_cited', () => {
      const calls = emit('evidence_cited');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].source, 'evidence_cite');
    });

    it('awards session_seal on session_sealed', () => {
      const calls = emit('session_sealed');
      assert.ok(calls.some((c) => c.catId === 'ragdoll' && c.source === 'session_seal'));
    });

    it('awards rich_block_create on rich_block_created', () => {
      const calls = emit('rich_block_created');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].source, 'rich_block_create');
    });

    it('awards design_feedback on design_feedback_given', () => {
      const calls = emit('design_feedback_given');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].source, 'design_feedback');
    });
  });

  // ── Ignored events ────────────────────────────────────────────

  describe('ignored events', () => {
    it('silently ignores unmapped event types', () => {
      const calls = emit('clarification_requested');
      assert.equal(calls.length, 0);
    });

    it('silently ignores multi_mention_dispatched', () => {
      const calls = emit('multi_mention_dispatched');
      assert.equal(calls.length, 0);
    });
  });

  // ── Tool category overrides ───────────────────────────────────

  describe('tool category overrides', () => {
    it('overrides source to tool_use_mcp for mcp category', () => {
      const calls = emit('tool_used', 'ragdoll', { category: 'mcp' });
      assert.equal(calls[0].source, 'tool_use_mcp');
    });

    it('overrides source to tool_use_skill for skill category', () => {
      const calls = emit('tool_used', 'ragdoll', { category: 'skill' });
      assert.equal(calls[0].source, 'tool_use_skill');
    });

    it('keeps default tool_use for builtin category', () => {
      const calls = emit('tool_used', 'ragdoll', { category: 'builtin' });
      assert.equal(calls[0].source, 'tool_use');
    });
  });

  // ── Ideate intent override ────────────────────────────────────

  describe('ideate intent override (AC-E5)', () => {
    it('overrides discussion → ideate_discussion when intent is ideate', () => {
      const calls = emit('message_sent', 'ragdoll', { intent: 'ideate' });
      assert.equal(calls[0].source, 'ideate_discussion');
    });

    it('keeps discussion for non-ideate message_sent', () => {
      const calls = emit('message_sent', 'ragdoll', { intent: 'other' });
      assert.equal(calls[0].source, 'discussion');
    });
  });

  // ── Error recovery bonus (AC-E6) ─────────────────────────────

  describe('error recovery bonus (AC-E6)', () => {
    it('awards error_recovery when recoveredFromFailure is set', () => {
      const calls = emit('task_completed', 'ragdoll', { recoveredFromFailure: true });
      const sources = calls.map((c) => c.source);
      assert.ok(sources.includes('task_complete'));
      assert.ok(sources.includes('error_recovery'));
    });

    it('does not award error_recovery without flag', () => {
      const calls = emit('task_completed', 'ragdoll', {});
      const sources = calls.map((c) => c.source);
      assert.ok(!sources.includes('error_recovery'));
    });
  });

  // ── Fast execution bonus (AC-E7) ─────────────────────────────

  describe('fast execution bonus (AC-E7)', () => {
    it('awards fast_execution when fastExecution is set', () => {
      const calls = emit('task_completed', 'ragdoll', { fastExecution: true });
      const sources = calls.map((c) => c.source);
      assert.ok(sources.includes('fast_execution'));
    });

    it('does not award fast_execution without flag', () => {
      const calls = emit('task_completed', 'ragdoll', {});
      const sources = calls.map((c) => c.source);
      assert.ok(!sources.includes('fast_execution'));
    });
  });

  // ── Cache efficiency bonus (AC-E4) ────────────────────────────

  describe('cache efficiency bonus (AC-E4)', () => {
    it('awards cache_efficiency when cache hit ratio >= 30%', () => {
      const calls = emit('session_sealed', 'ragdoll', {
        lastUsage: { cacheReadTokens: 3000, inputTokens: 10000 },
      });
      const sources = calls.map((c) => c.source);
      assert.ok(sources.includes('cache_efficiency'));
    });

    it('does not award cache_efficiency when ratio < 30%', () => {
      const calls = emit('session_sealed', 'ragdoll', {
        lastUsage: { cacheReadTokens: 100, inputTokens: 10000 },
      });
      const sources = calls.map((c) => c.source);
      assert.ok(!sources.includes('cache_efficiency'));
    });

    it('does not award cache_efficiency without usage data', () => {
      const calls = emit('session_sealed', 'ragdoll', {});
      const sources = calls.map((c) => c.source);
      assert.ok(!sources.includes('cache_efficiency'));
    });
  });

  // ── Co-creator footfall for collab events ─────────────────────

  describe('co-creator footfall', () => {
    it('awards co-creator footfall for multi_mention_completed from a cat', () => {
      const calls = emit('multi_mention_completed', 'ragdoll', { participants: ['ragdoll'] });
      const coCreatorCalls = calls.filter((c) => c.catId === 'co-creator');
      assert.equal(coCreatorCalls.length, 1);
      assert.equal(coCreatorCalls[0].source, 'mention_collab');
    });

    it('awards co-creator footfall for session_sealed from a cat', () => {
      const calls = emit('session_sealed', 'ragdoll', {});
      const coCreatorCalls = calls.filter((c) => c.catId === 'co-creator');
      assert.equal(coCreatorCalls.length, 1);
      assert.equal(coCreatorCalls[0].source, 'session_seal');
    });

    it('does NOT double-award co-creator when actor IS co-creator', () => {
      const calls = emit('session_sealed', 'co-creator', {});
      const coCreatorCalls = calls.filter((c) => c.catId === 'co-creator');
      assert.equal(coCreatorCalls.length, 1);
    });

    it('does NOT award co-creator for non-collab events', () => {
      const calls = emit('tool_used', 'ragdoll', {});
      const coCreatorCalls = calls.filter((c) => c.catId === 'co-creator');
      assert.equal(coCreatorCalls.length, 0);
    });
  });

  // ── Bond recording ────────────────────────────────────────────

  describe('bond recording', () => {
    it('records bond pairs for multi_mention_completed participants', () => {
      emit('multi_mention_completed', 'ragdoll', { participants: ['a', 'b', 'c'] });
      assert.equal(mockService.bonds.length, 3);
      assert.deepEqual(mockService.bonds[0], { catA: 'a', catB: 'b' });
      assert.deepEqual(mockService.bonds[1], { catA: 'a', catB: 'c' });
      assert.deepEqual(mockService.bonds[2], { catA: 'b', catB: 'c' });
    });

    it('records bond pairs for deep_collab_completed participants', () => {
      emit('deep_collab_completed', 'ragdoll', { participants: ['x', 'y'] });
      assert.equal(mockService.bonds.length, 1);
      assert.deepEqual(mockService.bonds[0], { catA: 'x', catB: 'y' });
    });

    it('records bond pairs for a2a_handoff_completed', () => {
      emit('a2a_handoff_completed', 'ragdoll', { participants: ['p', 'q'] });
      assert.equal(mockService.bonds.length, 1);
    });

    it('does not record bonds when participants is missing', () => {
      emit('multi_mention_completed', 'ragdoll', {});
      assert.equal(mockService.bonds.length, 0);
    });

    it('does not record bonds for non-bond events', () => {
      emit('task_completed', 'ragdoll', { participants: ['a', 'b'] });
      assert.equal(mockService.bonds.length, 0);
    });
  });

  // ── dispose ───────────────────────────────────────────────────

  describe('dispose', () => {
    it('unsubscribes from bus', () => {
      projector.dispose();
      const calls = emit('task_completed');
      assert.equal(calls.length, 0);
    });
  });
});
