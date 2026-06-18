/**
 * F241 Phase A: CLI JSONL as a host-owned provider transport.
 *
 * Intended first smoke path for clowder-code while ACP/A2A support lands in the
 * external runtime. The host owns process spawn, cwd, env injection, timeout,
 * and JSONL-to-AgentMessage mapping.
 */

import type { FastifyBaseLogger } from 'fastify';
import type { ProviderTransportFactory } from '../transport/ProviderTransportRegistry.js';
import { CliJsonlAgentService } from './CliJsonlAgentService.js';

export interface CliJsonlProviderTransportFactoryDeps {
  log: Pick<FastifyBaseLogger, 'warn'>;
}

interface ParsedCliJsonlTransportConfig {
  command: string;
  startupArgs: string[];
  outputProfile: 'clowder-code-turn-result-v1';
  timeoutMs?: number;
}

function parseCliJsonlTransportConfig(value: unknown): ParsedCliJsonlTransportConfig | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (raw.transport !== 'cli-jsonl') return null;
  if (typeof raw.command !== 'string' || raw.command.trim().length === 0) return null;
  const startupArgs =
    raw.startupArgs === undefined
      ? ['--json', '--non-interactive']
      : Array.isArray(raw.startupArgs) && raw.startupArgs.every((arg) => typeof arg === 'string')
        ? raw.startupArgs
        : null;
  if (!startupArgs) return null;
  const outputProfile = raw.outputProfile ?? 'clowder-code-turn-result-v1';
  if (outputProfile !== 'clowder-code-turn-result-v1') return null;
  if (raw.timeoutMs !== undefined && (typeof raw.timeoutMs !== 'number' || !Number.isInteger(raw.timeoutMs))) {
    return null;
  }
  return {
    command: raw.command.trim(),
    startupArgs,
    outputProfile,
    ...(typeof raw.timeoutMs === 'number' ? { timeoutMs: raw.timeoutMs } : {}),
  };
}

export function createCliJsonlProviderTransportFactory(
  deps: CliJsonlProviderTransportFactoryDeps,
): ProviderTransportFactory {
  return {
    id: 'cli-jsonl',
    async create(input) {
      if (typeof input.providerTransport !== 'object' || input.providerTransport === null) {
        return { handled: false };
      }
      const raw = input.providerTransport as { transport?: unknown };
      if (raw.transport !== 'cli-jsonl') return { handled: false };

      const parsed = parseCliJsonlTransportConfig(input.providerTransport);
      if (!parsed) {
        deps.log.warn(
          { profileId: input.profileId },
          'Invalid cli-jsonl provider transport declaration; profile will not be routable',
        );
        return { handled: true, service: null };
      }

      return {
        handled: true,
        service: new CliJsonlAgentService({
          catId: input.config.id,
          providerName: input.profileId,
          modelName: input.config.defaultModel || parsed.outputProfile,
          command: parsed.command,
          startupArgs: parsed.startupArgs,
          timeoutMs: parsed.timeoutMs,
        }),
      };
    },
  };
}
