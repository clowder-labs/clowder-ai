/**
 * Redis Suspended Session Store
 * Redis-backed 挂起会话存储 — 审批期间保存的执行快照
 *
 * Data structures:
 * - Hash suspended-session:{approvalReqId} — session state
 * - SortedSet suspended-sessions:all — all IDs scored by suspendedAt
 *
 * IMPORTANT: ioredis keyPrefix auto-prefixes ALL commands.
 */

import type { CatId, SuspendedSessionState } from '@cat-cafe/shared';
import type { RedisClient } from '@cat-cafe/shared/utils';
import type { ISuspendedSessionStore } from '../ports/SuspendedSessionStore.js';
import { SuspendedSessionKeys } from '../redis-keys/approval-keys.js';

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const DEFAULT_MAX = 500;

export class RedisSuspendedSessionStore implements ISuspendedSessionStore {
  private readonly redis: RedisClient;
  private readonly ttlSeconds: number | null;
  private readonly maxSessions: number;

  constructor(redis: RedisClient, options?: { ttlSeconds?: number; maxSessions?: number }) {
    this.redis = redis;
    this.maxSessions = options?.maxSessions ?? DEFAULT_MAX;
    const ttl = options?.ttlSeconds;
    if (ttl === undefined) {
      this.ttlSeconds = DEFAULT_TTL_SECONDS;
    } else if (!Number.isFinite(ttl) || ttl <= 0) {
      this.ttlSeconds = null;
    } else {
      this.ttlSeconds = Math.floor(ttl);
    }
  }

  async save(state: SuspendedSessionState): Promise<void> {
    if (!(await this.exists(state.approvalRequestId))) {
      await this.evictIfFull();
    }

    const key = SuspendedSessionKeys.detail(state.approvalRequestId);
    const fields = serializeSession(state);
    const pipeline = this.redis.multi();
    pipeline.hset(key, ...fields);
    if (this.ttlSeconds) pipeline.expire(key, this.ttlSeconds);
    pipeline.zadd(SuspendedSessionKeys.ALL, String(state.suspendedAt), state.approvalRequestId);
    await pipeline.exec();
  }

  async get(approvalRequestId: string): Promise<SuspendedSessionState | null> {
    const data = await this.redis.hgetall(SuspendedSessionKeys.detail(approvalRequestId));
    if (!data || !data.approvalRequestId) return null;
    return hydrateSession(data);
  }

  async remove(approvalRequestId: string): Promise<boolean> {
    const key = SuspendedSessionKeys.detail(approvalRequestId);
    const pipeline = this.redis.multi();
    pipeline.del(key);
    pipeline.zrem(SuspendedSessionKeys.ALL, approvalRequestId);
    const results = await pipeline.exec();
    if (!results) return false;
    const [delResult] = results;
    return delResult?.[1] === 1;
  }

  async listAll(): Promise<SuspendedSessionState[]> {
    const ids = await this.redis.zrange(SuspendedSessionKeys.ALL, 0, -1);
    if (ids.length === 0) return [];

    const pipeline = this.redis.pipeline();
    for (const id of ids) pipeline.hgetall(SuspendedSessionKeys.detail(id));
    const results = await pipeline.exec();
    if (!results) return [];

    const sessions: SuspendedSessionState[] = [];
    for (const [err, data] of results) {
      if (err || !data || typeof data !== 'object') continue;
      const d = data as Record<string, string>;
      if (!d.approvalRequestId) continue;
      sessions.push(hydrateSession(d));
    }
    return sessions.sort((a, b) => a.suspendedAt - b.suspendedAt);
  }

  private async exists(approvalRequestId: string): Promise<boolean> {
    const score = await this.redis.zscore(SuspendedSessionKeys.ALL, approvalRequestId);
    return score !== null;
  }

  private async evictIfFull(): Promise<void> {
    const count = await this.redis.zcard(SuspendedSessionKeys.ALL);
    if (count < this.maxSessions) return;

    const oldest = await this.redis.zrange(SuspendedSessionKeys.ALL, 0, 0);
    if (oldest.length === 0) return;
    const id = oldest[0]!;

    const pipeline = this.redis.pipeline();
    pipeline.del(SuspendedSessionKeys.detail(id));
    pipeline.zrem(SuspendedSessionKeys.ALL, id);
    await pipeline.exec();
  }
}

// ---- Serialization helpers ----

function serializeSession(state: SuspendedSessionState): string[] {
  return [
    'approvalRequestId', state.approvalRequestId,
    'catId', state.catId,
    'threadId', state.threadId,
    'userId', state.userId,
    'cliSessionId', state.cliSessionId,
    'sessionRecordId', state.sessionRecordId,
    'pendingToolCall', JSON.stringify(state.pendingToolCall),
    'invocationSnapshot', JSON.stringify(state.invocationSnapshot),
    'suspendedAt', String(state.suspendedAt),
    'expiresAt', String(state.expiresAt),
  ];
}

function hydrateSession(data: Record<string, string>): SuspendedSessionState {
  return {
    approvalRequestId: data.approvalRequestId!,
    catId: data.catId! as CatId,
    threadId: data.threadId!,
    userId: data.userId!,
    cliSessionId: data.cliSessionId!,
    sessionRecordId: data.sessionRecordId!,
    pendingToolCall: JSON.parse(data.pendingToolCall ?? '{}') as SuspendedSessionState['pendingToolCall'],
    invocationSnapshot: JSON.parse(data.invocationSnapshot ?? '{}') as SuspendedSessionState['invocationSnapshot'],
    suspendedAt: parseInt(data.suspendedAt!, 10),
    expiresAt: parseInt(data.expiresAt!, 10),
  };
}
