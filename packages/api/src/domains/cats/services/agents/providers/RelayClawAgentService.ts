/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * RelayClaw Agent Service
 *
 * Thin orchestration layer:
 * - optional sidecar bootstrap
 * - persistent WS connection
 * - request/response streaming
 */

import { createHash, randomUUID } from 'node:crypto';
import { basename, join } from 'node:path';
import type { CatId, RelayClawAgentConfig } from '@cat-cafe/shared';
import { createCatId } from '@cat-cafe/shared';
import { createModuleLogger } from '../../../../../infrastructure/logger.js';
import type { AgentMessage, AgentService, AgentServiceOptions, MessageMetadata, TokenUsage } from '../../types.js';

const log = createModuleLogger('relayclaw-agent');
import { appendLocalUploadPathHints } from './image-cli-bridge.js';
import { extractUploadRefs } from './image-paths.js';
import {
  getJiuwenPermissionBridge,
  type JiuwenAskUserQuestionPayload,
  type JiuwenBridgeAnswerSubmission,
  type JiuwenPermissionBridge,
} from '../../auth/JiuwenPermissionBridge.js';
import {
  FrameQueue,
  RelayClawConnectionManager,
  type RelayClawConnection,
  type RelayClawConnectionFactory,
} from './relayclaw-connection.js';
import { buildCatCafeMcpRequestConfig } from './relayclaw-catcafe-mcp.js';
import {
  DefaultRelayClawSidecarController,
  isSidecarReady,
  type RelayClawSidecarController,
  type RelayClawSidecarControllerDeps,
} from './relayclaw-sidecar.js';
import { isRelayClawTransportErrorText, transformRelayClawChunk } from './relayclaw-event-transform.js';

const DEFAULT_RELAYCLAW_TIMEOUT_MS = 30 * 60 * 1000;

export interface RelayClawAgentServiceOptions {
  catId?: CatId;
  config: RelayClawAgentConfig;
}

export interface RelayClawAgentServiceDeps {
  createConnection?: RelayClawConnectionFactory;
  createSidecarController?: (catId: CatId, config: RelayClawAgentConfig) => RelayClawSidecarController;
  sidecarDeps?: RelayClawSidecarControllerDeps;
  permissionBridge?: JiuwenPermissionBridge;
}

interface RelayClawScopeDescriptor {
  key: string;
  homeDir?: string;
}

interface RelayClawScopeRuntime {
  requestQueues: Map<string, FrameQueue>;
  connection: RelayClawConnection;
  sidecar: RelayClawSidecarController;
  resolvedUrl: string | null;
}

function agentMsg(type: AgentMessage['type'], catId: CatId, content?: string): AgentMessage {
  return { type, catId, content, timestamp: Date.now() };
}

function resolveRelayClawSessionId(channelId: string, options?: AgentServiceOptions): string {
  const existingSessionId = options?.cliSessionId?.trim() || options?.sessionId?.trim();
  if (existingSessionId) return existingSessionId;

  const auditContext = options?.auditContext;
  if (auditContext?.threadId && auditContext.userId && auditContext.catId) {
    const digest = createHash('sha256')
      .update(`${auditContext.userId}\n${auditContext.catId}\n${auditContext.threadId}`)
      .digest('hex')
      .slice(0, 24);
    return `${channelId}_${digest}`;
  }

  return `${channelId}_${Date.now().toString(16)}_${randomUUID().slice(0, 12)}`;
}

function buildRelayClawFilesPayload(
  contentBlocks: AgentServiceOptions['contentBlocks'],
  uploadDir?: string,
): Record<string, unknown> | undefined {
  const uploadRefs = extractUploadRefs(contentBlocks, uploadDir);
  if (uploadRefs.length === 0) return undefined;
  return {
    uploaded: uploadRefs.map((ref, index) => ({
      type: ref.kind,
      name: ref.fileName || basename(ref.path) || `${ref.kind}-${index + 1}`,
      path: ref.path,
    })),
  };
}

export class RelayClawAgentService implements AgentService {
  private readonly catId: CatId;
  private readonly config: RelayClawAgentConfig;
  private readonly createConnection: RelayClawConnectionFactory;
  private readonly createSidecarController: (catId: CatId, config: RelayClawAgentConfig) => RelayClawSidecarController;
  private readonly permissionBridge: JiuwenPermissionBridge;
  private readonly scopes = new Map<string, RelayClawScopeRuntime>();

  constructor(options: RelayClawAgentServiceOptions, deps?: RelayClawAgentServiceDeps) {
    this.catId = options.catId ?? createCatId('relayclaw-agent');
    this.config = options.config;
    this.createConnection =
      deps?.createConnection ?? ((requestQueues) => new RelayClawConnectionManager({ requestQueues }));
    this.createSidecarController =
      deps?.createSidecarController ??
      ((catId, config) => new DefaultRelayClawSidecarController(catId, config, deps?.sidecarDeps));
    this.permissionBridge = deps?.permissionBridge ?? getJiuwenPermissionBridge();
  }

  async *invoke(prompt: string, options?: AgentServiceOptions): AsyncIterable<AgentMessage> {
    const signal = buildSignal(this.config.timeoutMs ?? DEFAULT_RELAYCLAW_TIMEOUT_MS, options?.signal);
    const channelId = this.config.channelId ?? 'officeclaw';
    const sessionId = resolveRelayClawSessionId(channelId, options);
    const scope = this.resolveScope(options);
    const runtime = this.getOrCreateScopeRuntime(scope);
    yield { type: 'session_init', catId: this.catId, sessionId, timestamp: Date.now() };

    try {
      await this.ensureConnected(runtime, signal, options);
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
    runtime.requestQueues.set(requestId, queue);
    const onAbort = () => queue.abort();
    signal.addEventListener('abort', onAbort, { once: true });

    const sendTs = Date.now();
    try {
      const request = buildRequest(requestId, channelId, sessionId, prompt, options);
      log.info({ requestId, catId: this.catId, sessionId, promptLen: prompt.length }, 'jiuwen request sent');
      runtime.connection.send(request);
      yield* this.consumeFrames(runtime, requestId, queue, signal, options, sendTs);
    } catch (err) {
      if (options?.signal?.aborted) {
        yield agentMsg('done', this.catId);
      } else {
        yield {
          type: 'error',
          catId: this.catId,
          error: `jiuwen error: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        };
      }
    } finally {
      signal.removeEventListener('abort', onAbort);
      runtime.requestQueues.delete(requestId);
    }
  }

  dispose(): void {
    for (const runtime of this.scopes.values()) {
      runtime.connection.close();
      runtime.sidecar.stop();
      runtime.requestQueues.clear();
    }
    this.scopes.clear();
  }

  private resolveScope(options?: AgentServiceOptions): RelayClawScopeDescriptor {
    if (!this.config.autoStart) {
      return { key: `external:${this.config.url ?? ''}` };
    }

    const callbackEnv = options?.callbackEnv ?? {};
    const apiBase = callbackEnv.API_BASE || callbackEnv.OPENAI_BASE_URL || callbackEnv.OPENAI_API_BASE || '';
    const apiKey = callbackEnv.API_KEY || callbackEnv.OPENAI_API_KEY || callbackEnv.OPENROUTER_API_KEY || '';
    const modelName = this.config.modelName?.trim() || '';
    const scopeHash = createHash('sha256').update([apiBase, apiKey, modelName].join('\n')).digest('hex').slice(0, 12);
    const baseHomeDir =
      this.config.homeDir?.trim() || join(process.cwd(), '.office-claw', 'relayclaw', this.catId as string);

    return {
      key: `auto:${scopeHash}`,
      homeDir: join(baseHomeDir, `scope-${scopeHash}`),
    };
  }

  private getOrCreateScopeRuntime(scope: RelayClawScopeDescriptor): RelayClawScopeRuntime {
    const existing = this.scopes.get(scope.key);
    if (existing) return existing;

    const requestQueues = new Map<string, FrameQueue>();
    const scopeConfig: RelayClawAgentConfig = {
      ...this.config,
      ...(scope.homeDir ? { homeDir: scope.homeDir } : {}),
    };
    const runtime: RelayClawScopeRuntime = {
      requestQueues,
      connection: this.createConnection(requestQueues),
      sidecar: this.createSidecarController(this.catId, scopeConfig),
      resolvedUrl: null,
    };
    this.scopes.set(scope.key, runtime);
    return runtime;
  }

  private async ensureConnected(
    runtime: RelayClawScopeRuntime,
    signal?: AbortSignal,
    options?: AgentServiceOptions,
  ): Promise<void> {
    if (this.config.autoStart) {
      runtime.resolvedUrl = await runtime.sidecar.ensureStarted(options, signal);
    }
    const url = runtime.resolvedUrl ?? this.config.url;
    if (!url) throw new Error('jiuwen WebSocket URL is not configured');
    await runtime.connection.ensureConnected(url, signal);
  }

  private async *consumeFrames(
    runtime: RelayClawScopeRuntime,
    requestId: string,
    queue: FrameQueue,
    signal: AbortSignal,
    options?: AgentServiceOptions,
    sendTs?: number,
  ): AsyncIterable<AgentMessage> {
    let sawError = false;
    let streamedText = '';
    let usage: TokenUsage | undefined;
    let frameCount = 0;
    let firstFrameLogged = false;

    while (!signal.aborted) {
      const frame = await queue.take();
      if (frame === null) break;
      frameCount++;
      if (!firstFrameLogged) {
        firstFrameLogged = true;
        const ttfb = sendTs ? Date.now() - sendTs : undefined;
        log.info({ requestId, catId: this.catId, ttfbMs: ttfb }, 'jiuwen first frame received');
      }

      // Extract usage from frame metadata (typically on chat.final frame)
      if (frame.metadata?.usage) {
        const u = frame.metadata.usage as Record<string, unknown>;
        usage = {
          inputTokens: typeof u.input_tokens === 'number' ? u.input_tokens : undefined,
          outputTokens: typeof u.output_tokens === 'number' ? u.output_tokens : undefined,
          totalTokens: typeof u.total_tokens === 'number' ? u.total_tokens : undefined,
        };
        log.info('[USAGE_DEBUG] Received usage from jiuwenclaw frame metadata: %o', usage);
      }

      const payload = frame.payload;
      if (
        payload?.event_type === 'chat.ask_user_question' &&
        options?.auditContext &&
        typeof payload.request_id === 'string' &&
        Array.isArray(payload.questions)
      ) {
        const bridged = await this.permissionBridge.ingestAskUserQuestion({
          catId: this.catId,
          threadId: options.auditContext.threadId,
          invocationId: options.auditContext.invocationId,
          sessionId:
            typeof payload.session_id === 'string' && payload.session_id.trim().length > 0
              ? payload.session_id
              : resolveRelayClawSessionId(this.config.channelId ?? 'officeclaw', options),
          payload: payload as unknown as JiuwenAskUserQuestionPayload,
          submitAnswer: async (submission) => {
            await this.submitJiuwenUserAnswer(runtime, submission);
          },
        });
        if (bridged) continue;
      }
      const message = transformRelayClawChunk(frame, this.catId);
      if (message) {
        yield message;
        if (message.type === 'text' && message.content) streamedText += message.content;
        if (message.type === 'error') {
          sawError = true;
          break;
        }
      } else if (payload?.event_type === 'chat.final') {
        const finalText = normalizeRelayClawFinalContent(payload.content);
        if (isRelayClawTransportErrorText(finalText)) {
          continue;
        }
        const deltaToEmit = computeFinalTextDelta(streamedText, finalText);
        if (deltaToEmit) {
          streamedText += deltaToEmit;
          yield agentMsg('text', this.catId, deltaToEmit);
        }
      }

      if (frame.is_complete === true || payload?.is_complete === true) break;
    }

    // Build metadata for done message (consistent with Claude/Codex providers)
    const metadata: MessageMetadata = {
      provider: 'jiuwen',
      model: this.config.modelName ?? 'unknown',
      usage,
    };

      if (!sawError && signal.aborted && !options?.signal?.aborted) {
      sawError = true;
      yield {
        type: 'error',
        catId: this.catId,
        error: 'jiuwen request timed out before completion',
        timestamp: Date.now(),
      };
    }

    const durationMs = sendTs ? Date.now() - sendTs : undefined;
    log.info({ requestId, catId: this.catId, frameCount, durationMs, sawError, usage }, 'jiuwen request complete');
    yield { type: 'done', catId: this.catId, metadata, timestamp: Date.now() };
  }

  private async submitJiuwenUserAnswer(
    runtime: RelayClawScopeRuntime,
    submission: JiuwenBridgeAnswerSubmission,
  ): Promise<void> {
    const requestId = randomUUID();
    const queue = new FrameQueue();
    runtime.requestQueues.set(requestId, queue);

    try {
      const url = runtime.resolvedUrl ?? this.config.url;
      if (!url) throw new Error('jiuwen WebSocket URL is not configured');
      await runtime.connection.ensureConnected(url);
      runtime.connection.send({
        request_id: requestId,
        channel_id: this.config.channelId ?? 'officeclaw',
        session_id: submission.sessionId,
        req_method: 'chat.user_answer',
        params: {
          request_id: submission.jiuwenRequestId,
          answers: submission.answers,
        },
        is_stream: false,
        timestamp: Date.now() / 1000,
      });
      await this.drainControlFrames(queue, 5000);
    } finally {
      runtime.requestQueues.delete(requestId);
    }
  }

  private async drainControlFrames(queue: FrameQueue, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const remaining = Math.max(deadline - Date.now(), 1);
      const frame = await Promise.race([
        queue.take(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), remaining)),
      ]);
      if (frame === null) return;
      if (frame.is_complete === true || frame.payload?.is_complete === true) return;
    }
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
  const uploadRefs = extractUploadRefs(options?.contentBlocks, options?.uploadDir);
  const systemPrompt = typeof options?.systemPrompt === 'string' ? options.systemPrompt.trim() : '';
  return {
    request_id: requestId,
    channel_id: channelId,
    session_id: sessionId,
    req_method: 'chat.send',
    params: {
      query: appendLocalUploadPathHints(prompt, uploadRefs),
      ...(systemPrompt ? { system_prompt: systemPrompt } : {}),
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
  isRelayClawTransportErrorText,
};
