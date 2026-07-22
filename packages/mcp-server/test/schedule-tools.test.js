/**
 * F139 Phase 3A: Schedule MCP Tools (AC-G2)
 * Tests for cat_cafe_list_schedule_templates, cat_cafe_register_scheduled_task, cat_cafe_remove_scheduled_task
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';

async function withScheduleCallbackServer(handler) {
  const requests = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: raw ? JSON.parse(raw) : null,
      });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.equal(typeof address, 'object');
  assert.ok(address);

  const oldEnv = {
    apiUrl: process.env.CAT_CAFE_API_URL,
    invocationId: process.env.CAT_CAFE_INVOCATION_ID,
    callbackToken: process.env.CAT_CAFE_CALLBACK_TOKEN,
    agentKeySecret: process.env.CAT_CAFE_AGENT_KEY_SECRET,
    agentKeyFile: process.env.CAT_CAFE_AGENT_KEY_FILE,
    agentKeyFiles: process.env.CAT_CAFE_AGENT_KEY_FILES,
    retryDelaysMs: process.env.CAT_CAFE_CALLBACK_RETRY_DELAYS_MS,
  };

  process.env.CAT_CAFE_API_URL = `http://127.0.0.1:${address.port}`;
  delete process.env.CAT_CAFE_INVOCATION_ID;
  delete process.env.CAT_CAFE_CALLBACK_TOKEN;
  delete process.env.CAT_CAFE_AGENT_KEY_SECRET;
  delete process.env.CAT_CAFE_AGENT_KEY_FILE;
  process.env.CAT_CAFE_CALLBACK_RETRY_DELAYS_MS = '0';

  try {
    return await handler(requests);
  } finally {
    if (oldEnv.apiUrl === undefined) delete process.env.CAT_CAFE_API_URL;
    else process.env.CAT_CAFE_API_URL = oldEnv.apiUrl;
    if (oldEnv.invocationId === undefined) delete process.env.CAT_CAFE_INVOCATION_ID;
    else process.env.CAT_CAFE_INVOCATION_ID = oldEnv.invocationId;
    if (oldEnv.callbackToken === undefined) delete process.env.CAT_CAFE_CALLBACK_TOKEN;
    else process.env.CAT_CAFE_CALLBACK_TOKEN = oldEnv.callbackToken;
    if (oldEnv.agentKeySecret === undefined) delete process.env.CAT_CAFE_AGENT_KEY_SECRET;
    else process.env.CAT_CAFE_AGENT_KEY_SECRET = oldEnv.agentKeySecret;
    if (oldEnv.agentKeyFile === undefined) delete process.env.CAT_CAFE_AGENT_KEY_FILE;
    else process.env.CAT_CAFE_AGENT_KEY_FILE = oldEnv.agentKeyFile;
    if (oldEnv.agentKeyFiles === undefined) delete process.env.CAT_CAFE_AGENT_KEY_FILES;
    else process.env.CAT_CAFE_AGENT_KEY_FILES = oldEnv.agentKeyFiles;
    if (oldEnv.retryDelaysMs === undefined) delete process.env.CAT_CAFE_CALLBACK_RETRY_DELAYS_MS;
    else process.env.CAT_CAFE_CALLBACK_RETRY_DELAYS_MS = oldEnv.retryDelaysMs;
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('Schedule MCP Tools — module exports', () => {
  test('scheduleTools array exports 4 tools', async () => {
    const { scheduleTools } = await import('../dist/tools/schedule-tools.js');
    assert.equal(scheduleTools.length, 4);
  });

  test('cat_cafe_preview_scheduled_task exists with templateId + trigger (P1-1: draft step)', async () => {
    const { scheduleTools, previewScheduledTaskInputSchema } = await import('../dist/tools/schedule-tools.js');
    const tool = scheduleTools.find((t) => t.name === 'cat_cafe_preview_scheduled_task');
    assert.ok(tool, 'preview tool should exist');
    assert.ok(previewScheduledTaskInputSchema.templateId, 'templateId schema required');
    assert.ok(previewScheduledTaskInputSchema.trigger, 'trigger schema required');
    assert.ok(tool.description.toLowerCase().includes('preview'), 'description should mention preview');
  });

  test('cat_cafe_list_schedule_templates has correct shape', async () => {
    const { scheduleTools } = await import('../dist/tools/schedule-tools.js');
    const tool = scheduleTools.find((t) => t.name === 'cat_cafe_list_schedule_templates');
    assert.ok(tool, 'tool should exist');
    assert.equal(typeof tool.description, 'string');
    assert.equal(typeof tool.handler, 'function');
    assert.ok(tool.inputSchema.agentKeyCatId, 'shared persistent MCP callers can pass agentKeyCatId');
    assert.equal(
      tool.inputSchema.agentKeyCatId.isOptional(),
      true,
      'list templates should still have no required inputs',
    );
  });

  test('cat_cafe_register_scheduled_task has templateId + trigger required', async () => {
    const { scheduleTools, registerScheduledTaskInputSchema } = await import('../dist/tools/schedule-tools.js');
    const tool = scheduleTools.find((t) => t.name === 'cat_cafe_register_scheduled_task');
    assert.ok(tool, 'tool should exist');
    assert.ok(registerScheduledTaskInputSchema.templateId, 'templateId schema required');
    assert.ok(registerScheduledTaskInputSchema.trigger, 'trigger schema required');
    assert.match(tool.description, /Approval Hub proposal/);
    assert.match(tool.description, /not persisted or run until the operator approves/i);
  });

  test('register description distinguishes user confirmation from workflow-mandated registrations', async () => {
    const { scheduleTools } = await import('../dist/tools/schedule-tools.js');
    const previewTool = scheduleTools.find((t) => t.name === 'cat_cafe_preview_scheduled_task');
    const registerTool = scheduleTools.find((t) => t.name === 'cat_cafe_register_scheduled_task');
    assert.ok(previewTool, 'preview tool should exist');
    assert.ok(registerTool, 'register tool should exist');

    assert.match(previewTool.description, /workflow-mandated/i);
    assert.match(previewTool.description, /target/i);
    assert.match(previewTool.description, /actor/i);
    assert.match(previewTool.description, /idempotency key/i);
    assert.match(registerTool.description, /workflow-mandated/i);
    assert.match(registerTool.description, /no extra user confirmation/i);
    assert.match(registerTool.description, /trusted built-in canonical merge-gate Step 7\.6/i);
    assert.match(registerTool.description, /plugin\/project\/user\/external skills do not qualify/i);
    assert.match(registerTool.description, /different schedule semantics returns a conflict/i);
    assert.doesNotMatch(registerTool.description, /explicit SOP\/skill step/i);
  });

  test('schedule skills document the workflow-mandated registration exception', () => {
    const scheduleSkill = readFileSync(
      new URL('../../../cat-cafe-skills/schedule-tasks/SKILL.md', import.meta.url),
      'utf8',
    );
    const mergeGateSkill = readFileSync(
      new URL('../../../cat-cafe-skills/merge-gate/SKILL.md', import.meta.url),
      'utf8',
    );

    assert.match(scheduleSkill, /workflow-mandated/i);
    assert.match(scheduleSkill, /no extra user confirmation/i);
    assert.match(scheduleSkill, /trusted built-in canonical `merge-gate` Step 7\.6/i);
    assert.match(scheduleSkill, /plugin\/project\/user\/external skills do not qualify/i);
    assert.doesNotMatch(scheduleSkill, /明确 SOP\/skill 步骤要求注册定时任务/);
    assert.match(mergeGateSkill, /workflow-mandated/i);
    assert.match(mergeGateSkill, /cat_cafe_preview_scheduled_task/);
    assert.match(mergeGateSkill, /idempotencyKey/);
    assert.match(mergeGateSkill, /targetCatId/);
    assert.match(mergeGateSkill, /actor\.createdBy/);
    assert.match(mergeGateSkill, /IDEMPOTENCY_CONFLICT/);
    assert.match(mergeGateSkill, /no extra user confirmation/i);
  });

  test('cat_cafe_register_scheduled_task accepts an idempotency key for workflow replay safety', async () => {
    const { registerScheduledTaskInputSchema } = await import('../dist/tools/schedule-tools.js');
    assert.ok(registerScheduledTaskInputSchema.idempotencyKey, 'idempotencyKey schema required');
  });

  test('cat_cafe_preview_scheduled_task accepts an idempotency key for workflow audit parity', async () => {
    const { previewScheduledTaskInputSchema } = await import('../dist/tools/schedule-tools.js');
    assert.ok(previewScheduledTaskInputSchema.idempotencyKey, 'idempotencyKey schema required');
  });

  test('cat_cafe_register_scheduled_task forwards idempotencyKey to the API', async () => {
    const originalFetch = globalThis.fetch;
    const originalApiUrl = process.env.CAT_CAFE_API_URL;
    const originalInvocationId = process.env.CAT_CAFE_INVOCATION_ID;
    const originalCallbackToken = process.env.CAT_CAFE_CALLBACK_TOKEN;
    let postedBody;

    process.env.CAT_CAFE_API_URL = 'http://127.0.0.1:3004';
    process.env.CAT_CAFE_INVOCATION_ID = 'inv-schedule-test';
    process.env.CAT_CAFE_CALLBACK_TOKEN = 'tok-schedule-test';

    globalThis.fetch = async (_url, options) => {
      postedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ success: true, task: { id: 'dyn-1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const { handleRegisterScheduledTask } = await import('../dist/tools/schedule-tools.js');
      const result = await handleRegisterScheduledTask({
        templateId: 'reminder',
        trigger: JSON.stringify({ type: 'once', delayMs: 1209600000 }),
        params: JSON.stringify({ message: 'hotfix upgrade review' }),
        idempotencyKey: 'workflow:merge-gate:hotfix-upgrade-review:clowder-labs/clowder-ai#92',
      });

      assert.equal(result.isError, undefined);
      assert.equal(postedBody.idempotencyKey, 'workflow:merge-gate:hotfix-upgrade-review:clowder-labs/clowder-ai#92');
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiUrl === undefined) delete process.env.CAT_CAFE_API_URL;
      else process.env.CAT_CAFE_API_URL = originalApiUrl;
      if (originalInvocationId === undefined) delete process.env.CAT_CAFE_INVOCATION_ID;
      else process.env.CAT_CAFE_INVOCATION_ID = originalInvocationId;
      if (originalCallbackToken === undefined) delete process.env.CAT_CAFE_CALLBACK_TOKEN;
      else process.env.CAT_CAFE_CALLBACK_TOKEN = originalCallbackToken;
    }
  });

  test('cat_cafe_preview_scheduled_task forwards the same workflow fields as registration', async () => {
    const originalFetch = globalThis.fetch;
    const originalApiUrl = process.env.CAT_CAFE_API_URL;
    const originalInvocationId = process.env.CAT_CAFE_INVOCATION_ID;
    const originalCallbackToken = process.env.CAT_CAFE_CALLBACK_TOKEN;
    const originalCatId = process.env.CAT_CAFE_CAT_ID;
    let postedBody;

    process.env.CAT_CAFE_API_URL = 'http://127.0.0.1:3004';
    process.env.CAT_CAFE_INVOCATION_ID = 'inv-schedule-preview-test';
    process.env.CAT_CAFE_CALLBACK_TOKEN = 'tok-schedule-preview-test';
    process.env.CAT_CAFE_CAT_ID = 'codex';

    globalThis.fetch = async (_url, options) => {
      postedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({ draft: postedBody }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const { handlePreviewScheduledTask } = await import('../dist/tools/schedule-tools.js');
      const result = await handlePreviewScheduledTask({
        templateId: 'reminder',
        trigger: JSON.stringify({ type: 'once', delayMs: 1209600000 }),
        params: JSON.stringify({ message: 'hotfix upgrade review' }),
        label: 'Hotfix upgrade review',
        category: 'pr',
        description: 'Review hotfix after 14 days',
        idempotencyKey: 'workflow:merge-gate:hotfix-upgrade-review:clowder-labs/clowder-ai#92',
      });

      assert.equal(result.isError, undefined);
      assert.equal(postedBody.params.targetCatId, 'codex');
      assert.equal(postedBody.idempotencyKey, 'workflow:merge-gate:hotfix-upgrade-review:clowder-labs/clowder-ai#92');
      assert.deepEqual(postedBody.display, {
        label: 'Hotfix upgrade review',
        category: 'pr',
        description: 'Review hotfix after 14 days',
      });
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiUrl === undefined) delete process.env.CAT_CAFE_API_URL;
      else process.env.CAT_CAFE_API_URL = originalApiUrl;
      if (originalInvocationId === undefined) delete process.env.CAT_CAFE_INVOCATION_ID;
      else process.env.CAT_CAFE_INVOCATION_ID = originalInvocationId;
      if (originalCallbackToken === undefined) delete process.env.CAT_CAFE_CALLBACK_TOKEN;
      else process.env.CAT_CAFE_CALLBACK_TOKEN = originalCallbackToken;
      if (originalCatId === undefined) delete process.env.CAT_CAFE_CAT_ID;
      else process.env.CAT_CAFE_CAT_ID = originalCatId;
    }
  });

  test('cat_cafe_remove_scheduled_task exposes task and verified-thread selectors', async () => {
    const { scheduleTools, removeScheduledTaskInputSchema } = await import('../dist/tools/schedule-tools.js');
    const tool = scheduleTools.find((t) => t.name === 'cat_cafe_remove_scheduled_task');
    assert.ok(tool, 'tool should exist');
    assert.ok(removeScheduledTaskInputSchema.taskId, 'taskId schema required');
    assert.ok(removeScheduledTaskInputSchema.sourceThreadId, 'agent-key removal requires a verified source thread');
    assert.ok(removeScheduledTaskInputSchema.agentKeyCatId, 'shared persistent MCP callers can select their agent key');
  });

  test('handlers return error when callback config missing', async () => {
    // Ensure env vars are NOT set so handlers fail gracefully
    const origUrl = process.env['CAT_CAFE_API_URL'];
    const origInv = process.env['CAT_CAFE_INVOCATION_ID'];
    const origTok = process.env['CAT_CAFE_CALLBACK_TOKEN'];
    delete process.env['CAT_CAFE_API_URL'];
    delete process.env['CAT_CAFE_INVOCATION_ID'];
    delete process.env['CAT_CAFE_CALLBACK_TOKEN'];

    try {
      const { handleListScheduleTemplates, handleRegisterScheduledTask, handleRemoveScheduledTask } = await import(
        '../dist/tools/schedule-tools.js'
      );

      const listResult = await handleListScheduleTemplates({});
      assert.equal(listResult.isError, true);

      const regResult = await handleRegisterScheduledTask({
        templateId: 'reminder',
        trigger: JSON.stringify({ type: 'cron', expression: '0 9 * * *' }),
      });
      assert.equal(regResult.isError, true);

      const rmResult = await handleRemoveScheduledTask({ taskId: 'dyn-001' });
      assert.equal(rmResult.isError, true);
    } finally {
      // Restore
      if (origUrl) process.env['CAT_CAFE_API_URL'] = origUrl;
      if (origInv) process.env['CAT_CAFE_INVOCATION_ID'] = origInv;
      if (origTok) process.env['CAT_CAFE_CALLBACK_TOKEN'] = origTok;
    }
  });
});

describe('Schedule tools in registration', () => {
  test('scheduleTools are in collabTools surface', async () => {
    const { createCollabServer } = await import('../dist/collab.js');
    const server = createCollabServer();
    const registered = Object.keys(server._registeredTools);

    assert.ok(
      registered.includes('cat_cafe_list_schedule_templates'),
      'list_schedule_templates should be registered in collab surface',
    );
    assert.ok(
      registered.includes('cat_cafe_register_scheduled_task'),
      'register_scheduled_task should be registered in collab surface',
    );
    assert.ok(
      registered.includes('cat_cafe_remove_scheduled_task'),
      'remove_scheduled_task should be registered in collab surface',
    );
  });

  test('readonly + agent-key collab surface exposes schedule setup and governed removal proposals', async () => {
    const { buildCollabTools } = await import('../dist/server-toolsets.js');
    const registered = buildCollabTools({ readonly: true, hasAgentKey: true }).map((tool) => tool.name);

    assert.ok(
      registered.includes('cat_cafe_list_schedule_templates'),
      'list_schedule_templates should be visible to AGY agent-key cats',
    );
    assert.ok(
      registered.includes('cat_cafe_preview_scheduled_task'),
      'preview_scheduled_task should be visible to AGY agent-key cats',
    );
    assert.ok(
      registered.includes('cat_cafe_register_scheduled_task'),
      'register_scheduled_task should be visible to AGY agent-key cats',
    );
    assert.ok(
      registered.includes('cat_cafe_remove_scheduled_task'),
      'remove_scheduled_task should be visible because verified cats now create an Approval Hub proposal',
    );
  });

  test('shared Antigravity schedule register rejects missing deliveryThreadId before posting inert tasks', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cat-cafe-schedule-agent-key-'));
    try {
      await withScheduleCallbackServer(async (requests) => {
        const keyFile = join(tempDir, 'gemini35.secret');
        writeFileSync(keyFile, 'schedule-agent-secret\n', { mode: 0o600 });
        process.env.CAT_CAFE_AGENT_KEY_FILES = JSON.stringify({ gemini35: keyFile });

        const { handleRegisterScheduledTask } = await import('../dist/tools/schedule-tools.js');

        const registerResult = await handleRegisterScheduledTask({
          templateId: 'reminder',
          trigger: JSON.stringify({ type: 'once', delayMs: 120000 }),
          params: JSON.stringify({ message: 'check in' }),
          agentKeyCatId: 'gemini35',
        });

        assert.equal(registerResult.isError, true);
        assert.match(registerResult.content[0].text, /deliveryThreadId/);
        assert.equal(requests.length, 0, 'must fail before creating a no-delivery-thread schedule');
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('invocation-token schedule calls ignore agentKeyCatId for auth mode preflight', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cat-cafe-schedule-invocation-'));
    const oldCatId = process.env.CAT_CAFE_CAT_ID;
    try {
      await withScheduleCallbackServer(async (requests) => {
        const keyFile = join(tempDir, 'gemini35.secret');
        writeFileSync(keyFile, 'schedule-agent-secret\n', { mode: 0o600 });
        process.env.CAT_CAFE_AGENT_KEY_FILES = JSON.stringify({ gemini35: keyFile });
        process.env.CAT_CAFE_INVOCATION_ID = 'invocation-schedule-id';
        process.env.CAT_CAFE_CALLBACK_TOKEN = 'invocation-schedule-token';
        process.env.CAT_CAFE_CAT_ID = 'opus';

        const { handlePreviewScheduledTask, handleRegisterScheduledTask } = await import(
          '../dist/tools/schedule-tools.js'
        );

        const previewResult = await handlePreviewScheduledTask({
          templateId: 'reminder',
          trigger: JSON.stringify({ type: 'once', delayMs: 120000 }),
          params: JSON.stringify({ message: 'check in' }),
          agentKeyCatId: 'gemini35',
        });
        const registerResult = await handleRegisterScheduledTask({
          templateId: 'reminder',
          trigger: JSON.stringify({ type: 'once', delayMs: 120000 }),
          params: JSON.stringify({ message: 'check in' }),
          agentKeyCatId: 'gemini35',
        });

        assert.equal(previewResult.isError, undefined);
        assert.equal(registerResult.isError, undefined);
        assert.equal(requests.length, 2);
        for (const request of requests) {
          assert.equal(request.headers['x-invocation-id'], 'invocation-schedule-id');
          assert.equal(request.headers['x-callback-token'], 'invocation-schedule-token');
          assert.equal(request.headers['x-agent-key-secret'], undefined);
          assert.equal(request.body.deliveryThreadId, undefined);
        }
        assert.equal(
          requests[1].body.params.targetCatId,
          'opus',
          'invocation-token mode should ignore agentKeyCatId when choosing the default schedule target',
        );
      });
    } finally {
      if (oldCatId === undefined) delete process.env.CAT_CAFE_CAT_ID;
      else process.env.CAT_CAFE_CAT_ID = oldCatId;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('shared Antigravity schedule setup tools use variant-scoped agent-key credentials', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cat-cafe-schedule-agent-key-'));
    try {
      await withScheduleCallbackServer(async (requests) => {
        const keyFile = join(tempDir, 'gemini35.secret');
        writeFileSync(keyFile, 'schedule-agent-secret\n', { mode: 0o600 });
        process.env.CAT_CAFE_AGENT_KEY_FILES = JSON.stringify({ gemini35: keyFile });

        const { handleListScheduleTemplates, handlePreviewScheduledTask, handleRegisterScheduledTask } = await import(
          '../dist/tools/schedule-tools.js'
        );

        const listResult = await handleListScheduleTemplates({ agentKeyCatId: 'gemini35' });
        const previewResult = await handlePreviewScheduledTask({
          templateId: 'reminder',
          trigger: JSON.stringify({ type: 'once', delayMs: 120000 }),
          params: JSON.stringify({ message: 'check in' }),
          deliveryThreadId: 'thread-agy-schedule',
          agentKeyCatId: 'gemini35',
        });
        const registerResult = await handleRegisterScheduledTask({
          templateId: 'reminder',
          trigger: JSON.stringify({ type: 'once', delayMs: 120000 }),
          params: JSON.stringify({ message: 'check in' }),
          deliveryThreadId: 'thread-agy-schedule',
          agentKeyCatId: 'gemini35',
        });

        assert.equal(listResult.isError, undefined);
        assert.equal(previewResult.isError, undefined);
        assert.equal(registerResult.isError, undefined);
        assert.equal(requests.length, 3);
        assert.equal(requests[0].method, 'GET');
        assert.equal(requests[0].url, '/api/schedule/templates');
        assert.equal(requests[1].method, 'POST');
        assert.equal(requests[1].url, '/api/schedule/tasks/preview');
        assert.equal(requests[2].method, 'POST');
        assert.equal(requests[2].url, '/api/schedule/tasks');
        for (const request of requests) {
          assert.equal(request.headers['x-agent-key-secret'], 'schedule-agent-secret');
          assert.equal(request.headers['x-invocation-id'], undefined);
          assert.equal(request.headers['x-callback-token'], undefined);
        }
        assert.equal(
          requests[2].body.params.targetCatId,
          'gemini35',
          'register should default the scheduled wake target to the selected agent-key cat',
        );
        assert.equal(requests[2].body.deliveryThreadId, 'thread-agy-schedule');
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('shared Antigravity schedule removal requires and forwards a verified source thread', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'cat-cafe-schedule-remove-agent-key-'));
    try {
      await withScheduleCallbackServer(async (requests) => {
        const keyFile = join(tempDir, 'gemini35.secret');
        writeFileSync(keyFile, 'schedule-agent-secret\n', { mode: 0o600 });
        process.env.CAT_CAFE_AGENT_KEY_FILES = JSON.stringify({ gemini35: keyFile });

        const { handleRemoveScheduledTask } = await import('../dist/tools/schedule-tools.js');
        const missingThread = await handleRemoveScheduledTask({
          taskId: 'dyn-agent-key-remove',
          agentKeyCatId: 'gemini35',
        });
        assert.equal(missingThread.isError, true);
        assert.match(missingThread.content[0].text, /sourceThreadId/);
        assert.equal(requests.length, 0, 'must fail before issuing an unscoped destructive request');

        const removed = await handleRemoveScheduledTask({
          taskId: 'dyn-agent-key-remove',
          sourceThreadId: 'thread-agent-key-remove',
          agentKeyCatId: 'gemini35',
        });
        assert.equal(removed.isError, undefined);
        assert.equal(requests.length, 1);
        assert.equal(requests[0].method, 'DELETE');
        assert.equal(
          requests[0].url,
          '/api/schedule/tasks/dyn-agent-key-remove?sourceThreadId=thread-agent-key-remove',
        );
        assert.equal(requests[0].headers['x-agent-key-secret'], 'schedule-agent-secret');
        assert.equal(requests[0].headers['x-invocation-id'], undefined);
      });
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
