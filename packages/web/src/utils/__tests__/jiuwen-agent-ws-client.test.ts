/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  JiuwenAgentWsClient,
  JiuwenAgentWsError,
  resolveJiuwenAgentWsUrl,
  type JiuwenAgentConfigGetResponse,
  type JiuwenAgentConfigSetResponse,
} from '../jiuwen-agent-ws-client';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  message(payload: unknown): void {
    this.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify(payload),
      }),
    );
  }

  fail(): void {
    this.onerror?.(new Event('error'));
  }

  closeWith(code = 1006, reason = 'closed'): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code, reason }));
  }
}

describe('jiuwen-agent-ws-client', () => {
  const originalWebSocket = globalThis.WebSocket;
  const originalEnv = process.env.NEXT_PUBLIC_JIUWEN_AGENT_WS_URL;

  beforeEach(() => {
    MockWebSocket.instances.length = 0;
    process.env.NEXT_PUBLIC_JIUWEN_AGENT_WS_URL = 'ws://127.0.0.1:18092';
    vi.restoreAllMocks();
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    process.env.NEXT_PUBLIC_JIUWEN_AGENT_WS_URL = originalEnv;
  });

  it('resolves websocket url from environment', () => {
    expect(resolveJiuwenAgentWsUrl()).toBe('ws://127.0.0.1:18092');
  });

  it('throws when websocket url is missing', () => {
    delete process.env.NEXT_PUBLIC_JIUWEN_AGENT_WS_URL;

    expect(() => resolveJiuwenAgentWsUrl()).toThrow('jiuwen WebSocket URL is not configured');
  });

  it('waits for the first frame before resolving connect and sending requests', async () => {
    const client = new JiuwenAgentWsClient();
    const connectPromise = client.connect();
    const socket = MockWebSocket.instances[0]!;
    let connected = false;

    void connectPromise.then(() => {
      connected = true;
    });

    socket.open();
    await Promise.resolve();

    expect(connected).toBe(false);

    const responsePromise = client.configGet(['permissions']);
    await Promise.resolve();
    expect(socket.sent).toHaveLength(0);

    socket.message({ type: 'event', event: 'connection.ack', payload: { status: 'ready' } });
    await connectPromise;
    await Promise.resolve();

    const sent = JSON.parse(socket.sent[0] ?? '{}') as {
      request_id: string;
      req_method: string;
      params: { config_paths: string[] };
    };

    expect(sent.req_method).toBe('config.get');
    expect(sent.params.config_paths).toEqual(['permissions']);

    socket.message({
      request_id: sent.request_id,
      channel_id: 'web',
      ok: true,
      payload: { trees: { permissions: { enabled: false } } },
    });

    await expect(responsePromise).resolves.toEqual({
      request_id: sent.request_id,
      channel_id: 'web',
      ok: true,
      payload: { trees: { permissions: { enabled: false } } },
    } satisfies JiuwenAgentConfigGetResponse);
  });

  it('sends config.set payloads and resolves matching response ids only', async () => {
    const client = new JiuwenAgentWsClient({ channelId: 'hub-config' });
    const connectPromise = client.connect();
    const socket = MockWebSocket.instances[0]!;
    socket.open();
    socket.message({ type: 'event', event: 'connection.ack', payload: { status: 'ready' } });
    await connectPromise;

    const responsePromise = client.configSet({
      permissions: { enabled: false },
    });
    await Promise.resolve();
    const sent = JSON.parse(socket.sent[0] ?? '{}') as {
      request_id: string;
      channel_id: string;
      params: { config_yaml: unknown };
    };

    expect(sent.channel_id).toBe('hub-config');
    expect(sent.params.config_yaml).toEqual({ permissions: { enabled: false } });

    socket.message({
      request_id: 'someone-else',
      channel_id: 'hub-config',
      ok: true,
      payload: { ignored: true },
    });
    socket.message({
      request_id: sent.request_id,
      channel_id: 'hub-config',
      ok: true,
      payload: { updated_top_level_keys: ['permissions'], reloaded: true, yaml_written: true },
    });

    await expect(responsePromise).resolves.toEqual({
      request_id: sent.request_id,
      channel_id: 'hub-config',
      ok: true,
      payload: { updated_top_level_keys: ['permissions'], reloaded: true, yaml_written: true },
    } satisfies JiuwenAgentConfigSetResponse);
  });

  it('rejects pending requests when the socket closes unexpectedly', async () => {
    const client = new JiuwenAgentWsClient();
    const connectPromise = client.connect();
    const socket = MockWebSocket.instances[0]!;
    socket.open();
    socket.message({ type: 'event', event: 'connection.ack', payload: { status: 'ready' } });
    await connectPromise;

    const responsePromise = client.configGet(['permissions']);
    await Promise.resolve();
    socket.closeWith(1011, 'server down');

    await expect(responsePromise).rejects.toThrow('WebSocket connection closed unexpectedly');
  });

  it('rejects connect when websocket emits an error', async () => {
    const client = new JiuwenAgentWsClient();
    const connectPromise = client.connect();
    const socket = MockWebSocket.instances[0]!;

    socket.fail();

    await expect(connectPromise).rejects.toEqual(new JiuwenAgentWsError('jiuwen connection failed'));
  });
});
