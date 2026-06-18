/**
 * F241 Phase A: host-owned CLI JSONL AgentService.
 *
 * This is a constrained smoke transport for already-installed external agent
 * runtimes. Prompt text is delivered through stdin, not argv.
 */

import { type CatId, createCatId } from '@cat-cafe/shared';
import { formatCliExitError } from '../../../../../../utils/cli-format.js';
import { formatCliNotFoundError, resolveCliCommand } from '../../../../../../utils/cli-resolve.js';
import { isCliError, isCliTimeout, isLivenessWarning, spawnCli } from '../../../../../../utils/cli-spawn.js';
import type { SpawnFn } from '../../../../../../utils/cli-types.js';
import { CliRawArchive } from '../../../session/CliRawArchive.js';
import type { AgentMessage, AgentService, AgentServiceOptions, MessageMetadata } from '../../../types.js';
import { sanitizeRawEvent, type RawArchiveSink } from '../codex-audit-hooks.js';
import { transformCliJsonlEvent } from './cli-jsonl-event-transform.js';

export type CliJsonlSessionPolicy = 'resume' | 'stateless';

export interface CliJsonlAgentServiceOptions {
  catId: CatId | string;
  providerName: string;
  modelName: string;
  command: string;
  startupArgs?: readonly string[];
  resumeArgs?: readonly string[];
  sessionPolicy?: CliJsonlSessionPolicy;
  timeoutMs?: number;
  spawnFn?: SpawnFn;
  rawArchive?: RawArchiveSink;
}

const DEFAULT_RESUME_ARGS = ['resume', '{sessionId}', '--json'] as const;

function withMetadata(msg: AgentMessage, metadata: MessageMetadata): AgentMessage {
  if (!msg.metadata) return { ...msg, metadata };
  return {
    ...msg,
    metadata: {
      ...msg.metadata,
      provider: metadata.provider,
      model: metadata.model,
      ...(metadata.sessionId ? { sessionId: metadata.sessionId } : {}),
      ...(msg.metadata.usage ? { usage: msg.metadata.usage } : {}),
    },
  };
}

function buildPrompt(prompt: string, options?: AgentServiceOptions): string {
  if (!options?.systemPrompt) return prompt;
  return `${options.systemPrompt}\n\n${prompt}`;
}

function buildResumeArgs(template: readonly string[], sessionId: string): string[] {
  return template.map((arg) => arg.replaceAll('{sessionId}', sessionId));
}

function containsLineBreak(prompt: string): boolean {
  return /[\r\n]/.test(prompt);
}

export class CliJsonlAgentService implements AgentService {
  readonly catId: CatId;
  private readonly providerName: string;
  private readonly modelName: string;
  private readonly command: string;
  private readonly startupArgs: readonly string[];
  private readonly resumeArgs: readonly string[];
  private readonly sessionPolicy: CliJsonlSessionPolicy;
  private readonly timeoutMs: number | undefined;
  private readonly spawnFn: SpawnFn | undefined;
  private readonly rawArchive: RawArchiveSink;

  constructor(options: CliJsonlAgentServiceOptions) {
    this.catId = createCatId(options.catId as string);
    this.providerName = options.providerName;
    this.modelName = options.modelName;
    this.command = options.command;
    this.startupArgs = options.startupArgs ?? [];
    this.resumeArgs = options.resumeArgs ?? DEFAULT_RESUME_ARGS;
    this.sessionPolicy = options.sessionPolicy ?? 'resume';
    this.timeoutMs = options.timeoutMs;
    this.spawnFn = options.spawnFn;
    this.rawArchive = options.rawArchive ?? new CliRawArchive();
  }

  async *invoke(prompt: string, options?: AgentServiceOptions): AsyncIterable<AgentMessage> {
    const metadata: MessageMetadata = { provider: this.providerName, model: this.modelName };
    const command = options?.spawnCliOverride ? this.command : resolveCliCommand(this.command);
    if (!command) {
      yield {
        type: 'error',
        catId: this.catId,
        error: formatCliNotFoundError(this.command),
        metadata,
        timestamp: Date.now(),
      };
      yield { type: 'done', catId: this.catId, metadata, timestamp: Date.now() };
      return;
    }

    const env: Record<string, string | null> = { ...(options?.callbackEnv ?? {}) };
    if (options?.accountEnv) {
      for (const [key, value] of Object.entries(options.accountEnv)) env[key] = value;
    }

    const promptInput = buildPrompt(prompt, options);
    const requestedSessionId = typeof options?.sessionId === 'string' ? options.sessionId.trim() : '';
    const resumeRequested = requestedSessionId.length > 0;
    const resumeBlockedByPromptShape =
      this.sessionPolicy === 'resume' && resumeRequested && containsLineBreak(promptInput);
    const resumeEnabled = this.sessionPolicy === 'resume' && resumeRequested && !resumeBlockedByPromptShape;
    const sessionContinuityDegraded =
      resumeRequested && (this.sessionPolicy === 'stateless' || resumeBlockedByPromptShape);
    if (sessionContinuityDegraded) {
      yield {
        type: 'system_info',
        catId: this.catId,
        content: JSON.stringify({
          type: 'session_continuity_degraded',
          reason: resumeBlockedByPromptShape ? 'cli_jsonl_resume_requires_single_line_prompt' : 'cli_jsonl_stateless',
          requestedSessionId,
        }),
        metadata,
        timestamp: Date.now(),
      };
    }

    const invocationId = options?.invocationId ?? options?.auditContext?.invocationId;
    const cliOpts = {
      command,
      args: resumeEnabled ? buildResumeArgs(this.resumeArgs, requestedSessionId) : this.startupArgs,
      stdinInput: promptInput,
      ...(options?.workingDirectory ? { cwd: options.workingDirectory } : {}),
      ...(Object.keys(env).length > 0 ? { env } : {}),
      ...(this.timeoutMs !== undefined ? { timeoutMs: this.timeoutMs } : {}),
      ...(options?.signal ? { signal: options.signal } : {}),
      ...(invocationId ? { invocationId } : {}),
      ...(options?.cliSessionId ? { cliSessionId: options.cliSessionId } : {}),
      ...(options?.livenessProbe ? { livenessProbe: options.livenessProbe } : {}),
      ...(options?.parentSpan ? { parentSpan: options.parentSpan } : {}),
      ...(invocationId && this.rawArchive.getPath ? { rawArchivePath: this.rawArchive.getPath(invocationId) } : {}),
    };
    const events = options?.spawnCliOverride
      ? options.spawnCliOverride(cliOpts)
      : spawnCli(cliOpts, this.spawnFn ? { spawnFn: this.spawnFn } : undefined);

    let semanticEventSeen = false;
    let textSeen = false;
    let errorSeen = false;

    try {
      for await (const event of events) {
        if (invocationId) {
          this.rawArchive.append(invocationId, sanitizeRawEvent(event)).catch(() => {
            // Raw archive is diagnostic-only; invocation output must not fail on archive I/O.
          });
        }

        if (isCliTimeout(event)) {
          errorSeen = true;
          yield {
            type: 'system_info',
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
            metadata,
            timestamp: Date.now(),
          };
          yield {
            type: 'error',
            catId: this.catId,
            error: `${this.providerName} CLI 响应超时 (${Math.round(event.timeoutMs / 1000)}s)`,
            metadata: event.cliDiagnostics ? { ...metadata, cliDiagnostics: event.cliDiagnostics } : metadata,
            timestamp: Date.now(),
          };
          continue;
        }

        if (isLivenessWarning(event)) {
          yield {
            type: 'system_info',
            catId: this.catId,
            content: JSON.stringify({ type: 'liveness_warning', ...event }),
            metadata,
            timestamp: Date.now(),
          };
          continue;
        }

        if (isCliError(event)) {
          errorSeen = true;
          yield {
            type: 'error',
            catId: this.catId,
            error: formatCliExitError(`${this.providerName} CLI`, event),
            metadata: event.cliDiagnostics ? { ...metadata, cliDiagnostics: event.cliDiagnostics } : metadata,
            timestamp: Date.now(),
          };
          continue;
        }

        const messages = transformCliJsonlEvent(event, this.catId, {
          emitSessionInit: this.sessionPolicy === 'resume' && !sessionContinuityDegraded,
          ephemeralSession: false,
        });
        if (messages.length === 0) continue;
        semanticEventSeen = true;
        for (const msg of messages) {
          if (msg.type === 'session_init' && msg.sessionId) metadata.sessionId = msg.sessionId;
          if (msg.type === 'text') textSeen = true;
          if (msg.type === 'error') errorSeen = true;
          yield withMetadata(msg, metadata);
        }
      }

      if (!semanticEventSeen && !errorSeen) {
        yield {
          type: 'error',
          catId: this.catId,
          error: `${this.providerName} CLI exited without a JSONL turn_result event`,
          metadata,
          timestamp: Date.now(),
        };
        errorSeen = true;
      } else if (semanticEventSeen && !textSeen && !errorSeen) {
        yield {
          type: 'error',
          catId: this.catId,
          error: `${this.providerName} CLI completed without text output`,
          metadata,
          timestamp: Date.now(),
        };
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
}
