/**
 * Built-in Provider Plugins
 * Registers all internal providers via the ClowderProviderPlugin interface.
 * Eliminates the hardcoded switch block in index.ts.
 */

import { join } from 'node:path';
import type { ClowderProviderPlugin, AgentServiceFactoryContext, McpConfigWriter } from '@clowder/core';
import type { AgentService } from '@clowder/core';
import { ClaudeAgentService } from '../../domains/cats/services/agents/providers/ClaudeAgentService.js';
import { CodexAgentService } from '../../domains/cats/services/agents/providers/CodexAgentService.js';
import { GeminiAgentService } from '../../domains/cats/services/agents/providers/GeminiAgentService.js';
import { DareAgentService } from '../../domains/cats/services/agents/providers/DareAgentService.js';
import { OpenCodeAgentService } from '../../domains/cats/services/agents/providers/OpenCodeAgentService.js';
import { AntigravityAgentService } from '../../domains/cats/services/agents/providers/antigravity/AntigravityAgentService.js';
import {
  writeClaudeMcpConfig,
  writeCodexMcpConfig,
  writeGeminiMcpConfig,
} from '../capabilities/mcp-config-adapters.js';
import {
  resolveJiuwenClawAppDir,
  resolveJiuwenClawExecutable,
  resolveJiuwenClawPythonBin,
} from '../../utils/jiuwenclaw-paths.js';

// ── Anthropic (Claude CLI) ──

export const anthropicPlugin: ClowderProviderPlugin = {
  name: 'anthropic',
  providers: ['anthropic'],
  createAgentService(ctx: AgentServiceFactoryContext): AgentService {
    return new ClaudeAgentService({ catId: ctx.catId });
  },
  accountSpecs: [{
    id: 'claude',
    displayName: 'Claude (OAuth)',
    client: 'anthropic',
    models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-opus-4-5-20251101', 'claude-sonnet-4-5-20250929'],
  }],
  binding: { builtinClient: 'anthropic', expectedProtocol: 'anthropic' },
  mcpConfigWriter: writeClaudeMcpConfig as unknown as McpConfigWriter,
};

// ── OpenAI (Codex CLI) ──

export const openaiPlugin: ClowderProviderPlugin = {
  name: 'openai',
  providers: ['openai'],
  createAgentService(ctx: AgentServiceFactoryContext): AgentService {
    return new CodexAgentService({ catId: ctx.catId });
  },
  accountSpecs: [{
    id: 'codex',
    displayName: 'Codex (OAuth)',
    client: 'openai',
    models: ['gpt-5.3-codex', 'gpt-5.4', 'gpt-5.3-codex-spark', 'codex'],
  }],
  binding: { builtinClient: 'openai', expectedProtocol: 'openai' },
  mcpConfigWriter: writeCodexMcpConfig as unknown as McpConfigWriter,
};

// ── Google

export const googlePlugin: ClowderProviderPlugin = {
  name: 'google',
  providers: ['google'],
  createAgentService(ctx: AgentServiceFactoryContext): AgentService {
    return new GeminiAgentService({ catId: ctx.catId });
  },
  accountSpecs: [{
    id: 'gemini',
    displayName: 'Gemini (OAuth)',
    client: 'google',
    models: ['gemini-3.1-pro-preview', 'gemini-2.5-pro'],
  }],
  binding: { builtinClient: 'google', expectedProtocol: 'google' },
  mcpConfigWriter: writeGeminiMcpConfig as unknown as McpConfigWriter,
  validateBinding(_provider, profile) {
    if (profile.kind !== 'builtin') {
      return 'client "google" only supports builtin Gemini auth';
    }
    return null;
  },
};

// ── Dare (Huawei MaaS CLI) ──

export const darePlugin: ClowderProviderPlugin = {
  name: 'dare',
  providers: ['dare'],
  createAgentService(ctx: AgentServiceFactoryContext): AgentService {
    return new DareAgentService({ catId: ctx.catId });
  },
  accountSpecs: [{
    id: 'dare',
    displayName: 'Dare (client-auth)',
    client: 'dare',
    models: ['z-ai/glm-5'],
  }],
  binding: { builtinClient: 'dare', expectedProtocol: 'openai' },
};

// ── OpenCode CLI ──

export const opencodePlugin: ClowderProviderPlugin = {
  name: 'opencode',
  providers: ['opencode'],
  createAgentService(ctx: AgentServiceFactoryContext): AgentService {
    return new OpenCodeAgentService({ catId: ctx.catId });
  },
  accountSpecs: [{
    id: 'opencode',
    displayName: 'OpenCode (client-auth)',
    client: 'opencode',
    models: ['anthropic/claude-opus-4-6', 'anthropic/claude-sonnet-4-5'],
  }],
  binding: { builtinClient: 'opencode', expectedProtocol: 'anthropic' },
};

// ── Antigravity (CDP bridge) ──

export const antigravityPlugin: ClowderProviderPlugin = {
  name: 'antigravity',
  providers: ['antigravity'],
  createAgentService(ctx: AgentServiceFactoryContext): AgentService {
    return new AntigravityAgentService({
      catId: ctx.catId,
      commandArgs: ctx.catConfig.commandArgs,
    });
  },
};

// ── RelayClaw (WebSocket relay) ──

export const relayclawPlugin: ClowderProviderPlugin = {
  name: 'relayclaw',
  providers: ['relayclaw'],
  async createAgentService(ctx: AgentServiceFactoryContext): Promise<AgentService> {
    const { RelayClawAgentService } = await import(
      '../../domains/cats/services/agents/providers/RelayClawAgentService.js'
    );
    const wsEnvKey = `CAT_${ctx.catId.toUpperCase()}_WS_URL`;
    const wsUrl = (ctx.env[wsEnvKey] ?? '').trim();
    const appDir = resolveJiuwenClawAppDir();
    const executablePath = resolveJiuwenClawExecutable();
    const pythonBin = resolveJiuwenClawPythonBin(undefined, appDir);
    return new RelayClawAgentService({
      catId: ctx.catId,
      config: {
        ...(wsUrl ? { url: wsUrl, autoStart: false } : { autoStart: true }),
        executablePath,
        appDir,
        pythonBin,
        homeDir: join(ctx.projectRoot, '.cat-cafe', 'relayclaw', ctx.catId),
        modelName: ctx.catConfig.defaultModel,
      },
    });
  },
  binding: { builtinClient: 'openai', expectedProtocol: null },
  validateBinding(_provider, profile) {
    if (profile.authType !== 'api_key') {
      return 'client "relayclaw" ("jiuwen") requires an API key provider profile';
    }
    if (profile.protocol && profile.protocol !== 'openai') {
      return 'client "relayclaw" ("jiuwen") currently only supports openai-compatible API key profiles';
    }
    return null;
  },
};

// ── ACP (stdio subprocess) ──

export const acpPlugin: ClowderProviderPlugin = {
  name: 'acp',
  providers: ['acp'],
  async createAgentService(ctx: AgentServiceFactoryContext): Promise<AgentService> {
    const { ACPAgentService } = await import(
      '../../domains/cats/services/agents/providers/ACPAgentService.js'
    );
    return new ACPAgentService({ catId: ctx.catId });
  },
  validateBinding(_provider, profile, _model, options) {
    if (options?.embeddedAcpRuntime) {
      if (profile.authType !== 'api_key' || profile.protocol !== 'openai') {
        return 'client "acp" built-in Agent Teams runtime requires an OpenAI-compatible API key provider profile';
      }
      if (profile.kind === 'builtin') {
        return 'client "acp" built-in Agent Teams runtime does not support builtin OAuth accounts';
      }
      return null;
    }
    if (profile.kind !== 'acp' || profile.authType !== 'none' || profile.protocol !== 'acp') {
      return 'client "acp" requires an ACP provider profile';
    }
    return null;
  },
};

// ── Collect all built-in plugins ──

export const BUILTIN_PLUGINS: readonly ClowderProviderPlugin[] = [
  anthropicPlugin,
  openaiPlugin,
  googlePlugin,
  darePlugin,
  opencodePlugin,
  antigravityPlugin,
  relayclawPlugin,
  acpPlugin,
];
