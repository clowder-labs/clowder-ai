/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * RelayClaw Event Transformer
 *
 * relay-claw AgentResponseChunk → Clowder AI AgentMessage mapping.
 *
 * Mapping (event_type → AgentMessageType):
 *   chat.delta              → text   (streaming text fragment)
 *   chat.final              → (skip; completion marker only)
 *   chat.tool_call          → tool_use
 *   chat.tool_result        → tool_result
 *   chat.error              → error
 *   chat.processing_status  → system_info
 *   chat.ask_user_question  → system_info
 *   context.compressed      → (skip)
 *   todo.updated            → (skip)
 */

import type { CatId, RelayClawChunkPayload, RelayClawWsFrame } from '@cat-cafe/shared';
import { createModuleLogger } from '../../../../../infrastructure/logger.js';
import type { AgentMessage } from '../../types.js';

const log = createModuleLogger('relayclaw-event-transform');

const RELAYCLAW_TRANSPORT_ERROR_TEXT_PATTERNS = [
  /^\s*\[(?:错误|error)\]\s*jiuwen WebSocket connection closed unexpectedly\s*$/i,
  /^\s*jiuwen WebSocket connection closed unexpectedly\s*$/i,
] as const;

function msg(type: AgentMessage['type'], catId: CatId, content?: string): AgentMessage {
  return { type, catId, content, timestamp: Date.now() };
}

export function isRelayClawTransportErrorText(content: unknown): content is string {
  if (typeof content !== 'string') return false;
  const normalized = content.trim();
  if (!normalized) return false;
  return RELAYCLAW_TRANSPORT_ERROR_TEXT_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Transform a single relay-claw WS chunk into an AgentMessage (or null to skip).
 */
export function transformRelayClawChunk(frame: RelayClawWsFrame, catId: CatId): AgentMessage | null {
  // connection.ack is handled at connection level, not yielded as a message
  if (frame.type === 'event' && frame.event === 'connection.ack') {
    return null;
  }

  const payload: RelayClawChunkPayload | null | undefined = frame.payload;
  if (!payload) return null;

  const eventType = payload.event_type;

  // Terminal chunk with no event_type — just marks stream end
  if (!eventType && payload.is_complete) return null;

  switch (eventType) {
    case 'chat.delta': {
      const content = payload.content;
      if (!content) return null;
      if (isRelayClawTransportErrorText(content)) return null;
      if (payload.source_chunk_type === 'llm_reasoning') {
        return {
          type: 'system_info',
          catId,
          content: JSON.stringify({ type: 'thinking', catId, text: content, mergeStrategy: 'append' }),
          timestamp: Date.now(),
        };
      }
      return msg('text', catId, content);
    }

    case 'chat.final': {
      return null;
    }

    case 'chat.tool_call': {
      const toolCall = payload.tool_call;
      if (!toolCall) return null;
      const toolName = (toolCall.name ?? toolCall.tool_name ?? 'unknown') as string;
      const toolInput = (toolCall.arguments ?? toolCall.input ?? toolCall) as Record<string, unknown>;
      const toolCallId = (toolCall.id ?? toolCall.tool_call_id ?? payload.tool_call_id) as string | undefined;
      return {
        type: 'tool_use',
        catId,
        toolName,
        toolInput,
        toolCallId,
        timestamp: Date.now(),
      };
    }

    case 'chat.tool_result': {
      const toolResult = (payload.tool_result ?? payload) as Record<string, unknown>;
      const result = (payload.result ?? toolResult.result ?? '') as string | unknown;
      const toolCallId = (toolResult.tool_call_id ?? payload.tool_call_id) as string | undefined;
      const toolName = (toolResult.tool_name ?? payload.tool_name) as string | undefined;
      return {
        type: 'tool_result',
        catId,
        content: typeof result === 'string' ? result : JSON.stringify(result),
        toolCallId,
        toolName,
        timestamp: Date.now(),
      };
    }

    case 'chat.error': {
      const error = payload.error ?? 'Unknown relay-claw error';
      return { type: 'error', catId, error, timestamp: Date.now() };
    }

    case 'chat.processing_status': {
      const status = payload.is_processing ? (payload.current_task ?? 'thinking') : 'idle';
      return msg('system_info', catId, JSON.stringify({ type: 'processing_status', status }));
    }

    case 'chat.ask_user_question': {
      const question = payload.content ?? JSON.stringify(payload);
      return msg('system_info', catId, question);
    }

    // Events we intentionally skip
    case 'context.compressed':
    case 'todo.updated':
    case 'chat.media':
    case 'chat.file':
    case 'chat.interrupt_result':
    case 'chat.subtask_update':
    case 'chat.session_result':
    case 'connection.ack':
      return null;

    default: {
      // Unknown event: extract content if present, otherwise skip
      log.warn({ eventType, requestId: frame.request_id }, 'jiuwen unknown event type — possible protocol drift');
      const content = payload.content;
      if (isRelayClawTransportErrorText(content)) return null;
      if (content) return msg('text', catId, content);
      return null;
    }
  }
}
