/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Message Visibility — F35 Whisper
 * Pure functions for determining whether a message is visible to a given viewer.
 */

import type { CatId } from '@office-claw/shared';
import type { StoredMessage } from './ports/MessageStore.js';

/**
 * System-level userIds whose messages are visible to ALL thread participants
 * regardless of the per-user filter (scheduler, system, etc.).
 */
export const SYSTEM_USER_IDS: ReadonlySet<string> = new Set(['scheduler', 'system']);

/**
 * Returns true if a message was authored by a trusted system-level source.
 *
 * Historical writes use `catId: 'system'`; newer display-only badges (for example
 * persisted ACP errors) use `catId: null`. Both must bypass per-user filtering.
 */
export function isSystemUserMessage(msg: Pick<StoredMessage, 'userId' | 'catId'>): boolean {
  return SYSTEM_USER_IDS.has(msg.userId) && (msg.catId === 'system' || msg.catId === null);
}

/**
 * Scheduler-triggered placeholder messages are persisted so the scheduler can
 * wake an agent with a concrete reply target. They should remain stored, but
 * history queries can hide them to avoid showing duplicate "trigger + agent"
 * turns to users and agents.
 */
export function isScheduledTriggerPlaceholder(
  msg: Pick<StoredMessage, 'userId' | 'catId' | 'content' | 'source'>,
): boolean {
  return (
    msg.userId === 'scheduler' &&
    (msg.catId === 'system' || msg.catId === null) &&
    msg.source?.connector === 'scheduler' &&
    msg.content.startsWith('[定时任务]')
  );
}

/**
 * Per-user thread history queries should still include trusted system messages
 * (scheduler reminders) and cat/agent responses, otherwise a page refresh
 * hides them even though they were persisted and shown in realtime.
 *
 * Cat/agent messages are thread-scoped, not user-scoped — the userId on them
 * records "who triggered this invocation", not "who authored the content".
 * Scheduler-triggered agent responses have userId='default-user' (no session
 * on MCP callback), so the exact-match filter would exclude them for any
 * real logged-in user.
 */
export function matchesThreadHistoryUserScope(
  msg: Pick<StoredMessage, 'userId' | 'catId'>,
  userId?: string,
): boolean {
  if (!userId) return true;
  if (msg.userId === userId) return true;
  if (isSystemUserMessage(msg)) return true;
  // Agent/cat responses belong to the thread, not to the triggering user.
  // Guard: only non-system userIds — prevents forged userId='scheduler'+catId bypass.
  if (msg.catId && msg.catId !== 'system' && !SYSTEM_USER_IDS.has(msg.userId)) return true;
  return false;
}

/** Who is viewing */
export type Viewer = { readonly type: 'user' } | { readonly type: 'cat'; readonly catId: CatId };

/**
 * Check if a message is visible to the given viewer.
 *
 * Rules:
 * - User (用户) always sees everything
 * - Public messages (visibility undefined or 'public') are visible to all
 * - Revealed whispers (revealedAt set) are visible to all
 * - Unrevealed whispers are only visible to recipients listed in whisperTo
 */
export function canViewMessage(msg: StoredMessage, viewer: Viewer): boolean {
  if (viewer.type === 'user') return true;

  if (!msg.visibility || msg.visibility === 'public') return true;

  if (msg.visibility === 'whisper') {
    if (msg.revealedAt) return true;
    return msg.whisperTo?.includes(viewer.catId) ?? false;
  }

  return false;
}
