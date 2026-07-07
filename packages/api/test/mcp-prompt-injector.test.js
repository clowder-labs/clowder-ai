/**
 * McpPromptInjector Tests
 * 验证 MCP HTTP callback 注入逻辑
 *
 * Skills-as-SOT: buildMcpCallbackInstructions is now the single form —
 * minimal prompt referencing skills. No more full/short distinction.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('McpPromptInjector', () => {
  // F041: parameter is now mcpAvailable (was mcpSupport), same boolean logic
  it('needsMcpInjection returns false when MCP is available (no fallback needed)', async () => {
    const { needsMcpInjection } = await import('../dist/domains/cats/services/agents/invocation/McpPromptInjector.js');
    assert.equal(needsMcpInjection(true), false);
  });

  it('needsMcpInjection returns true when MCP is unavailable (fallback to HTTP callback)', async () => {
    const { needsMcpInjection } = await import('../dist/domains/cats/services/agents/invocation/McpPromptInjector.js');
    assert.equal(needsMcpInjection(false), true);
  });

  it('needsMcpInjection returns false for antigravity provider (no HTTP callback support)', async () => {
    const { needsMcpInjection } = await import('../dist/domains/cats/services/agents/invocation/McpPromptInjector.js');
    assert.equal(needsMcpInjection(false, 'antigravity'), false);
  });

  it('buildMcpCallbackInstructions references env var credentials', async () => {
    const { buildMcpCallbackInstructions } = await import(
      '../dist/domains/cats/services/agents/invocation/McpPromptInjector.js'
    );
    const instructions = buildMcpCallbackInstructions({});

    assert.ok(instructions.includes('$CAT_CAFE_INVOCATION_ID'), 'should reference INVOCATION_ID env var');
    assert.ok(instructions.includes('$CAT_CAFE_CALLBACK_TOKEN'), 'should reference CALLBACK_TOKEN env var');
  });

  it('buildMcpCallbackInstructions lists all tool names', async () => {
    const { buildMcpCallbackInstructions } = await import(
      '../dist/domains/cats/services/agents/invocation/McpPromptInjector.js'
    );
    const instructions = buildMcpCallbackInstructions({});

    assert.ok(instructions.includes('post-message'), 'should list post-message');
    assert.ok(instructions.includes('register-pr-tracking'), 'should list register-pr-tracking');
    assert.ok(instructions.includes('thread-context'), 'should list thread-context');
    assert.ok(instructions.includes('list-threads'), 'should list list-threads');
    assert.ok(instructions.includes('feat-index'), 'should list feat-index');
    assert.ok(instructions.includes('list-tasks'), 'should list list-tasks');
    assert.ok(instructions.includes('threadId'), 'should mention threadId for cross-thread posting/filtering');
    assert.ok(!instructions.includes('search-messages'), 'should not list non-HTTP endpoint alias');
    assert.ok(instructions.includes('catId'), 'should mention catId query filter');
    assert.ok(instructions.includes('keyword'), 'should mention keyword query filter');
    assert.ok(instructions.includes('pending-mentions'), 'should list pending-mentions');
    assert.ok(instructions.includes('update-task'), 'should list update-task');
    assert.ok(instructions.includes('create-rich-block'), 'should list create-rich-block');
    assert.ok(instructions.includes('search-evidence'), 'should list search-evidence');
    assert.ok(instructions.includes('reflect'), 'should list reflect');
    assert.ok(instructions.includes('retain-memory'), 'should list retain-memory');
    assert.ok(instructions.includes('request-permission'), 'should list request-permission');
  });

  it('buildMcpCallbackInstructions references API endpoints for docs', async () => {
    const { buildMcpCallbackInstructions } = await import(
      '../dist/domains/cats/services/agents/invocation/McpPromptInjector.js'
    );
    const instructions = buildMcpCallbackInstructions({});

    // Must reference API fallback endpoints for full docs
    assert.ok(instructions.includes('/api/callbacks/instructions'), 'should reference instructions endpoint');
    assert.ok(instructions.includes('/api/callbacks/rich-block-rules'), 'should reference rich-block-rules endpoint');

    // Must NOT contain curl examples or hardcoded URLs
    assert.ok(!instructions.includes('curl -sS'), 'should not contain curl examples');
    assert.ok(!instructions.includes('```bash'), 'should not contain bash code blocks');
    assert.ok(!instructions.includes('localhost'), 'should not contain hardcoded URLs');

    // Should reference fallback endpoint via env var (not hardcoded URL)
    assert.ok(instructions.includes('/api/callbacks/instructions'), 'should reference fallback endpoint path');
    assert.ok(instructions.includes('$CAT_CAFE_API_URL'), 'fallback should use env var, not hardcoded host');
  });

  it('buildMcpCallbackInstructions is compact (<750 chars)', async () => {
    const { buildMcpCallbackInstructions } = await import(
      '../dist/domains/cats/services/agents/invocation/McpPromptInjector.js'
    );
    const instructions = buildMcpCallbackInstructions({});

    assert.ok(instructions.length < 750, `Instructions (${instructions.length} chars) should be <750`);
  });

  it('buildMcpCallbackInstructions uses teammate handle (not self) in examples', async () => {
    const { buildMcpCallbackInstructions } = await import(
      '../dist/domains/cats/services/agents/invocation/McpPromptInjector.js'
    );
    const instructions = buildMcpCallbackInstructions({
      currentCatId: 'opus',
      teammates: ['codex'],
    });

    assert.ok(instructions.includes('@codex'), 'should use teammate handle as example');
    assert.ok(!instructions.includes('@opus 请帮我 review'), 'should avoid self-mention example');
  });

  it('buildMcpCallbackInstructions includes @teammate rules', async () => {
    const { buildMcpCallbackInstructions } = await import(
      '../dist/domains/cats/services/agents/invocation/McpPromptInjector.js'
    );
    const instructions = buildMcpCallbackInstructions({
      exampleHandle: '@codex',
    });

    assert.ok(instructions.includes('@队友'), 'should include @teammate section');
    assert.ok(instructions.includes('唯一句柄'), 'should warn about disambiguation');
    assert.ok(!instructions.includes('@catId'), 'should not use non-routable literal @catId example');
    assert.ok(instructions.includes('@codex'), 'should provide a routable handle example');
  });
});

describe('resolveMcpPromptInjection (Issue #59)', () => {
  /** @param {string} mode */
  function mockService(mode) {
    return /** @type {import('../dist/domains/cats/services/types.js').AgentService} */ ({
      invoke: async function* () {},
      mcpPromptMode: () => mode,
    });
  }

  /** Service without mcpPromptMode (legacy path) */
  function legacyService() {
    return /** @type {import('../dist/domains/cats/services/types.js').AgentService} */ ({
      invoke: async function* () {},
    });
  }

  it("CatAgent mcpPromptMode='none' → neither S13 nor C1 injected", async () => {
    const { resolveMcpPromptInjection } = await import(
      '../dist/domains/cats/services/agents/invocation/McpPromptInjector.js'
    );
    const result = resolveMcpPromptInjection(mockService('none'), { mcpSupport: true }, '/some/mcp/server/path');
    assert.equal(result.injectNativeMcpDocs, false, 'should NOT inject S13 native MCP docs');
    assert.equal(result.injectHttpCallbackDocs, false, 'should NOT inject C1 HTTP callback');
  });

  it("Claude mcpPromptMode='native-mcp' → S13 injected, C1 not", async () => {
    const { resolveMcpPromptInjection } = await import(
      '../dist/domains/cats/services/agents/invocation/McpPromptInjector.js'
    );
    const result = resolveMcpPromptInjection(mockService('native-mcp'), { mcpSupport: true }, '/some/mcp/server/path');
    assert.equal(result.injectNativeMcpDocs, true, 'should inject S13 native MCP docs');
    assert.equal(result.injectHttpCallbackDocs, false, 'should NOT inject C1');
  });

  it("Codex mcpPromptMode='http-callback' → C1 injected, S13 not", async () => {
    const { resolveMcpPromptInjection } = await import(
      '../dist/domains/cats/services/agents/invocation/McpPromptInjector.js'
    );
    const result = resolveMcpPromptInjection(mockService('http-callback'), { mcpSupport: false }, undefined);
    assert.equal(result.injectNativeMcpDocs, false, 'should NOT inject S13');
    assert.equal(result.injectHttpCallbackDocs, true, 'should inject C1 HTTP callback');
  });

  it('legacy fallback: mcpSupport=true + mcpServerPath → S13 (back-compat)', async () => {
    const { resolveMcpPromptInjection } = await import(
      '../dist/domains/cats/services/agents/invocation/McpPromptInjector.js'
    );
    const result = resolveMcpPromptInjection(legacyService(), { mcpSupport: true }, '/some/mcp/server/path');
    assert.equal(result.injectNativeMcpDocs, true, 'legacy: mcpAvailable=true → S13');
    assert.equal(result.injectHttpCallbackDocs, false, 'legacy: mcpAvailable=true → no C1');
  });

  it('legacy fallback: mcpSupport=false → C1 (back-compat)', async () => {
    const { resolveMcpPromptInjection } = await import(
      '../dist/domains/cats/services/agents/invocation/McpPromptInjector.js'
    );
    const result = resolveMcpPromptInjection(legacyService(), { mcpSupport: false }, '/some/mcp/server/path');
    assert.equal(result.injectNativeMcpDocs, false, 'legacy: mcpAvailable=false → no S13');
    assert.equal(result.injectHttpCallbackDocs, true, 'legacy: mcpAvailable=false → C1');
  });

  it('legacy fallback: antigravity → neither (special case preserved)', async () => {
    const { resolveMcpPromptInjection } = await import(
      '../dist/domains/cats/services/agents/invocation/McpPromptInjector.js'
    );
    const result = resolveMcpPromptInjection(
      legacyService(),
      { clientId: 'antigravity', mcpSupport: false },
      undefined,
    );
    assert.equal(result.injectNativeMcpDocs, false, 'antigravity: no S13');
    assert.equal(result.injectHttpCallbackDocs, false, 'antigravity: no C1');
  });

  it("mcpPromptMode='none' overrides even when mcpSupport=true (capability > config)", async () => {
    const { resolveMcpPromptInjection } = await import(
      '../dist/domains/cats/services/agents/invocation/McpPromptInjector.js'
    );
    // CatAgent scenario: config says mcpSupport=true but service knows better
    const result = resolveMcpPromptInjection(
      mockService('none'),
      { mcpSupport: true, clientId: 'catagent' },
      '/some/mcp/server/path',
    );
    assert.equal(result.injectNativeMcpDocs, false, 'capability should override config');
    assert.equal(result.injectHttpCallbackDocs, false, 'capability should override config');
  });
});
