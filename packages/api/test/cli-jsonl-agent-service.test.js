/**
 * F241 Phase A: CLI JSONL AgentService.
 */

import './helpers/setup-cat-registry.js';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { CliJsonlAgentService } = await import(
  '../dist/domains/cats/services/agents/providers/cli-jsonl/CliJsonlAgentService.js'
);

async function collect(iterable) {
  const out = [];
  for await (const item of iterable) out.push(item);
  return out;
}

describe('CliJsonlAgentService', () => {
  it('passes prompt via stdin and maps clowder-code turn_result to AgentMessages', async () => {
    const seenOpts = [];
    const service = new CliJsonlAgentService({
      catId: 'clowder-code',
      providerName: 'clowder-code',
      modelName: 'reference-runtime',
      command: 'clowder-code',
      startupArgs: ['--json', '--non-interactive'],
    });

    const messages = await collect(
      service.invoke('hello from user', {
        workingDirectory: '/tmp/project',
        systemPrompt: 'SYSTEM',
        callbackEnv: { CAT_CAFE_API_URL: 'http://127.0.0.1:3004' },
        accountEnv: { HOME: '/tmp/cc-home' },
        spawnCliOverride: async function* (opts) {
          seenOpts.push(opts);
          yield {
            type: 'turn_result',
            response: 'hello from runtime',
            terminal: { kind: 'completed' },
            stats: {
              sessionId: 'cc-session-1',
              inputTokens: 11,
              outputTokens: 7,
              tokensUsed: 18,
            },
          };
        },
      }),
    );

    assert.equal(seenOpts.length, 1);
    assert.deepEqual(seenOpts[0].args, ['--json', '--non-interactive']);
    assert.equal(seenOpts[0].stdinInput, 'SYSTEM\n\nhello from user');
    assert.equal(seenOpts[0].cwd, '/tmp/project');
    assert.equal(seenOpts[0].env.CAT_CAFE_API_URL, 'http://127.0.0.1:3004');
    assert.equal(seenOpts[0].env.HOME, '/tmp/cc-home');
    assert.equal(seenOpts[0].args.includes('hello from user'), false, 'prompt must not be passed through argv');

    assert.deepEqual(
      messages.map((m) => m.type),
      ['session_init', 'agent_loop', 'text', 'done'],
    );
    assert.equal(messages[0].sessionId, 'cc-session-1');
    assert.equal(messages[0].ephemeralSession, false);
    assert.equal(messages[1].metadata.provider, 'clowder-code');
    assert.equal(messages[1].metadata.usage.inputTokens, 11);
    assert.equal(messages[2].content, 'hello from runtime');
    assert.equal(messages[3].metadata.sessionId, 'cc-session-1');
  });

  it('uses resume args when the host provides a resumable sessionId', async () => {
    const seenOpts = [];
    const service = new CliJsonlAgentService({
      catId: 'clowder-code',
      providerName: 'clowder-code',
      modelName: 'reference-runtime',
      command: 'clowder-code',
      startupArgs: ['--json', '--non-interactive'],
      resumeArgs: ['resume', '{sessionId}', '--json'],
    });

    const messages = await collect(
      service.invoke('follow up', {
        sessionId: 'cc-session-1',
        spawnCliOverride: async function* (opts) {
          seenOpts.push(opts);
          yield {
            type: 'turn_result',
            response: 'continued',
            terminal: { kind: 'completed' },
            stats: { sessionId: 'cc-session-1' },
          };
        },
      }),
    );

    assert.deepEqual(seenOpts[0].args, ['resume', 'cc-session-1', '--json']);
    assert.equal(seenOpts[0].stdinInput, 'follow up');
    assert.equal(messages[0].type, 'session_init');
    assert.equal(messages[0].sessionId, 'cc-session-1');
    assert.equal(messages[0].ephemeralSession, false);
  });

  it('degrades unsafe multiline resume without rewriting the prompt payload', async () => {
    const seenOpts = [];
    const service = new CliJsonlAgentService({
      catId: 'clowder-code',
      providerName: 'clowder-code',
      modelName: 'reference-runtime',
      command: 'clowder-code',
      startupArgs: ['--json', '--non-interactive'],
      resumeArgs: ['resume', '{sessionId}', '--json'],
    });

    const messages = await collect(
      service.invoke('follow up', {
        sessionId: 'cc-session-1',
        systemPrompt: 'SYSTEM',
        spawnCliOverride: async function* (opts) {
          seenOpts.push(opts);
          yield {
            type: 'turn_result',
            response: 'fresh fallback',
            terminal: { kind: 'completed' },
            stats: { sessionId: 'new-cold-session' },
          };
        },
      }),
    );

    assert.deepEqual(seenOpts[0].args, ['--json', '--non-interactive']);
    assert.equal(seenOpts[0].stdinInput, 'SYSTEM\n\nfollow up');
    assert.deepEqual(
      messages.map((m) => m.type),
      ['system_info', 'session_init', 'text', 'done'],
    );
    assert.match(messages[0].content, /cli_jsonl_resume_requires_single_line_prompt/);
    assert.equal(messages[1].sessionId, 'new-cold-session');
    assert.equal(messages[1].ephemeralSession, false);
    assert.equal(messages[3].metadata.sessionId, 'new-cold-session');
  });

  it('makes stateless session handling explicit instead of emitting continuity metadata', async () => {
    const service = new CliJsonlAgentService({
      catId: 'clowder-code',
      providerName: 'clowder-code',
      modelName: 'reference-runtime',
      command: 'clowder-code',
      sessionPolicy: 'stateless',
    });

    const messages = await collect(
      service.invoke('follow up', {
        sessionId: 'cc-session-1',
        spawnCliOverride: async function* () {
          yield {
            type: 'turn_result',
            response: 'stateless response',
            terminal: { kind: 'completed' },
            stats: { sessionId: 'new-cold-session' },
          };
        },
      }),
    );

    assert.deepEqual(
      messages.map((m) => m.type),
      ['system_info', 'text', 'done'],
    );
    assert.match(messages[0].content, /session_continuity_degraded/);
    assert.equal(messages.some((m) => m.type === 'session_init'), false);
    assert.equal(messages[2].metadata.sessionId, undefined);
  });

  it('passes raw archive diagnostics to spawnCli and archives raw events', async () => {
    const archived = [];
    const service = new CliJsonlAgentService({
      catId: 'clowder-code',
      providerName: 'clowder-code',
      modelName: 'reference-runtime',
      command: 'clowder-code',
      rawArchive: {
        getPath: (invocationId) => `/tmp/archive/${invocationId}.ndjson`,
        append: async (invocationId, payload) => {
          archived.push({ invocationId, payload });
        },
      },
    });

    const seenOpts = [];
    await collect(
      service.invoke('hello', {
        invocationId: 'inv-1',
        spawnCliOverride: async function* (opts) {
          seenOpts.push(opts);
          yield {
            type: 'turn_result',
            response: 'ok',
            terminal: { kind: 'completed' },
            stats: { sessionId: 'cc-session-1' },
            callback_token: 'secret-token',
          };
        },
      }),
    );

    assert.equal(seenOpts[0].rawArchivePath, '/tmp/archive/inv-1.ndjson');
    assert.equal(archived.length, 1);
    assert.equal(archived[0].invocationId, 'inv-1');
    assert.equal(archived[0].payload.callback_token, '[redacted]');
  });

  it('emits a visible error when the CLI exits without a turn_result', async () => {
    const service = new CliJsonlAgentService({
      catId: 'clowder-code',
      providerName: 'clowder-code',
      modelName: 'reference-runtime',
      command: 'clowder-code',
    });

    const messages = await collect(
      service.invoke('hello', {
        spawnCliOverride: async function* () {
          // no events
        },
      }),
    );

    assert.deepEqual(
      messages.map((m) => m.type),
      ['error', 'done'],
    );
    assert.match(messages[0].error, /without a JSONL turn_result/);
  });
});
