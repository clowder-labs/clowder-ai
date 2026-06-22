/**
 * F241 Phase A: CLI JSONL as a host-owned provider transport.
 *
 * Intended first smoke path for clowder-code while ACP/A2A support lands in the
 * external runtime. The host owns process spawn, cwd, env injection, timeout,
 * and JSONL-to-AgentMessage mapping.
 */

import type { FastifyBaseLogger } from 'fastify';
import type { ProviderTransportFactory } from '../transport/ProviderTransportRegistry.js';
import { CliJsonlAgentService, type CliJsonlSessionPolicy } from './CliJsonlAgentService.js';

export interface CliJsonlProviderTransportFactoryDeps {
  log: Pick<FastifyBaseLogger, 'warn'>;
}

interface ParsedCliJsonlTransportConfig {
  command: string;
  startupArgs: string[];
  resumeArgs: string[];
  sessionPolicy: CliJsonlSessionPolicy;
  outputProfile: 'clowder-code-turn-result-v1';
  timeoutMs?: number;
}

const DEFAULT_STARTUP_ARGS = ['--json', '--non-interactive'];
const DEFAULT_RESUME_ARGS = ['resume', '{sessionId}', '--json'];
const OUTPUT_PROFILE = 'clowder-code-turn-result-v1';

function parseStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((arg) => typeof arg === 'string') ? value : null;
}

function parseTimeoutMs(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null;
  return value;
}

function parseSessionPolicy(value: unknown): CliJsonlSessionPolicy | null {
  const sessionPolicy = value ?? 'resume';
  return sessionPolicy === 'resume' || sessionPolicy === 'stateless' ? sessionPolicy : null;
}

function parseResumeArgs(value: unknown, sessionPolicy: CliJsonlSessionPolicy): string[] | null {
  const resumeArgs = value === undefined ? DEFAULT_RESUME_ARGS : parseStringArray(value);
  if (!resumeArgs) return null;
  if (sessionPolicy === 'resume' && !resumeArgs.some((arg) => arg.includes('{sessionId}'))) return null;
  return resumeArgs;
}

function parseOutputProfile(value: unknown): typeof OUTPUT_PROFILE | null {
  const outputProfile = value ?? OUTPUT_PROFILE;
  return outputProfile === OUTPUT_PROFILE ? outputProfile : null;
}

function parseCliJsonlTransportConfig(value: unknown): ParsedCliJsonlTransportConfig | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (raw.transport !== 'cli-jsonl') return null;
  if (typeof raw.command !== 'string' || raw.command.trim().length === 0) return null;
  const startupArgs = raw.startupArgs === undefined ? DEFAULT_STARTUP_ARGS : parseStringArray(raw.startupArgs);
  if (!startupArgs) return null;
  const sessionPolicy = parseSessionPolicy(raw.sessionPolicy);
  if (!sessionPolicy) return null;
  const resumeArgs = parseResumeArgs(raw.resumeArgs, sessionPolicy);
  if (!resumeArgs) return null;
  const outputProfile = parseOutputProfile(raw.outputProfile);
  if (!outputProfile) return null;
  const timeoutMs = parseTimeoutMs(raw.timeoutMs);
  if (timeoutMs === null) return null;
  return {
    command: raw.command.trim(),
    startupArgs,
    resumeArgs,
    sessionPolicy,
    outputProfile,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
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
          resumeArgs: parsed.resumeArgs,
          sessionPolicy: parsed.sessionPolicy,
          timeoutMs: parsed.timeoutMs,
        }),
      };
    },
  };
}
