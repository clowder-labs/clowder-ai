import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { McpServerDescriptor } from '@cat-cafe/shared';
import { resolveCatCafeHostRoot } from '../../../../../utils/cat-cafe-root.js';
import type { AgentServiceOptions } from '../../types.js';

const CAT_CAFE_MCP_CALLBACK_ENV_KEYS = [
  'CAT_CAFE_API_URL',
  'CAT_CAFE_INVOCATION_ID',
  'CAT_CAFE_CALLBACK_TOKEN',
  'CAT_CAFE_USER_ID',
  'CAT_CAFE_CAT_ID',
  'CAT_CAFE_SIGNAL_USER',
] as const;

export interface RelayClawCatCafeMcpServer {
  command: string;
  args: string[];
  serverPath: string;
  repoRoot: string;
}

function collectCandidateRoots(workingDirectory?: string): string[] {
  const rawRoots = [
    workingDirectory,
    process.cwd(),
    resolveCatCafeHostRoot(workingDirectory ?? process.cwd()),
    resolveCatCafeHostRoot(process.cwd()),
  ].filter((value): value is string => Boolean(value));
  return [...new Set(rawRoots.map((value) => resolve(value)))];
}

function isCatCafeServer(name: string): boolean {
  return name === 'cat-cafe' || name.startsWith('cat-cafe-');
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function toStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result = Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) => (typeof item === 'string' ? [[key, item]] : [])),
  );
  return Object.keys(result).length > 0 ? result : undefined;
}

function readProjectMcpConfig(workingDirectory?: string): Record<string, unknown> | null {
  for (const repoRoot of collectCandidateRoots(workingDirectory)) {
    const filePath = join(repoRoot, '.mcp.json');
    if (!existsSync(filePath)) continue;
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

export function resolveCatCafeMcpServer(
  workingDirectory?: string,
): RelayClawCatCafeMcpServer | null {
  for (const repoRoot of collectCandidateRoots(workingDirectory)) {
    const distServerPath = resolve(repoRoot, 'packages/mcp-server/dist/index.js');
    if (existsSync(distServerPath)) {
      return {
        command: process.execPath,
        args: [distServerPath],
        serverPath: distServerPath,
        repoRoot,
      };
    }

    const sourceServerPath = resolve(repoRoot, 'packages/mcp-server/src/index.ts');
    if (existsSync(sourceServerPath)) {
      return {
        command: process.execPath,
        args: ['--import', 'tsx', sourceServerPath],
        serverPath: sourceServerPath,
        repoRoot,
      };
    }
  }

  return null;
}

export function buildCatCafeMcpEnv(callbackEnv?: Record<string, string>): Record<string, string> {
  const resolvedEnv = callbackEnv ?? {};
  return Object.fromEntries(
    CAT_CAFE_MCP_CALLBACK_ENV_KEYS.map((key) => [key, resolvedEnv[key]]).filter(([, value]) => Boolean(value)),
  ) as Record<string, string>;
}

function injectCatCafeCallbackEnv(
  descriptor: McpServerDescriptor,
  callbackEnv?: Record<string, string>,
): McpServerDescriptor {
  if (!isCatCafeServer(descriptor.name)) return descriptor;
  const injectedEnv = buildCatCafeMcpEnv(callbackEnv);
  if (Object.keys(injectedEnv).length === 0) return descriptor;
  return {
    ...descriptor,
    env: {
      ...(descriptor.env ?? {}),
      ...injectedEnv,
    },
  };
}

export function buildProjectMcpServerDescriptors(options?: AgentServiceOptions): McpServerDescriptor[] {
  const config = readProjectMcpConfig(options?.workingDirectory);
  const rawServers =
    config && config.mcpServers && typeof config.mcpServers === 'object' && !Array.isArray(config.mcpServers)
      ? (config.mcpServers as Record<string, unknown>)
      : {};

  return Object.entries(rawServers)
    .flatMap(([name, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
      const configEntry = value as Record<string, unknown>;
      const transport =
        configEntry.type === 'http' || configEntry.type === 'streamableHttp' ? 'streamableHttp' : 'stdio';
      const descriptor: McpServerDescriptor = {
        name,
        transport,
        command: typeof configEntry.command === 'string' ? configEntry.command : '',
        args: toStringArray(configEntry.args),
        ...(typeof configEntry.url === 'string' ? { url: configEntry.url } : {}),
        ...(toStringRecord(configEntry.headers) ? { headers: toStringRecord(configEntry.headers) } : {}),
        ...(toStringRecord(configEntry.env) ? { env: toStringRecord(configEntry.env) } : {}),
        ...(typeof configEntry.cwd === 'string' ? { workingDir: configEntry.cwd } : {}),
        enabled: configEntry.enabled !== false,
        source: isCatCafeServer(name) ? 'cat-cafe' : 'external',
      };
      return descriptor.enabled ? [injectCatCafeCallbackEnv(descriptor, options?.callbackEnv)] : [];
    })
    .filter((descriptor) => {
      if (descriptor.transport === 'streamableHttp') return Boolean(descriptor.url);
      return Boolean(descriptor.command);
    });
}

export function buildProjectMcpSessionServers(options?: AgentServiceOptions): Array<Record<string, unknown>> {
  return buildProjectMcpServerDescriptors(options).map((descriptor) => {
    if (descriptor.transport === 'streamableHttp') {
      return {
        id: descriptor.name,
        name: descriptor.name,
        transport: 'streamableHttp',
        type: 'http',
        url: descriptor.url,
        ...(descriptor.headers ? { headers: descriptor.headers } : {}),
      };
    }
    return {
      id: descriptor.name,
      name: descriptor.name,
      transport: 'stdio',
      command: descriptor.command,
      args: descriptor.args,
      ...(descriptor.workingDir ? { cwd: descriptor.workingDir } : {}),
      ...(descriptor.env ? { env: descriptor.env } : {}),
    };
  });
}

export function buildProjectAcpRelayServers(options?: AgentServiceOptions): Array<Record<string, unknown>> {
  return buildProjectMcpServerDescriptors(options)
    .filter((descriptor) => descriptor.transport !== 'streamableHttp')
    .map((descriptor) => ({
      id: descriptor.name,
      name: descriptor.name,
      transport: 'acp',
      acpId: descriptor.name,
    }));
}

export function buildProjectMcpRequestConfigByName(
  serverId: string,
  options?: AgentServiceOptions,
): Record<string, unknown> | undefined {
  const descriptor = buildProjectMcpServerDescriptors(options).find((item) => item.name === serverId);
  if (descriptor) {
    if (descriptor.transport === 'streamableHttp') return undefined;
    return {
      command: descriptor.command,
      args: descriptor.args,
      ...(descriptor.workingDir ? { cwd: descriptor.workingDir } : {}),
      ...(descriptor.env ? { env: descriptor.env } : {}),
    };
  }
  if (serverId === 'cat-cafe') {
    return buildCatCafeMcpRequestConfig(options);
  }
  return undefined;
}

export function buildCatCafeMcpRequestConfig(options?: AgentServiceOptions): Record<string, unknown> | undefined {
  const resolved = resolveCatCafeMcpServer(options?.workingDirectory);
  if (!resolved) return undefined;

  return {
    command: resolved.command,
    args: resolved.args,
    cwd: resolved.repoRoot,
    env: buildCatCafeMcpEnv(options?.callbackEnv),
  };
}
