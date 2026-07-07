/**
 * MCP Prompt Injector
 * 给没有原生 MCP 支持的猫 (Codex/Gemini) 注入 HTTP callback 指令。
 * Claude 通过 --mcp-config 原生支持 MCP，不需要注入。
 *
 * Skills-as-source-of-truth: Full API docs live in
 *   cat-cafe-skills/refs/mcp-callbacks.md
 * Prompt injection is minimal: credentials + tool list + skill reference.
 * HTTP endpoints preserved as fallback only.
 */

import type { CatConfig } from '@cat-cafe/shared';
import type { AgentService } from '../../types.js';
import { renderSegment } from '../../context/prompt-template-loader.js';

/**
 * Issue #59 — centralized MCP prompt injection decision.
 *
 * Resolves whether to inject native MCP docs (S13 MCP_TOOLS_SECTION) or
 * HTTP callback instructions (C1) based on the provider's capability.
 *
 * Priority: service.mcpPromptMode() > legacy boolean fallback.
 */
export interface McpPromptInjectionResult {
  /** Inject MCP_TOOLS_SECTION into static identity (for Claude-style native MCP) */
  injectNativeMcpDocs: boolean;
  /** Inject C1 HTTP callback instructions per-message (for Codex/Gemini fallback) */
  injectHttpCallbackDocs: boolean;
}

export function resolveMcpPromptInjection(
  service: AgentService,
  catConfig: CatConfig | null | undefined,
  mcpServerPath: string | undefined,
): McpPromptInjectionResult {
  const mode = service.mcpPromptMode?.();
  if (mode !== undefined) {
    return {
      injectNativeMcpDocs: mode === 'native-mcp',
      injectHttpCallbackDocs: mode === 'http-callback',
    };
  }
  // Legacy fallback: mcpSupport && mcpServerPath → native docs; else http callback.
  // Antigravity always skips (LS persistent process can't receive callback env).
  if (catConfig?.clientId === 'antigravity') {
    return { injectNativeMcpDocs: false, injectHttpCallbackDocs: false };
  }
  const mcpAvailable = (catConfig?.mcpSupport ?? false) && !!mcpServerPath;
  return {
    injectNativeMcpDocs: mcpAvailable,
    injectHttpCallbackDocs: !mcpAvailable,
  };
}

export interface McpCallbackOptions {
  /**
   * Example unique handle to show in documentation snippets.
   * Must be routable (e.g. `@codex`, `@opus-45`), not a placeholder like `@catId`.
   */
  exampleHandle?: string;
  /**
   * Current cat id for choosing a non-self @mention example.
   * When present with teammates, we will prefer a teammate handle in examples.
   */
  currentCatId?: string;
  /**
   * Teammate cat ids that are safe to demonstrate in @mention examples.
   * Should NOT include the current cat id; if it does, it will be ignored.
   */
  teammates?: readonly string[];
}

/**
 * Check if a cat needs MCP prompt injection (HTTP callback fallback).
 *
 * F041: Now checks if MCP is *actually available* (config + server path exist),
 * not just the mcpSupport config flag. HTTP callback injection acts as
 * fallback when native MCP is unavailable for any reason.
 *
 * @param mcpAvailable - true when native MCP is configured AND server path exists
 * @param clientId - provider clientId; 'antigravity' skips injection (LS persistent process can't receive callback env)
 */
export function needsMcpInjection(mcpAvailable: boolean, clientId?: string): boolean {
  if (clientId === 'antigravity') return false;
  return !mcpAvailable;
}

function resolveExampleHandle(opts: McpCallbackOptions): string {
  return (
    opts.exampleHandle ??
    (() => {
      const teammate = opts.teammates?.find((id) => id && id !== opts.currentCatId);
      return teammate ? `@${teammate}` : '@opus';
    })()
  );
}

/**
 * Build MCP callback instructions for prompt injection.
 * Template: assets/prompt-templates/c1-mcp-callback.md
 * Full API docs are in cat-cafe-skills/refs/mcp-callbacks.md.
 */
/* @segment C1 — MCP Callback Instructions */
export function buildMcpCallbackInstructions(opts: McpCallbackOptions): string {
  const exampleHandle = resolveExampleHandle(opts);
  return renderSegment('C1', { EXAMPLE_HANDLE: exampleHandle }) ?? '';
}
