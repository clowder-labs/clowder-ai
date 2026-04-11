'use client';

import { apiFetch } from '@/utils/api-client';

export type UsageRange = 'today' | '3d' | '7d' | '30d';

interface ThreadSummary {
  id: string;
  title?: string | null;
}

interface SessionSummary {
  id: string;
  updatedAt?: number;
  lastUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    costUsd?: number;
  };
}

export interface UsageStatsItem {
  id: string;
  sessionName: string;
  totalTokensUsed: number | null;
  inputTokensUsed: number | null;
  outputTokensUsed: number | null;
  occurredAt: string;
}

export interface UsageStatsPageResult {
  items: UsageStatsItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface UsageStatsPageQuery {
  page: number;
  pageSize: number;
  range: UsageRange;
}

const RANGE_TO_MS: Record<UsageRange, number> = {
  today: 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
      return payload.error;
    }
    if (typeof payload.detail === 'string' && payload.detail.trim().length > 0) {
      return payload.detail;
    }
  } catch {
    // Ignore JSON parse errors and fallback to generic message.
  }

  return `Server error: ${response.status}`;
}

function normalizeThreads(payload: unknown): ThreadSummary[] {
  if (Array.isArray(payload)) {
    return payload as ThreadSummary[];
  }

  if (payload && typeof payload === 'object' && Array.isArray((payload as { threads?: unknown[] }).threads)) {
    return (payload as { threads: ThreadSummary[] }).threads;
  }

  return [];
}

function normalizeSessions(payload: unknown): SessionSummary[] {
  if (Array.isArray(payload)) {
    return payload as SessionSummary[];
  }

  if (payload && typeof payload === 'object' && Array.isArray((payload as { sessions?: unknown[] }).sessions)) {
    return (payload as { sessions: SessionSummary[] }).sessions;
  }

  return [];
}

function resolveRangeStart(now: number, range: UsageRange): number {
  return now - RANGE_TO_MS[range];
}

function toLocalDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function getThreadTitle(thread: ThreadSummary): string {
  const title = thread.title?.trim();
  return title && title.length > 0 ? title : '未命名对话';
}

function sumSessionTokens(
  sessions: SessionSummary[],
  key: 'inputTokens' | 'outputTokens',
): number | null {
  let total = 0;
  let hasValue = false;

  for (const session of sessions) {
    const value = session.lastUsage?.[key];
    if (typeof value !== 'number') continue;
    total += value;
    hasValue = true;
  }

  return hasValue ? total : null;
}

export async function fetchUsageStatsPage(query: UsageStatsPageQuery): Promise<UsageStatsPageResult> {
  const now = Date.now();
  const rangeStart = resolveRangeStart(now, query.range);

  const threadsResponse = await apiFetch('/api/threads');
  if (!threadsResponse.ok) {
    throw new Error(await readApiError(threadsResponse));
  }

  const threads = normalizeThreads(await threadsResponse.json());

  const rowsWithSortKey = await Promise.all(
    threads.map(async (thread) => {
      const sessionsResponse = await apiFetch(`/api/threads/${thread.id}/sessions`);
      if (!sessionsResponse.ok) {
        throw new Error(await readApiError(sessionsResponse));
      }

      const sessions = normalizeSessions(await sessionsResponse.json());

      const sessionsInRange = sessions.filter((session) => {
        const updatedAt = session.updatedAt;
        return typeof updatedAt === 'number' && updatedAt >= rangeStart && updatedAt <= now;
      });

      const latestSession = sessionsInRange.reduce<SessionSummary | null>((latest, session) => {
        if (latest == null) return session;
        return (session.updatedAt ?? 0) > (latest.updatedAt ?? 0) ? session : latest;
      }, null);

      if (!latestSession || typeof latestSession.updatedAt !== 'number') {
        return null;
      }

      const inputTokensUsed = sumSessionTokens(sessionsInRange, 'inputTokens');
      const outputTokensUsed = sumSessionTokens(sessionsInRange, 'outputTokens');
      const totalTokensUsed =
        inputTokensUsed == null && outputTokensUsed == null
          ? null
          : (inputTokensUsed ?? 0) + (outputTokensUsed ?? 0);

      return {
        sortKey: latestSession.updatedAt,
        item: {
          id: thread.id,
          sessionName: getThreadTitle(thread),
          totalTokensUsed,
          inputTokensUsed,
          outputTokensUsed,
          occurredAt: toLocalDateTime(latestSession.updatedAt),
        } satisfies UsageStatsItem,
      };
    }),
  );

  const filteredItems = rowsWithSortKey
    .filter((entry): entry is { sortKey: number; item: UsageStatsItem } => entry != null)
    .sort((left, right) => right.sortKey - left.sortKey)
    .map((entry) => entry.item);

  const startIndex = Math.max(0, (query.page - 1) * query.pageSize);
  const items = filteredItems.slice(startIndex, startIndex + query.pageSize);

  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total: filteredItems.length,
  };
}
