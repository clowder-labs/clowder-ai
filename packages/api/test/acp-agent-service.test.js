import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('buildACPSubprocessEnv', () => {
  it('merges custom ACP env overrides while blocking reserved keys', async () => {
    const {
      buildACPSubprocessEnv,
    } = await import('../dist/config/acp-env.js');

    const previousPath = process.env.PATH;
    const previousOpenAi = process.env.OPENAI_API_KEY;
    const previousCallback = process.env.CAT_CAFE_CALLBACK_TOKEN;
    process.env.PATH = '/usr/bin';
    process.env.OPENAI_API_KEY = 'ambient-openai';
    process.env.CAT_CAFE_CALLBACK_TOKEN = 'secret-token';

    try {
      const env = buildACPSubprocessEnv({
        modelAccessMode: 'clowder_default_profile',
        env: {
          ACP_TRACE_STDIO: '1',
          CUSTOM_FLAG: 'enabled',
          OPENAI_API_KEY: 'override-openai',
          CAT_CAFE_CALLBACK_TOKEN: 'override-token',
        },
      });

      assert.equal(env.PATH, '/usr/bin');
      assert.equal(env.ACP_TRACE_STDIO, '1');
      assert.equal(env.CUSTOM_FLAG, 'enabled');
      assert.equal(env.OPENAI_API_KEY, undefined);
      assert.equal(env.CAT_CAFE_CALLBACK_TOKEN, undefined);
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      if (previousOpenAi === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousOpenAi;
      if (previousCallback === undefined) delete process.env.CAT_CAFE_CALLBACK_TOKEN;
      else process.env.CAT_CAFE_CALLBACK_TOKEN = previousCallback;
    }
  });
});

describe('supportsACPStdioMcpFromInitializeResult', () => {
  it('skips stdio MCP injection when the ACP agent advertises only http and sse MCP transports', async () => {
    const { supportsACPStdioMcpFromInitializeResult } = await import(
      '../dist/domains/cats/services/agents/providers/ACPAgentService.js'
    );

    assert.equal(
      supportsACPStdioMcpFromInitializeResult({
        agentCapabilities: {
          mcpCapabilities: {
            http: true,
            sse: true,
          },
        },
      }),
      false,
    );
  });

  it('keeps stdio MCP injection as the default for agents without explicit MCP transport caps', async () => {
    const { supportsACPStdioMcpFromInitializeResult } = await import(
      '../dist/domains/cats/services/agents/providers/ACPAgentService.js'
    );

    assert.equal(supportsACPStdioMcpFromInitializeResult(undefined), true);
    assert.equal(supportsACPStdioMcpFromInitializeResult({}), true);
  });
});

describe('buildACPMetadata', () => {
  it('uses the ACP provider id as the metadata model label', async () => {
    const { buildACPMetadata } = await import(
      '../dist/domains/cats/services/agents/providers/acp-session-helpers.js'
    );

    assert.deepEqual(buildACPMetadata('sess-1', 'opencode-acp'), {
      provider: 'acp',
      model: 'opencode-acp',
      sessionId: 'sess-1',
    });
  });

  it('falls back to a generic ACP label when no provider id is supplied', async () => {
    const { buildACPMetadata } = await import(
      '../dist/domains/cats/services/agents/providers/acp-session-helpers.js'
    );

    assert.deepEqual(buildACPMetadata(), {
      provider: 'acp',
      model: 'acp',
    });
  });
});

describe('buildACPModelProfileOverridePayload', () => {
  it('omits provider when a legacy ACP model profile leaves it unset', async () => {
    const { buildACPModelProfileOverridePayload } = await import(
      '../dist/domains/cats/services/agents/providers/acp-model-profile-override.js'
    );

    assert.deepEqual(
      buildACPModelProfileOverridePayload({
        id: 'legacy-default',
        displayName: 'Legacy Default',
        model: 'gpt-5.3-codex',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        createdAt: '2026-03-27T00:00:00.000Z',
        updatedAt: '2026-03-27T00:00:00.000Z',
      }),
      {
        name: 'default',
        model: 'gpt-5.3-codex',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
      },
    );
  });
});
