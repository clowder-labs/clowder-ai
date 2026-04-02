import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const {
  parseInvocationLatencyReportArgs,
  summarizeInvocationLatencyCheckpoints,
  formatInvocationLatencySummary,
} = await import('../dist/scripts/invocation-latency-report.js');

describe('parseInvocationLatencyReportArgs', () => {
  it('parses invocation, cat, limit, and json flags', () => {
    const args = parseInvocationLatencyReportArgs(
      ['--invocation', 'inv-123', '--cat', 'office', '--limit', '5', '--json'],
      '/tmp/project',
    );

    assert.equal(args.invocationId, 'inv-123');
    assert.equal(args.catId, 'office');
    assert.equal(args.limit, 5);
    assert.equal(args.json, true);
    assert.equal(args.help, false);
    assert.match(args.logPath, /data\/logs\/api\/api\.log$/);
  });

  it('throws on unknown flag', () => {
    assert.throws(
      () => parseInvocationLatencyReportArgs(['--wat'], '/tmp/project'),
      /unknown argument: --wat/,
    );
  });

  it('throws when --limit is not a positive integer', () => {
    assert.throws(
      () => parseInvocationLatencyReportArgs(['--limit', '0'], '/tmp/project'),
      /--limit requires a positive integer/,
    );
  });
});

describe('summarizeInvocationLatencyCheckpoints', () => {
  it('aggregates the five key checkpoints for one invocation/cat', () => {
    const summaries = summarizeInvocationLatencyCheckpoints([
      {
        latencyStage: 'user_message_received',
        stageAt: 1000,
        parentInvocationId: 'inv-123',
        clientSentAt: 900,
        serverReceivedAt: 1000,
        threadId: 'thread-a',
        userId: 'user-a',
      },
      {
        latencyStage: 'office_received',
        stageAt: 1015,
        parentInvocationId: 'inv-123',
        officeReceivedAt: 1015,
        threadId: 'thread-a',
        userId: 'user-a',
      },
      {
        latencyStage: 'agent_forwarded',
        stageAt: 1030,
        parentInvocationId: 'inv-123',
        invocationId: 'child-1',
        catId: 'office',
        sessionId: 'sess-1',
      },
      {
        latencyStage: 'agent_first_reply',
        stageAt: 1400,
        parentInvocationId: 'inv-123',
        invocationId: 'child-1',
        catId: 'office',
      },
      {
        latencyStage: 'agent_reply_completed',
        stageAt: 1900,
        parentInvocationId: 'inv-123',
        invocationId: 'child-1',
        catId: 'office',
        outcome: 'completed',
      },
    ]);

    assert.equal(summaries.length, 1);
    assert.deepEqual(summaries[0], {
      parentInvocationId: 'inv-123',
      catId: 'office',
      invocationId: 'child-1',
      threadId: 'thread-a',
      userId: 'user-a',
      sessionId: 'sess-1',
      outcome: 'completed',
      clientSentAt: 900,
      serverReceivedAt: 1000,
      officeReceivedAt: 1015,
      agentForwardedAt: 1030,
      agentFirstReplyAt: 1400,
      agentReplyCompletedAt: 1900,
    });
  });
});

describe('formatInvocationLatencySummary', () => {
  it('renders one-line duration segments', () => {
    const line = formatInvocationLatencySummary({
      parentInvocationId: 'inv-123',
      catId: 'office',
      outcome: 'completed',
      threadId: 'thread-a',
      sessionId: 'sess-1',
      clientSentAt: 900,
      serverReceivedAt: 1000,
      officeReceivedAt: 1015,
      agentForwardedAt: 1030,
      agentFirstReplyAt: 1400,
      agentReplyCompletedAt: 1900,
    });

    assert.match(line, /invocation=inv-123/);
    assert.match(line, /cat=office/);
    assert.match(line, /clientToServer=100ms/);
    assert.match(line, /serverToOffice=15ms/);
    assert.match(line, /officeToForward=15ms/);
    assert.match(line, /forwardToFirstReply=370ms/);
    assert.match(line, /firstReplyToCompleted=500ms/);
    assert.match(line, /forwardToCompleted=870ms/);
  });
});
