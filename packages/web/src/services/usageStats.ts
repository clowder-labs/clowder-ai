'use client';

import { API_URL } from '@/utils/api-client';
import { getUserId } from '@/utils/userId';

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

export interface UsageStatsDataset {
  threads: Array<{
    id: string;
    title?: string | null;
  }>;
  sessionsByThreadId: Record<
    string,
    Array<{
      id: string;
      updatedAt?: number;
      lastUsage?: {
        inputTokens?: number;
        outputTokens?: number;
        cacheReadTokens?: number;
        costUsd?: number;
      };
    }>
  >;
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

export interface UsageStatsFetchOptions {
  signal?: AbortSignal;
}

const DEFAULT_USAGE_STATS_TIMEOUT_MS = 60 * 60 * 1000;

function resolveUsageStatsCredentials(): RequestCredentials {
  const prodApiUrl = process.env.NEXT_PUBLIC_PROD_API_URL;
  return prodApiUrl && API_URL.includes(prodApiUrl) ? 'include' : 'same-origin';
}

async function fetchUsageStatsResponse(path: string, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_USAGE_STATS_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort(signal?.reason);

  if (signal?.aborted) {
    abortFromCaller();
  } else {
    signal?.addEventListener('abort', abortFromCaller, { once: true });
  }

  try {
    return await fetch(`${API_URL}${path}`, {
      headers: {
        'X-Office-Claw-User': getUserId(),
      },
      signal: controller.signal,
      credentials: resolveUsageStatsCredentials(),
    });
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortFromCaller);
  }
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

export function buildUsageStatsPageFromDataset(
  dataset: UsageStatsDataset,
  query: UsageStatsPageQuery,
  now = Date.now(),
): UsageStatsPageResult {
  const rangeStart = resolveRangeStart(now, query.range);

  const filteredItems = dataset.threads
    .map((thread) => {
      const sessions = dataset.sessionsByThreadId[thread.id] ?? [];
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
    })
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

export async function fetchUsageStatsDataset(options?: UsageStatsFetchOptions): Promise<UsageStatsDataset> {
  const threadsResponse = await fetchUsageStatsResponse('/api/threads', options?.signal);
  if (!threadsResponse.ok) {
    throw new Error(await readApiError(threadsResponse));
  }

  const threads = normalizeThreads(await threadsResponse.json());
  const sessionEntries = await Promise.all(
    threads.map(async (thread) => {
      const sessionsResponse = await fetchUsageStatsResponse(`/api/threads/${thread.id}/sessions`, options?.signal);
      if (!sessionsResponse.ok) {
        throw new Error(await readApiError(sessionsResponse));
      }

      const sessions = normalizeSessions(await sessionsResponse.json());
      return [thread.id, sessions] as const;
    }),
  );

  return {
    threads,
    sessionsByThreadId: Object.fromEntries(sessionEntries),
  };
}

export async function fetchUsageStatsPage(query: UsageStatsPageQuery): Promise<UsageStatsPageResult> {
  const dataset = await fetchUsageStatsDataset();
  return buildUsageStatsPageFromDataset(dataset, query);
}
