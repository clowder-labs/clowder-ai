/**
 * DARE Agent Service
 *
 * Invokes the external DARE CLI in headless mode. The runtime can be either:
 * - a source checkout launched as `python -m client`
 * - a bundled standalone executable such as `vendor/dare.exe`
 */

import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { type CatId, createCatId } from '@cat-cafe/shared';
import { getCatModel } from '../../../../../config/cat-models.js';
import { getContextWindowFallback } from '../../../../../config/context-window-sizes.js';
import { resolveCatCafeHostRoot } from '../../../../../utils/cat-cafe-root.js';
import { formatCliExitError } from '../../../../../utils/cli-format.js';
import { isCliError, isCliTimeout, isLivenessWarning, spawnCli } from '../../../../../utils/cli-spawn.js';
import type { SpawnFn } from '../../../../../utils/cli-types.js';
import type { AgentMessage, AgentService, AgentServiceOptions, MessageMetadata } from '../../types.js';
import { transformDareEvent } from './dare-event-transform.js';

function resolveDefaultDareMcpServerPath(cwd = process.cwd()): string | undefined {
  // Prefer the compact MCP entry to reduce tool-schema token overhead.
  const roots = [
    resolve(cwd, '../mcp-server/dist'),
    resolve(cwd, 'packages/mcp-server/dist'),
    resolve(cwd, '../../packages/mcp-server/dist'),
  ];
  for (const root of roots) {
    const compact = join(root, 'dare.js');
    if (existsSync(compact)) return compact;
    const full = join(root, 'index.js');
    if (existsSync(full)) return full;
  }
  return undefined;
}

function preferCompactMcpEntry(mcpPath: string): string {
  if (!mcpPath.endsWith('index.js')) return mcpPath;
  const compactPath = join(dirname(mcpPath), 'dare.js');
  return existsSync(compactPath) ? compactPath : mcpPath;
}

interface DareAgentServiceOptions {
  catId?: CatId;
  adapter?: string;
  model?: string;
  endpoint?: string;
  apiKey?: string;
  /** Path to a DARE source checkout, or a bundled dare executable. */
  darePath?: string;
  /** Absolute path to the MCP server entry file for --mcp-path. */
  mcpServerPath?: string;
  spawnFn?: SpawnFn;
}

interface DareWorkspaceConfig {
  adapter?: string;
  model?: string;
}

type DareLaunchMode = 'module' | 'executable';

interface DareLaunchSpec {
  command: string;
  argsPrefix: string[];
  cwd?: string;
  runtimeMode: DareLaunchMode;
}

const DARE_API_KEY_ENV = 'DARE_API_KEY';
const DARE_ENDPOINT_ENV = 'DARE_ENDPOINT';

const ADAPTER_KEY_ENV: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  'huawei-modelarts': 'HUAWEI_MODELARTS_API_KEY',
};

const ADAPTER_ENDPOINT_ENV: Record<string, string> = {
  openai: 'OPENAI_BASE_URL',
  openrouter: 'OPENROUTER_BASE_URL',
  anthropic: 'ANTHROPIC_BASE_URL',
  'huawei-modelarts': 'HUAWEI_MODELARTS_BASE_URL',
};

function readWorkspaceDareConfig(workspace?: string): DareWorkspaceConfig | null {
  if (!workspace) return null;
  const configPath = join(workspace, '.dare', 'config.json');
  if (!existsSync(configPath)) return null;
  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as { llm?: { adapter?: unknown; model?: unknown } };
    const adapter = typeof parsed.llm?.adapter === 'string' ? parsed.llm.adapter.trim() : '';
    const model = typeof parsed.llm?.model === 'string' ? parsed.llm.model.trim() : '';
    if (!adapter && !model) return null;
    return {
      ...(adapter ? { adapter } : {}),
      ...(model ? { model } : {}),
    };
  } catch {
    return null;
  }
}

function formatWorkspaceModel(config: DareWorkspaceConfig | null): string | undefined {
  const adapter = config?.adapter?.trim();
  const model = config?.model?.trim();
  if (adapter && model) return `${adapter}/${model}`;
  if (model) return model;
  return undefined;
}

function resolveMetadataModel(catId: CatId, explicitModel?: string, workspaceConfig?: DareWorkspaceConfig | null): string {
  if (explicitModel) return explicitModel;
  const workspaceModel = formatWorkspaceModel(workspaceConfig ?? null);
  if (workspaceModel) return workspaceModel;
  try {
    return getCatModel(catId as string);
  } catch {
    return 'unknown';
  }
}

export function resolveVendorDarePath(): string {
  return join(resolveCatCafeHostRoot(process.cwd()), 'vendor', 'dare-cli');
}

export function resolveVendoredDareExecutable(): string {
  return join(resolveCatCafeHostRoot(process.cwd()), 'vendor', 'dare.exe');
}

function isExistingFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

export function resolveVenvPython(darePath: string): string {
  const candidates =
    process.platform === 'win32'
      ? [join(darePath, '.venv', 'Scripts', 'python.exe'), join(darePath, '.venv', 'bin', 'python')]
      : [join(darePath, '.venv', 'bin', 'python'), join(darePath, '.venv', 'Scripts', 'python.exe')];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return 'python';
}

function buildModuleLaunchSpec(darePath?: string): DareLaunchSpec {
  return {
    command: darePath ? resolveVenvPython(darePath) : 'python',
    argsPrefix: ['-m', 'client'],
    ...(darePath ? { cwd: darePath } : {}),
    runtimeMode: 'module',
  };
}

function resolveConfiguredDareLaunchSpec(darePath: string | undefined): DareLaunchSpec | null {
  if (!darePath) return null;
  if (existsSync(join(darePath, 'client', '__main__.py'))) {
    return buildModuleLaunchSpec(darePath);
  }
  if (isExistingFile(darePath)) {
    return {
      command: darePath,
      argsPrefix: [],
      cwd: dirname(darePath),
      runtimeMode: 'executable',
    };
  }
  return null;
}

function resolveDefaultDarePath(): string | undefined {
  const vendoredExecutable = resolveVendoredDareExecutable();
  if (isExistingFile(vendoredExecutable)) return vendoredExecutable;

  const vendorPath = resolveVendorDarePath();
  if (existsSync(join(vendorPath, 'client', '__main__.py'))) return vendorPath;

  const legacyPath = '/tmp/cat-cafe-reviews/Deterministic-Agent-Runtime-Engine';
  if (existsSync(join(legacyPath, 'client', '__main__.py'))) return legacyPath;

  return undefined;
}

function formatInvalidDarePath(darePath: string): string {
  return `DARE_PATH invalid: ${darePath} (missing client/__main__.py and not an executable file)`;
}

export class DareAgentService implements AgentService {
  readonly catId: CatId;
  private readonly adapter: string | undefined;
  private readonly model: string | undefined;
  private readonly endpoint: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly darePath: string | undefined;
  private readonly mcpServerPath: string | undefined;
  private readonly spawnFn: SpawnFn | undefined;

  constructor(options?: DareAgentServiceOptions) {
    this.catId = options?.catId ?? createCatId('dare');
    this.adapter = options?.adapter?.trim() || process.env.DARE_ADAPTER?.trim() || undefined;
    this.model = options?.model?.trim() || (process.env.CAT_CAFE_DARE_MODEL_OVERRIDE?.trim() || undefined);
    this.endpoint = options?.endpoint ?? process.env[DARE_ENDPOINT_ENV];
    this.apiKey = options?.apiKey ?? process.env[DARE_API_KEY_ENV];
    this.darePath = options?.darePath ?? process.env.DARE_PATH ?? resolveDefaultDarePath();

    const configuredMcp = options?.mcpServerPath ?? process.env.CAT_CAFE_MCP_SERVER_PATH;
    if (configuredMcp && configuredMcp.trim().length > 0) {
      const resolved = isAbsolute(configuredMcp) ? configuredMcp : resolve(process.cwd(), configuredMcp);
      this.mcpServerPath = preferCompactMcpEntry(resolved);
    } else {
      this.mcpServerPath = resolveDefaultDareMcpServerPath();
    }
    this.spawnFn = options?.spawnFn;
  }

  async *invoke(prompt: string, options?: AgentServiceOptions): AsyncIterable<AgentMessage> {
    const workspaceConfig = readWorkspaceDareConfig(options?.workingDirectory);
    const effectiveModel = options?.callbackEnv?.CAT_CAFE_DARE_MODEL_OVERRIDE?.trim() || this.model || undefined;

    let cliModel = effectiveModel;
    if (!cliModel) {
      try {
        cliModel = getCatModel(this.catId as string);
      } catch {
        // Let DARE fall back to its own config if no explicit model is available.
      }
    }

    const metadataModel = resolveMetadataModel(this.catId, cliModel, workspaceConfig);
    const configuredLaunchSpec = resolveConfiguredDareLaunchSpec(this.darePath);

    if (!this.darePath && !this.spawnFn) {
      const metadata: MessageMetadata = { provider: 'dare', model: metadataModel };
      yield {
        type: 'error',
        catId: this.catId,
        error: 'DARE CLI path is not configured: set DARE_PATH or install vendor/dare.exe / vendor/dare-cli via the installer.',
        metadata,
        timestamp: Date.now(),
      };
      yield { type: 'done', catId: this.catId, metadata, timestamp: Date.now() };
      return;
    }

    if (this.darePath && !this.spawnFn && configuredLaunchSpec === null) {
      const metadata: MessageMetadata = { provider: 'dare', model: metadataModel };
      yield {
        type: 'error',
        catId: this.catId,
        error: formatInvalidDarePath(this.darePath),
        metadata,
        timestamp: Date.now(),
      };
      yield { type: 'done', catId: this.catId, metadata, timestamp: Date.now() };
      return;
    }

    const launchSpec = configuredLaunchSpec ?? buildModuleLaunchSpec(this.darePath);
    const endpoint = this.resolveEndpoint(options?.callbackEnv);
    const args = this.buildArgs(prompt, {
      argsPrefix: launchSpec.argsPrefix,
      workspace: options?.workingDirectory,
      sessionId: options?.sessionId,
      endpoint,
      model: cliModel,
      cliConfigArgs: options?.cliConfigArgs,
      systemPrompt: options?.systemPrompt,
      mcpServerPath: options?.callbackEnv ? this.mcpServerPath : undefined,
    });
    const childEnv = this.buildEnv(options?.callbackEnv, cliModel);
    const metadata: MessageMetadata = { provider: 'dare', model: metadataModel };
    let sessionInitEmitted = false;

    try {
      const cliOpts = {
        command: launchSpec.command,
        args,
        ...(launchSpec.cwd ? { cwd: launchSpec.cwd } : {}),
        env: childEnv,
        ...(options?.signal ? { signal: options.signal } : {}),
        ...(options?.invocationId ? { invocationId: options.invocationId } : {}),
        ...(options?.cliSessionId ? { cliSessionId: options.cliSessionId } : {}),
        ...(options?.livenessProbe ? { livenessProbe: options.livenessProbe } : {}),
      };
      const events = options?.spawnCliOverride
        ? options.spawnCliOverride(cliOpts)
        : spawnCli(cliOpts, this.spawnFn ? { spawnFn: this.spawnFn } : undefined);

      for await (const event of events) {
        if (isCliTimeout(event)) {
          yield {
            type: 'system_info' as const,
            catId: this.catId,
            content: JSON.stringify({
              type: 'timeout_diagnostics',
              silenceDurationMs: event.silenceDurationMs,
              processAlive: event.processAlive,
              lastEventType: event.lastEventType,
              firstEventAt: event.firstEventAt,
              lastEventAt: event.lastEventAt,
              cliSessionId: event.cliSessionId,
              invocationId: event.invocationId,
              rawArchivePath: event.rawArchivePath,
            }),
            timestamp: Date.now(),
          };
          yield {
            type: 'error',
            catId: this.catId,
            error: `DARE CLI 响应超时 (${Math.round(event.timeoutMs / 1000)}s)`,
            metadata,
            timestamp: Date.now(),
          };
          continue;
        }

        if (isLivenessWarning(event)) {
          yield {
            type: 'system_info' as const,
            catId: this.catId,
            content: JSON.stringify({ type: 'liveness_warning', ...event }),
            timestamp: Date.now(),
          };
          continue;
        }

        if (isCliError(event)) {
          yield {
            type: 'error',
            catId: this.catId,
            error: formatCliExitError('DARE CLI', event),
            metadata,
            timestamp: Date.now(),
          };
          continue;
        }

        const result = transformDareEvent(event, this.catId);
        if (result !== null) {
          if (result.type === 'session_init') {
            if (sessionInitEmitted) continue;
            sessionInitEmitted = true;
            if (result.sessionId) metadata.sessionId = result.sessionId;
          }
          yield { ...result, metadata };
        }
      }

      yield { type: 'done', catId: this.catId, metadata, timestamp: Date.now() };
    } catch (err) {
      yield {
        type: 'error',
        catId: this.catId,
        error: err instanceof Error ? err.message : String(err),
        metadata,
        timestamp: Date.now(),
      };
      yield { type: 'done', catId: this.catId, metadata, timestamp: Date.now() };
    }
  }

  private buildArgs(
    prompt: string,
    opts?: {
      argsPrefix?: readonly string[];
      workspace?: string;
      sessionId?: string;
      endpoint?: string;
      model?: string;
      cliConfigArgs?: readonly string[];
      systemPrompt?: string;
      mcpServerPath?: string;
    },
  ): string[] {
    const args = [...(opts?.argsPrefix ?? ['-m', 'client'])];
    if (this.adapter) {
      args.push('--adapter', this.adapter);
    }
    if (opts?.model) {
      args.push('--model', opts.model);
    }
    if (opts?.endpoint) {
      args.push('--endpoint', opts.endpoint);
    }
    if (opts?.workspace) {
      args.push('--workspace', opts.workspace);
    }
    if (opts?.systemPrompt) {
      args.push('--system-prompt-mode', 'append');
      args.push('--system-prompt-text', opts.systemPrompt);
    }
    if (opts?.mcpServerPath) {
      args.push('--mcp-path', opts.mcpServerPath);
    }

    args.push('run');
    if (opts?.sessionId) {
      args.push('--session-id', opts.sessionId);
    }

    for (const arg of opts?.cliConfigArgs ?? []) {
      const parts = arg.trim().split(/\s+/);
      args.push(...parts);
    }

    args.push('--task', prompt, '--full-auto', '--headless');
    return args;
  }

  private buildEnv(callbackEnv?: Record<string, string>, model?: string): Record<string, string | null> {
    const env: Record<string, string | null> = { ...callbackEnv };
    const apiKeyEnvName = this.adapter ? ADAPTER_KEY_ENV[this.adapter] : undefined;
    const apiKey =
      callbackEnv?.[DARE_API_KEY_ENV] ??
      (apiKeyEnvName ? callbackEnv?.[apiKeyEnvName] : undefined) ??
      this.apiKey ??
      (apiKeyEnvName ? process.env[apiKeyEnvName] : undefined);

    if (apiKey && apiKeyEnvName) {
      env[apiKeyEnvName] = apiKey;
    }

    env[DARE_API_KEY_ENV] = null;
    env[DARE_ENDPOINT_ENV] = null;

    const projectRoot = resolveCatCafeHostRoot(process.cwd());
    const catCafeSkillsDir = join(projectRoot, 'cat-cafe-skills');
    if (existsSync(catCafeSkillsDir)) {
      env.DARE_SKILL_PATHS = JSON.stringify([catCafeSkillsDir]);
    }

    if (model) {
      const ctxWindow = getContextWindowFallback(model);
      if (ctxWindow) {
        const inputBudget = Math.floor(ctxWindow * 0.85);
        env.DARE_CONTEXT_WINDOW_TOKENS = String(inputBudget);
      }
    }

    return env;
  }

  private getAdapterEndpointEnvName(): string | undefined {
    return this.adapter ? ADAPTER_ENDPOINT_ENV[this.adapter] : undefined;
  }

  private resolveEndpoint(callbackEnv?: Record<string, string>): string | undefined {
    const adapterEndpointEnv = this.getAdapterEndpointEnvName();
    return (
      callbackEnv?.[DARE_ENDPOINT_ENV] ??
      (adapterEndpointEnv ? callbackEnv?.[adapterEndpointEnv] : undefined) ??
      this.endpoint ??
      (adapterEndpointEnv ? process.env[adapterEndpointEnv] : undefined)
    );
  }
}
