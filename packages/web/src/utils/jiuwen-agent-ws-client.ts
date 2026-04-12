/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

type JiuwenAgentReqMethod = 'config.get' | 'config.set';

export interface JiuwenAgentRequest {
  request_id: string;
  channel_id: string;
  session_id: string | null;
  req_method: JiuwenAgentReqMethod;
  params: Record<string, unknown>;
  is_stream: false;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface JiuwenAgentResponse<TPayload = Record<string, unknown>> {
  request_id: string;
  channel_id: string;
  ok: boolean;
  payload?: TPayload;
  metadata?: Record<string, unknown>;
}

export type JiuwenAgentConfigGetResponse = JiuwenAgentResponse<{
  trees?: Record<string, unknown>;
  error?: string;
  missing_paths?: string[];
}>;

export type JiuwenAgentConfigSetResponse = JiuwenAgentResponse<{
  updated_top_level_keys?: string[];
  reloaded?: boolean;
  yaml_written?: boolean;
  dropped_paths?: string[];
  error?: string;
}>;

export interface JiuwenAgentWsClientOptions {
  url?: string;
  channelId?: string;
  sessionId?: string | null;
}

interface PendingRequest {
  reject: (reason?: unknown) => void;
  resolve: (value: JiuwenAgentResponse) => void;
}

const DEFAULT_CHANNEL_ID = 'web';
const JIUWEN_WS_URL_ENV_KEY = 'NEXT_PUBLIC_JIUWEN_AGENT_WS_URL';

function createRequestId(): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;
  return `jiuwen-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function resolveJiuwenAgentWsUrl(): string {
  const value = process.env.NEXT_PUBLIC_JIUWEN_AGENT_WS_URL?.trim();
  if (!value) {
    throw new JiuwenAgentWsError('jiuwen WebSocket URL is not configured');
  }
  return value;
}

export class JiuwenAgentWsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JiuwenAgentWsError';
  }
}

export class JiuwenAgentWsClient {
  private readonly channelId: string;
  private readonly sessionId: string | null;
  private readonly url: string;
  private readonly pending = new Map<string, PendingRequest>();
  private ws: WebSocket | null = null;
  private connectPromise: Promise<void> | null = null;

  constructor(options: JiuwenAgentWsClientOptions = {}) {
    this.url = options.url ?? resolveJiuwenAgentWsUrl();
    this.channelId = options.channelId ?? DEFAULT_CHANNEL_ID;
    this.sessionId = options.sessionId ?? null;
  }

  connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      let settled = false;

      this.ws = ws;

      ws.onopen = () => {
        settled = true;
        this.connectPromise = null;
        resolve();
      };

      ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      ws.onerror = () => {
        if (settled) return;
        settled = true;
        this.connectPromise = null;
        reject(new JiuwenAgentWsError('jiuwen connection failed'));
      };

      ws.onclose = () => {
        this.ws = null;
        this.connectPromise = null;
        this.rejectPending(new JiuwenAgentWsError('WebSocket connection closed unexpectedly'));
        if (!settled) {
          settled = true;
          reject(new JiuwenAgentWsError('WebSocket connection closed unexpectedly'));
        }
      };
    });

    return this.connectPromise;
  }

  disconnect(): void {
    const ws = this.ws;
    this.ws = null;
    this.connectPromise = null;
    this.rejectPending(new JiuwenAgentWsError('WebSocket connection closed unexpectedly'));
    ws?.close();
  }

  async configGet(configPaths: string[]): Promise<JiuwenAgentConfigGetResponse> {
    return this.send({
      req_method: 'config.get',
      params: { config_paths: configPaths },
    }) as Promise<JiuwenAgentConfigGetResponse>;
  }

  async configSet(configYaml: Record<string, unknown>): Promise<JiuwenAgentConfigSetResponse> {
    return this.send({
      req_method: 'config.set',
      params: { config_yaml: configYaml },
    }) as Promise<JiuwenAgentConfigSetResponse>;
  }

  private async send(input: Pick<JiuwenAgentRequest, 'req_method' | 'params'>): Promise<JiuwenAgentResponse> {
    await this.connect();

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new JiuwenAgentWsError('jiuwen connection failed');
    }

    const request: JiuwenAgentRequest = {
      request_id: createRequestId(),
      channel_id: this.channelId,
      session_id: this.sessionId,
      req_method: input.req_method,
      params: input.params,
      is_stream: false,
      timestamp: Date.now() / 1000,
    };

    return new Promise<JiuwenAgentResponse>((resolve, reject) => {
      this.pending.set(request.request_id, { resolve, reject });
      this.ws?.send(JSON.stringify(request));
    });
  }

  private handleMessage(rawData: string | ArrayBuffer | Blob | ArrayBufferView): void {
    if (typeof rawData !== 'string') return;

    let message: unknown;
    try {
      message = JSON.parse(rawData);
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;

    const frame = message as { event?: string; request_id?: string; type?: string };
    if (frame.type === 'event' && frame.event === 'connection.ack') {
      return;
    }

    const requestId = frame.request_id;
    if (!requestId) return;

    const pending = this.pending.get(requestId);
    if (!pending) return;

    this.pending.delete(requestId);
    pending.resolve(message as JiuwenAgentResponse);
  }

  private rejectPending(error: JiuwenAgentWsError): void {
    for (const [, request] of this.pending) {
      request.reject(error);
    }
    this.pending.clear();
  }
}

export { JIUWEN_WS_URL_ENV_KEY };
