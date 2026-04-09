/**
 * A2A Agent Service
 * Implements AgentService for remote agents speaking the A2A protocol (JSON-RPC 2.0 over HTTPS).
 */

import { randomUUID } from 'node:crypto';
import type { A2AAgentConfig, A2AJsonRpcResponse, CatId } from '@clowder/shared';
import { createCatId } from '@clowder/shared';
import type { AgentMessage, AgentService, AgentServiceOptions } from '@clowder/core';
import { transformA2ATaskToMessages } from './a2a-event-transform.js';

export interface A2AAgentServiceOptions {
  catId?: CatId;
  config: A2AAgentConfig;
  fetchFn?: typeof fetch;
}

function agentMsg(type: AgentMessage['type'], catId: CatId, content?: string): AgentMessage {
  return { type, catId, content, timestamp: Date.now() };
}

export class A2AAgentService implements AgentService {
  private readonly catId: CatId;
  private readonly config: A2AAgentConfig;
  private readonly fetchFn: typeof fetch;

  constructor(options: A2AAgentServiceOptions) {
    this.catId = options.catId ?? createCatId('a2a-agent');
    this.config = options.config;
    this.fetchFn = options.fetchFn ?? globalThis.fetch;
  }

  async *invoke(prompt: string, options?: AgentServiceOptions): AsyncIterable<AgentMessage> {
    const taskId = randomUUID();

    const body = {
      jsonrpc: '2.0' as const,
      id: taskId,
      method: 'tasks/send',
      params: {
        id: taskId,
        message: {
          role: 'user' as const,
          parts: [{ type: 'text' as const, text: prompt }],
        },
      },
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const timeoutMs = this.config.timeoutMs ?? 120_000;
    const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
    if (options?.signal) {
      signals.push(options.signal);
    }
    const combinedSignal = signals.length === 1 ? signals[0] : AbortSignal.any(signals);

    yield agentMsg('session_init', this.catId);

    try {
      const response = await this.fetchFn(this.config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: combinedSignal,
      });

      if (!response.ok) {
        yield agentMsg('error', this.catId, `A2A request failed: ${response.status} ${response.statusText}`);
        return;
      }

      const rpcResponse = (await response.json()) as A2AJsonRpcResponse;

      if (rpcResponse.error) {
        yield agentMsg(
          'error',
          this.catId,
          `A2A RPC error: ${rpcResponse.error.message} (code: ${rpcResponse.error.code})`,
        );
        return;
      }

      if (!rpcResponse.result) {
        yield agentMsg('error', this.catId, 'A2A response missing result');
        return;
      }

      const messages = transformA2ATaskToMessages(rpcResponse.result, this.catId);
      for (const m of messages) {
        yield m;
      }

      if (!messages.some((m) => m.type === 'done')) {
        yield agentMsg('done', this.catId);
      }
    } catch (err) {
      const isCallerAbort = options?.signal?.aborted === true;
      if (isCallerAbort) {
        yield agentMsg('done', this.catId);
      } else {
        const errMsg = err instanceof Error ? err.message : String(err);
        yield agentMsg('error', this.catId, `A2A connection error: ${errMsg}`);
      }
    }
  }
}
