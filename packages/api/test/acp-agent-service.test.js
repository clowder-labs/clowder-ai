import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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
