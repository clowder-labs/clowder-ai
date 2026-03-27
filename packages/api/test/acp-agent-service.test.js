import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

describe('resolveACPMcpTransportFromInitializeResult', () => {
  it('prefers ACP transport when the ACP agent advertises MCP-over-ACP support', async () => {
    const { resolveACPMcpTransportFromInitializeResult } = await import(
      '../dist/domains/cats/services/agents/providers/acp-mcp-bridge.js'
    );

    assert.equal(
      resolveACPMcpTransportFromInitializeResult({
        agentCapabilities: {
          mcpCapabilities: {
            acp: true,
            stdio: true,
          },
        },
      }),
      'acp',
    );
  });

  it('disables host MCP injection when no supported MCP transport is advertised', async () => {
    const { resolveACPMcpTransportFromInitializeResult } = await import(
      '../dist/domains/cats/services/agents/providers/acp-mcp-bridge.js'
    );

    assert.equal(
      resolveACPMcpTransportFromInitializeResult({
        agentCapabilities: {
          mcpCapabilities: {
            http: true,
            sse: true,
          },
        },
      }),
      null,
    );
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

describe('ACPAgentService resume dispatch', () => {
  async function withFakeACPAgent(testFn) {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'acp-agent-service-'));
    const logFile = path.join(tempDir, 'methods.json');
    const scriptFile = path.join(tempDir, 'fake-acp-agent.mjs');
    const script = `
import { appendFileSync } from 'node:fs';

const logFile = process.env.ACP_TEST_LOG_FILE;
let buffer = '';

function write(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  process.stdout.write(\`Content-Length: \${payload.length}\\r\\n\\r\\n\`);
  process.stdout.write(payload);
}

function handle(message) {
  if (!message || typeof message !== 'object' || typeof message.method !== 'string') return;
  appendFileSync(logFile, \`\${JSON.stringify(message.method)}\\n\`);
  const params = message.params && typeof message.params === 'object' ? message.params : {};
  if (message.method === 'initialize') {
    write({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: { audio: false, embeddedContext: false, image: false },
          mcpCapabilities: { http: true, sse: true },
        },
      },
    });
    return;
  }
  if (message.method === 'session/new' || message.method === 'session/load') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: params.sessionId || 'sess-test' } });
    return;
  }
  if (message.method === 'session/resume' || message.method === 'session/prompt') {
    write({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        stopReason: 'end_turn',
        runStatus: message.method === 'session/resume' ? 'paused' : 'completed',
        recoverable: message.method === 'session/resume',
      },
    });
    return;
  }
  write({ jsonrpc: '2.0', id: message.id, result: {} });
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const headerEnd = buffer.indexOf('\\r\\n\\r\\n');
    if (headerEnd === -1) break;
    const header = buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length:\\s*(\\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number.parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + length) break;
    const body = buffer.slice(bodyStart, bodyStart + length);
    buffer = buffer.slice(bodyStart + length);
    handle(JSON.parse(body));
  }
});
`;
    await writeFile(scriptFile, script);
    try {
      await testFn({ logFile, scriptFile });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  it('uses session/resume for explicit interrupted-session resume requests', async () => {
    await withFakeACPAgent(async ({ logFile, scriptFile }) => {
      const { ACPAgentService } = await import('../dist/domains/cats/services/agents/providers/ACPAgentService.js');
      const service = new ACPAgentService({ catId: 'codex' });
      const providerProfile = {
        id: 'agent-teams-test',
        kind: 'acp',
        protocol: 'acp',
        authType: 'none',
        modelAccessMode: 'bring_your_own_key',
        command: process.execPath,
        args: [scriptFile],
        cwd: process.cwd(),
        env: { ACP_TEST_LOG_FILE: logFile },
      };

      const messages = [];
      for await (const msg of service.invoke('continue from interruption', {
        providerProfile,
        sessionId: 'sess-test',
        resumeSession: true,
      })) {
        messages.push(msg);
      }

      const methods = (await readFile(logFile, 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));

      assert.deepEqual(methods, ['initialize', 'session/load', 'session/resume']);
      assert.equal(messages.some((msg) => msg.type === 'session_init'), true);
      assert.equal(messages.some((msg) => msg.type === 'done'), true);
    });
  });

  it('uses session/prompt for normal ACP turns', async () => {
    await withFakeACPAgent(async ({ logFile, scriptFile }) => {
      const { ACPAgentService } = await import('../dist/domains/cats/services/agents/providers/ACPAgentService.js');
      const service = new ACPAgentService({ catId: 'codex' });
      const providerProfile = {
        id: 'agent-teams-test',
        kind: 'acp',
        protocol: 'acp',
        authType: 'none',
        modelAccessMode: 'bring_your_own_key',
        command: process.execPath,
        args: [scriptFile],
        cwd: process.cwd(),
        env: { ACP_TEST_LOG_FILE: logFile },
      };

      for await (const _msg of service.invoke('fresh prompt', {
        providerProfile,
        sessionId: 'sess-test',
      })) {
        // exhaust stream
      }

      const methods = (await readFile(logFile, 'utf8'))
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));

      assert.deepEqual(methods, ['initialize', 'session/load', 'session/prompt']);
    });
  });

  it('drops trailing session/load replay updates before streaming resume output', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'acp-agent-service-replay-'));
    const logFile = path.join(tempDir, 'methods.json');
    const scriptFile = path.join(tempDir, 'fake-acp-agent-replay.mjs');
    const script = `
import { appendFileSync } from 'node:fs';

const logFile = process.env.ACP_TEST_LOG_FILE;
let buffer = '';

function write(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  process.stdout.write(\`Content-Length: \${payload.length}\\r\\n\\r\\n\`);
  process.stdout.write(payload);
}

function notify(text) {
  write({
    jsonrpc: '2.0',
    method: 'session/update',
    params: {
      sessionId: 'sess-test',
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text },
      },
    },
  });
}

function handle(message) {
  if (!message || typeof message !== 'object' || typeof message.method !== 'string') return;
  appendFileSync(logFile, \`\${JSON.stringify(message.method)}\\n\`);
  const params = message.params && typeof message.params === 'object' ? message.params : {};
  if (message.method === 'initialize') {
    write({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: 1,
        agentCapabilities: {
          loadSession: true,
          promptCapabilities: { audio: false, embeddedContext: false, image: false },
          mcpCapabilities: { http: true, sse: true },
        },
      },
    });
    return;
  }
  if (message.method === 'session/load') {
    write({ jsonrpc: '2.0', id: message.id, result: { sessionId: params.sessionId || 'sess-test' } });
    setTimeout(() => notify('loaded history'), 10);
    return;
  }
  if (message.method === 'session/resume') {
    setTimeout(() => notify('resumed continuation'), 20);
    setTimeout(() => {
      write({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          stopReason: 'end_turn',
          runStatus: 'completed',
          recoverable: false,
        },
      });
    }, 40);
    return;
  }
  write({ jsonrpc: '2.0', id: message.id, result: {} });
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const headerEnd = buffer.indexOf('\\r\\n\\r\\n');
    if (headerEnd === -1) break;
    const header = buffer.slice(0, headerEnd);
    const match = header.match(/Content-Length:\\s*(\\d+)/i);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number.parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + length) break;
    const body = buffer.slice(bodyStart, bodyStart + length);
    buffer = buffer.slice(bodyStart + length);
    handle(JSON.parse(body));
  }
});
`;
    await writeFile(scriptFile, script);
    try {
      const { ACPAgentService } = await import('../dist/domains/cats/services/agents/providers/ACPAgentService.js');
      const service = new ACPAgentService({ catId: 'codex' });
      const providerProfile = {
        id: 'agent-teams-test',
        kind: 'acp',
        protocol: 'acp',
        authType: 'none',
        modelAccessMode: 'bring_your_own_key',
        command: process.execPath,
        args: [scriptFile],
        cwd: process.cwd(),
        env: { ACP_TEST_LOG_FILE: logFile },
      };

      const textOutputs = [];
      for await (const msg of service.invoke('continue from interruption', {
        providerProfile,
        sessionId: 'sess-test',
        resumeSession: true,
      })) {
        if (msg.type === 'text') textOutputs.push(msg.content);
      }

      assert.deepEqual(textOutputs, ['resumed continuation']);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
