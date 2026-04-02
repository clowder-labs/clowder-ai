/**
 * RelayClaw Agent Service
 *
 * Thin orchestration layer:
 * - optional sidecar bootstrap
 * - persistent WS connection
 * - request/response streaming
 */

import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { CatId, RelayClawAgentConfig } from '@cat-cafe/shared';
import { createCatId } from '@cat-cafe/shared';
import { createModuleLogger } from '../../../../../infrastructure/logger.js';
import {
  buildLatencyCheckpoint,
  latencyDelta,
  type AgentMessage,
  type AgentService,
  type AgentServiceOptions,
} from '../../types.js';
import { appendLocalImagePathHints } from './image-cli-bridge.js';
import { extractImagePaths } from './image-paths.js';
import { FrameQueue, RelayClawConnectionManager, type RelayClawConnectionFactory } from './relayclaw-connection.js';
import { buildCatCafeMcpRequestConfig } from './relayclaw-catcafe-mcp.js';
import {
  DefaultRelayClawSidecarController,
  isSidecarReady,
  type RelayClawSidecarController,
  type RelayClawSidecarControllerDeps,
} from './relayclaw-sidecar.js';
import { transformRelayClawChunk } from './relayclaw-event-transform.js';

const DEFAULT_RELAYCLAW_TIMEOUT_MS = 30 * 60 * 1000;
const log = createModuleLogger('relayclaw-agent');

export interface RelayClawAgentServiceOptions {
  catId?: CatId;
  config: RelayClawAgentConfig;
}

export interface RelayClawAgentServiceDeps {
  createConnection?: RelayClawConnectionFactory;
  createSidecarController?: (
    catId: CatId,
    config: RelayClawAgentConfig,
  ) => RelayClawSidecarController;
  sidecarDeps?: RelayClawSidecarControllerDeps;
}

function agentMsg(type: AgentMessage['type'], catId: CatId, content?: string): AgentMessage {
  return { type, catId, content, timestamp: Date.now() };
}

function resolveRelayClawSessionId(channelId: string, options?: AgentServiceOptions): string {
  const requestedSessionId = options?.sessionId?.trim() || options?.cliSessionId?.trim();
  if (requestedSessionId) return requestedSessionId;
  return `${channelId}_${Date.now().toString(16)}_${randomUUID().slice(0, 12)}`;
}

function buildRelayClawFilesPayload(
  contentBlocks: AgentServiceOptions['contentBlocks'],
  uploadDir?: string,
): Record<string, unknown> | undefined {
  const imagePaths = extractImagePaths(contentBlocks, uploadDir);
  if (imagePaths.length === 0) return undefined;
  return {
    uploaded: imagePaths.map((path, index) => ({
      type: 'image',
      name: basename(path) || `image-${index + 1}`,
      path,
    })),
  };
}

export class RelayClawAgentService implements AgentService {
  private readonly catId: CatId;
  private readonly config: RelayClawAgentConfig;
  private readonly requestQueues = new Map<string, FrameQueue>();
  private readonly connection;
  private readonly sidecar: RelayClawSidecarController;
  private resolvedUrl: string | null = null;

  constructor(options: RelayClawAgentServiceOptions, deps?: RelayClawAgentServiceDeps) {
    this.catId = options.catId ?? createCatId('relayclaw-agent');
    this.config = options.config;
    this.connection =
      deps?.createConnection?.(this.requestQueues) ?? new RelayClawConnectionManager({ requestQueues: this.requestQueues });
    this.sidecar =
      deps?.createSidecarController?.(this.catId, this.config) ??
      new DefaultRelayClawSidecarController(this.catId, this.config, deps?.sidecarDeps);
  }

  async *invoke(prompt: string, options?: AgentServiceOptions): AsyncIterable<AgentMessage> {
    const signal = buildSignal(this.config.timeoutMs ?? DEFAULT_RELAYCLAW_TIMEOUT_MS, options?.signal);
    const channelId = this.config.channelId ?? 'catcafe';
    const sessionId = resolveRelayClawSessionId(channelId, options);
    yield { type: 'session_init', catId: this.catId, sessionId, timestamp: Date.now() };

    try {
      await this.ensureConnected(signal, options);
    } catch (err) {
      yield {
        type: 'error',
        catId: this.catId,
        error: `jiuwen connection failed: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: Date.now(),
      };
      return;
    }

    const requestId = randomUUID();
    const queue = new FrameQueue();
    this.requestQueues.set(requestId, queue);
    const onAbort = () => queue.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    let agentForwardedAt: number | undefined;

    try {
      agentForwardedAt = Date.now();
      log.info(
        {
          ...buildLatencyCheckpoint('agent_forwarded', agentForwardedAt, options?.latencyTrace),
          invocationId: options?.invocationId,
          parentInvocationId: options?.parentInvocationId,
          threadId: options?.auditContext?.threadId,
          userId: options?.auditContext?.userId,
          catId: this.catId,
          channelId,
          sessionId,
          reqMethod: 'chat.send',
        },
        'RelayClaw latency checkpoint',
      );
      this.connection.send(buildRequest(requestId, channelId, sessionId, prompt, options));
      yield* this.consumeFrames(queue, signal, options, {
        agentForwardedAt,
        channelId,
        sessionId,
      });
    } catch (err) {
      if (options?.signal?.aborted) {
        yield agentMsg('done', this.catId);
      } else {
        const failedAt = Date.now();
        log.info(
          {
            ...buildLatencyCheckpoint('agent_reply_completed', failedAt, options?.latencyTrace),
            invocationId: options?.invocationId,
            parentInvocationId: options?.parentInvocationId,
            threadId: options?.auditContext?.threadId,
            userId: options?.auditContext?.userId,
            catId: this.catId,
            channelId,
            sessionId,
            agentForwardedAt,
            forwardedToCompletedMs: latencyDelta(agentForwardedAt, failedAt),
            outcome: 'error',
            error: err instanceof Error ? err.message : String(err),
          },
          'RelayClaw latency checkpoint',
        );
        yield {
          type: 'error',
          catId: this.catId,
          error: `jiuwen error: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        };
      }
    } finally {
      signal.removeEventListener('abort', onAbort);
      this.requestQueues.delete(requestId);
    }
  }

  private async ensureConnected(signal?: AbortSignal, options?: AgentServiceOptions): Promise<void> {
    if (this.config.autoStart) {
      this.resolvedUrl = await this.sidecar.ensureStarted(options, signal);
    }
    const url = this.resolvedUrl ?? this.config.url;
    if (!url) throw new Error('jiuwen WebSocket URL is not configured');
    await this.connection.ensureConnected(url, signal);
  }

  private async *consumeFrames(
    queue: FrameQueue,
    signal: AbortSignal,
    options?: AgentServiceOptions,
    trace?: {
      agentForwardedAt?: number;
      channelId: string;
      sessionId: string;
    },
  ): AsyncIterable<AgentMessage> {
    let sawError = false;
    let streamedText = '';
    let firstReplyAt: number | undefined;

    const logFirstReply = (responseType: string, via?: string): void => {
      if (firstReplyAt !== undefined) return;
      firstReplyAt = Date.now();
      log.info(
        {
          ...buildLatencyCheckpoint('agent_first_reply', firstReplyAt, options?.latencyTrace),
          invocationId: options?.invocationId,
          parentInvocationId: options?.parentInvocationId,
          threadId: options?.auditContext?.threadId,
          userId: options?.auditContext?.userId,
          catId: this.catId,
          channelId: trace?.channelId,
          sessionId: trace?.sessionId,
          agentForwardedAt: trace?.agentForwardedAt,
          forwardedToFirstReplyMs: latencyDelta(trace?.agentForwardedAt, firstReplyAt),
          responseType,
          ...(via ? { via } : {}),
        },
        'RelayClaw latency checkpoint',
      );
    };

    while (!signal.aborted) {
      const frame = await queue.take();
      if (frame === null) break;

      const payload = frame.payload;
      const message = transformRelayClawChunk(frame, this.catId);
      if (message) {
        if (message.type !== 'session_init' && message.type !== 'done') {
          logFirstReply(message.type);
        }
        yield message;
        if (message.type === 'text' && message.content) streamedText += message.content;
        if (message.type === 'error') {
          sawError = true;
          break;
        }
      } else if (payload?.event_type === 'chat.final') {
        const finalText = normalizeRelayClawFinalContent(payload.content);
        const deltaToEmit = computeFinalTextDelta(streamedText, finalText);
        if (deltaToEmit) {
          logFirstReply('text', 'chat.final');
          streamedText += deltaToEmit;
          yield agentMsg('text', this.catId, deltaToEmit);
        }
      }

      if (frame.is_complete === true || payload?.is_complete === true) break;
    }

    if (!sawError && signal.aborted && !options?.signal?.aborted) {
      sawError = true;
      yield {
        type: 'error',
        catId: this.catId,
        error: 'jiuwen request timed out before completion',
        timestamp: Date.now(),
      };
    }

    const agentCompletedAt = Date.now();
    log.info(
      {
        ...buildLatencyCheckpoint('agent_reply_completed', agentCompletedAt, options?.latencyTrace),
        invocationId: options?.invocationId,
        parentInvocationId: options?.parentInvocationId,
        threadId: options?.auditContext?.threadId,
        userId: options?.auditContext?.userId,
        catId: this.catId,
        channelId: trace?.channelId,
        sessionId: trace?.sessionId,
        agentForwardedAt: trace?.agentForwardedAt,
        agentFirstReplyAt: firstReplyAt,
        forwardedToFirstReplyMs: latencyDelta(trace?.agentForwardedAt, firstReplyAt),
        forwardedToCompletedMs: latencyDelta(trace?.agentForwardedAt, agentCompletedAt),
        firstReplyToCompletedMs: latencyDelta(firstReplyAt, agentCompletedAt),
        outcome: sawError ? 'error' : signal.aborted ? 'timeout' : 'completed',
      },
      'RelayClaw latency checkpoint',
    );

    if (!sawError) yield agentMsg('done', this.catId);
    else yield agentMsg('done', this.catId);
  }
}

function buildSignal(timeoutMs: number, callerSignal?: AbortSignal): AbortSignal {
  const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
  if (callerSignal) signals.push(callerSignal);
  return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
}

function decodeQuotedPythonLikeString(raw: string): string {
  return raw
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function normalizeRelayClawFinalContent(rawContent: unknown): string {
  if (typeof rawContent !== 'string') return '';

  const trimmed = rawContent.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof parsed.output === 'string') {
        return parsed.output.replace(/^(?:\r?\n)+/, '');
      }
    } catch {
      // Fall through to Python-dict-style extraction.
    }
  }

  if (!trimmed.includes('result_type') || !trimmed.includes('output')) {
    return rawContent.replace(/^(?:\r?\n)+/, '');
  }

  const singleQuoted = rawContent.match(/['"]output['"]\s*:\s*'((?:\\'|[^'])*)'/s);
  if (singleQuoted?.[1] != null) {
    return decodeQuotedPythonLikeString(singleQuoted[1]).replace(/^(?:\r?\n)+/, '');
  }

  const doubleQuoted = rawContent.match(/['"]output['"]\s*:\s*"((?:\\"|[^"])*)"/s);
  if (doubleQuoted?.[1] != null) {
    return decodeQuotedPythonLikeString(doubleQuoted[1]).replace(/^(?:\r?\n)+/, '');
  }

  return rawContent.replace(/^(?:\r?\n)+/, '');
}

function computeFinalTextDelta(streamedText: string, finalText: string): string {
  if (!finalText) return '';
  if (!streamedText) return finalText;
  if (finalText === streamedText) return '';
  if (finalText.startsWith(streamedText)) return finalText.slice(streamedText.length);
  if (streamedText.startsWith(finalText)) return '';
  return `${streamedText.endsWith('\n') ? '' : '\n\n'}${finalText}`;
}

function buildRequest(
  requestId: string,
  channelId: string,
  sessionId: string,
  prompt: string,
  options?: AgentServiceOptions,
): Record<string, unknown> {
  const imagePaths = extractImagePaths(options?.contentBlocks, options?.uploadDir);
  return {
    request_id: requestId,
    channel_id: channelId,
    session_id: sessionId,
    req_method: 'chat.send',
    params: {
      query: appendLocalImagePathHints(prompt, imagePaths),
      mode: 'agent',
      ...(options?.workingDirectory ? { project_dir: options.workingDirectory } : {}),
      ...(buildRelayClawFilesPayload(options?.contentBlocks, options?.uploadDir)
        ? { files: buildRelayClawFilesPayload(options?.contentBlocks, options?.uploadDir) }
        : {}),
      ...(buildCatCafeMcpRequestConfig(options) ? { cat_cafe_mcp: buildCatCafeMcpRequestConfig(options) } : {}),
    },
    is_stream: true,
    timestamp: Date.now() / 1000,
  };
}

export const __relayClawInternals = {
  isSidecarReady,
};
