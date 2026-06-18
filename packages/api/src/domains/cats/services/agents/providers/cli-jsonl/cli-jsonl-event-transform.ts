/**
 * F241 Phase A: generic CLI JSONL event mapping.
 *
 * The first supported profile is clowder-code's one-shot `turn_result` line.
 */

import type { CatId } from '@cat-cafe/shared';
import type { AgentMessage, TokenUsage } from '../../../types.js';

interface CliJsonlTurnResult {
  type: 'turn_result';
  response?: unknown;
  terminal?: { kind?: unknown };
  stats?: {
    sessionId?: unknown;
    tokensUsed?: unknown;
    inputTokens?: unknown;
    outputTokens?: unknown;
  };
}

export interface CliJsonlTransformOptions {
  emitSessionInit?: boolean;
  ephemeralSession?: boolean;
}

function isTurnResult(value: unknown): value is CliJsonlTurnResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'turn_result'
  );
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function buildUsage(stats: CliJsonlTurnResult['stats']): TokenUsage | undefined {
  const inputTokens = num(stats?.inputTokens);
  const outputTokens = num(stats?.outputTokens);
  const totalTokens = num(stats?.tokensUsed);
  if (inputTokens == null && outputTokens == null && totalTokens == null) return undefined;
  return {
    ...(inputTokens != null ? { inputTokens, lastTurnInputTokens: inputTokens } : {}),
    ...(outputTokens != null ? { outputTokens } : {}),
    ...(totalTokens != null ? { totalTokens } : {}),
  };
}

function isSuccessfulTerminal(kind: string | undefined): boolean {
  return kind === undefined || kind === 'completed' || kind === 'completed_with_evidence';
}

export function transformCliJsonlEvent(
  event: unknown,
  catId: CatId,
  options: CliJsonlTransformOptions = {},
): AgentMessage[] {
  if (!isTurnResult(event)) return [];

  const now = Date.now();
  const messages: AgentMessage[] = [];
  const sessionId = typeof event.stats?.sessionId === 'string' ? event.stats.sessionId : undefined;
  if (sessionId && options.emitSessionInit !== false) {
    messages.push({
      type: 'session_init',
      catId,
      sessionId,
      ephemeralSession: options.ephemeralSession ?? false,
      timestamp: now,
    });
  }

  const usage = buildUsage(event.stats);
  if (usage) {
    messages.push({
      type: 'agent_loop',
      catId,
      timestamp: now,
      metadata: { provider: 'cli-jsonl', model: '', usage },
    });
  }

  const response = typeof event.response === 'string' ? event.response : '';
  if (response.length > 0) {
    messages.push({
      type: 'text',
      catId,
      content: response,
      timestamp: now,
    });
  }

  const terminalKind = typeof event.terminal?.kind === 'string' ? event.terminal.kind : undefined;
  if (!isSuccessfulTerminal(terminalKind)) {
    messages.push({
      type: 'error',
      catId,
      error: `External agent stopped with terminal kind: ${terminalKind}`,
      errorCode: 'terminal_not_completed',
      timestamp: now,
    });
  }

  return messages;
}
