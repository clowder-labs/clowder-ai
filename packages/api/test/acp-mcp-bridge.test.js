import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const { buildAcpMcpServers } = await import('../dist/domains/cats/services/agents/providers/acp-mcp-bridge.js');

test('buildAcpMcpServers includes project Claude MCP servers for stdio ACP agents', () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), 'acp-mcp-bridge-'));

  try {
    writeFileSync(
      join(workingDirectory, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
            cwd: '/tmp/workspace',
            env: { TOKEN: '123' },
          },
          'remote-http': {
            type: 'http',
            url: 'https://example.com/mcp',
          },
          'cat-cafe': {
            command: 'node',
            args: ['local-cat-cafe.js'],
          },
        },
      }),
    );

    const servers = buildAcpMcpServers({ agentCapabilities: { mcpCapabilities: { stdio: true } } }, {
      workingDirectory,
      callbackEnv: {
        CAT_CAFE_API_URL: 'http://127.0.0.1:3004',
        CAT_CAFE_INVOCATION_ID: 'inv-test-1',
        CAT_CAFE_CALLBACK_TOKEN: 'tok-test-1',
        CAT_CAFE_USER_ID: 'user-test-1',
        CAT_CAFE_SIGNAL_USER: 'acp',
      },
    });

    assert.equal(servers.length, 4);
    assert.equal(servers[0].name, 'cat-cafe');
    assert.equal(servers[0].transport, 'stdio');
    assert.equal(servers[1].name, 'filesystem');
    assert.equal(servers[1].transport, 'stdio');
    assert.equal(servers[1].command, 'npx');
    assert.deepEqual(servers[1].args, ['-y', '@modelcontextprotocol/server-filesystem']);
    assert.equal(servers[1].cwd, '/tmp/workspace');
    assert.deepEqual(servers[1].env, { TOKEN: '123' });
    assert.equal(servers[2].name, 'remote-http');
    assert.equal(servers[2].transport, 'streamableHttp');
    assert.equal(servers[3].name, 'cat-cafe');
    assert.equal(servers[3].transport, 'stdio');
    assert.equal(servers[3].command, 'node');
    assert.deepEqual(servers[3].args, ['local-cat-cafe.js']);
  } finally {
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});

test('buildAcpMcpServers ignores project MCP config for ACP-native transport', () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), 'acp-mcp-native-'));
  const previousCwd = process.cwd();

  try {
    process.chdir(workingDirectory);
    const servers = buildAcpMcpServers({ agentCapabilities: { mcpCapabilities: { acp: true } } }, { workingDirectory });

    assert.deepEqual(servers, [
      {
        id: 'cat-cafe',
        name: 'cat-cafe',
        transport: 'acp',
        acpId: 'cat-cafe',
      },
    ]);
  } finally {
    process.chdir(previousCwd);
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});

test('ACPMcpBridge reconnects a dropped local MCP subprocess on the first MCP request', async () => {
  const workingDirectory = mkdtempSync(join(tmpdir(), 'acp-mcp-reconnect-'));

  try {
    writeFileSync(
      join(workingDirectory, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          'cat-cafe-collab': {
            command: process.execPath,
            args: [resolve('packages/mcp-server/dist/collab.js')],
          },
        },
      }),
    );

    const { ACPMcpBridge } = await import('../dist/domains/cats/services/agents/providers/acp-mcp-bridge.js');
    const bridge = new ACPMcpBridge({ workingDirectory });
    const responses = [];
    const client = {
      async sendResult(id, result) {
        responses.push({ type: 'result', id, result });
      },
      async sendError(id, error) {
        responses.push({ type: 'error', id, error });
      },
    };

    await bridge.handleInboundMessage(
      client,
      {
        id: 1,
        method: 'mcp/connect',
        params: {
          sessionId: 'session-reconnect',
          acpId: 'cat-cafe-collab',
        },
      },
      'session-reconnect',
    );

    assert.equal(responses.length, 1);
    assert.equal(responses[0].type, 'result');
    const connectionId = responses[0].result.connectionId;
    assert.equal(typeof connectionId, 'string');

    const connection = bridge.connections.get(connectionId);
    assert.ok(connection, 'expected an active local MCP connection');
    await connection.client.close();

    responses.length = 0;
    await bridge.handleInboundMessage(
      client,
      {
        id: 2,
        method: 'mcp/message',
        params: {
          sessionId: 'session-reconnect',
          connectionId,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
              name: 'bridge-test-client',
              version: '1.0.0',
            },
          },
        },
      },
      'session-reconnect',
    );

    assert.equal(responses.length, 1);
    assert.equal(responses[0].type, 'result');
    assert.equal(responses[0].result.serverInfo.name, 'cat-cafe-collab-mcp');

    responses.length = 0;
    await bridge.handleInboundMessage(
      client,
      {
        id: 3,
        method: 'mcp/message',
        params: {
          sessionId: 'session-reconnect',
          connectionId,
          method: 'tools/list',
          params: {},
        },
      },
      'session-reconnect',
    );

    assert.equal(responses.length, 1);
    assert.equal(responses[0].type, 'result');
    assert.ok(
      responses[0].result.tools.some((tool) => tool.name === 'cat_cafe_post_message'),
      'expected cat_cafe_post_message after reconnect',
    );

    await bridge.closeAll();
  } finally {
    rmSync(workingDirectory, { recursive: true, force: true });
  }
});
