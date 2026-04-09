/**
 * Redis Approval Store
 * Redis-backed 审批请求存储 — 工具调用风险审批的完整生命周期
 *
 * Data structures:
 * - Hash approval-req:{id} — request details
 * - SortedSet approval-reqs:all — all IDs scored by createdAt
 * - SortedSet approval-reqs:pending — pending/escalated IDs
 * - SortedSet approval-reqs:thread:{threadId} — per-thread IDs
 *
 * IMPORTANT: ioredis keyPrefix auto-prefixes ALL commands.
 */

import type {
  ApprovalDecision,
  ApprovalRequest,
  ApprovalStatus,
  ApproverSpec,
  CatId,
  ToolRiskLevel,
} from '@cat-cafe/shared';
import type { RedisClient } from '@cat-cafe/shared/utils';
import type { ApprovalListFilter, ApprovalPatch, CreateApprovalInput, IApprovalStore } from '../ports/ApprovalStore.js';
import { generateSortableId } from '../ports/MessageStore.js';
import { ApprovalReqKeys } from '../redis-keys/approval-keys.js';

const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const DEFAULT_MAX = 2000;

/** 待审批状态集合 (pending / escalated) */
const PENDING_STATUSES = new Set<ApprovalStatus>(['pending', 'escalated']);

/**
 * Lua CAS status update: atomically check current status → update fields.
 * KEYS[1] = approval-req:{id} hash
 * KEYS[2] = approval-reqs:pending sorted set
 * ARGV[1] = id (for ZREM/ZADD)
 * ARGV[2] = new status
 * ARGV[3..N] = field/value pairs to HSET
 *
 * Returns 1 on success, 0 if record missing.
 */
const CAS_STATUS_LUA = `
local exists = redis.call('EXISTS', KEYS[1])
if exists == 0 then return 0 end
local fields = {}
for i = 3, #ARGV do
  fields[#fields + 1] = ARGV[i]
end
if #fields > 0 then
  redis.call('HSET', KEYS[1], unpack(fields))
end
local newStatus = ARGV[2]
if newStatus == 'pending' or newStatus == 'escalated' then
  redis.call('ZADD', KEYS[2], redis.call('HGET', KEYS[1], 'createdAt'), ARGV[1])
else
  redis.call('ZREM', KEYS[2], ARGV[1])
end
return 1
`;

export class RedisApprovalStore implements IApprovalStore {
  private readonly redis: RedisClient;
  private readonly ttlSeconds: number | null;
  private readonly maxRecords: number;

  constructor(redis: RedisClient, options?: { ttlSeconds?: number; maxRecords?: number }) {
    this.redis = redis;
    this.maxRecords = options?.maxRecords ?? DEFAULT_MAX;
    const ttl = options?.ttlSeconds;
    if (ttl === undefined) {
      this.ttlSeconds = DEFAULT_TTL_SECONDS;
    } else if (!Number.isFinite(ttl) || ttl <= 0) {
      this.ttlSeconds = null;
    } else {
      this.ttlSeconds = Math.floor(ttl);
    }
  }

  async create(input: CreateApprovalInput): Promise<ApprovalRequest> {
    await this.evictIfFull();

    const now = Date.now();
    const record: ApprovalRequest = {
      id: generateSortableId(now),
      invocationId: input.invocationId,
      catId: input.catId,
      threadId: input.threadId,
      userId: input.userId,
      toolName: input.toolName,
      toolArgs: input.toolArgs,
      policyId: input.policyId,
      riskLevel: input.riskLevel,
      reason: input.reason,
      ...(input.context ? { context: input.context } : {}),
      status: 'pending',
      escalationTier: 0,
      currentApproverSpec: input.currentApproverSpec,
      decisions: [],
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt,
      notifiedChannels: [],
    };

    const key = ApprovalReqKeys.detail(record.id);
    const fields = serializeApproval(record);
    const pipeline = this.redis.multi();
    pipeline.hset(key, ...fields);
    if (this.ttlSeconds) pipeline.expire(key, this.ttlSeconds);
    pipeline.zadd(ApprovalReqKeys.ALL, String(now), record.id);
    pipeline.zadd(ApprovalReqKeys.PENDING, String(now), record.id);
    pipeline.zadd(ApprovalReqKeys.BY_THREAD(input.threadId), String(now), record.id);
    await pipeline.exec();

    return record;
  }

  async get(requestId: string): Promise<ApprovalRequest | null> {
    const data = await this.redis.hgetall(ApprovalReqKeys.detail(requestId));
    if (!data || !data.id) return null;
    return hydrateApproval(data);
  }

  async update(requestId: string, patch: ApprovalPatch): Promise<ApprovalRequest | null> {
    const key = ApprovalReqKeys.detail(requestId);
    const now = Date.now();

    const pairs = buildPatchPairs(patch, now);
    const newStatus = patch.status ?? '';

    if (patch.status) {
      const ok = (await this.redis.eval(
        CAS_STATUS_LUA, 2, key, ApprovalReqKeys.PENDING,
        requestId, newStatus, ...pairs,
      )) as number;
      if (ok === 0) return null;
    } else {
      if (pairs.length === 0) return this.get(requestId);
      await this.redis.hset(key, ...pairs);
    }

    return this.get(requestId);
  }

  async addDecision(requestId: string, decision: ApprovalDecision): Promise<ApprovalRequest | null> {
    const key = ApprovalReqKeys.detail(requestId);
    const existing = await this.redis.hgetall(key);
    if (!existing || !existing.id) return null;

    const prev = existing.decisions ? JSON.parse(existing.decisions) as ApprovalDecision[] : [];
    const updated = [...prev, decision];
    const now = Date.now();

    await this.redis.hset(key, 'decisions', JSON.stringify(updated), 'updatedAt', String(now));
    return this.get(requestId);
  }

  async listPending(threadId?: string): Promise<ApprovalRequest[]> {
    const ids = await this.redis.zrange(ApprovalReqKeys.PENDING, 0, -1);
    if (ids.length === 0) return [];
    return this.fetchAndFilter(ids, (rec) => {
      if (!PENDING_STATUSES.has(rec.status)) return false;
      if (threadId && rec.threadId !== threadId) return false;
      return true;
    });
  }

  async listByStatus(status: ApprovalStatus): Promise<ApprovalRequest[]> {
    // For pending/escalated use the dedicated sorted set
    if (PENDING_STATUSES.has(status)) {
      const ids = await this.redis.zrange(ApprovalReqKeys.PENDING, 0, -1);
      return this.fetchAndFilter(ids, (rec) => rec.status === status);
    }
    // For other statuses, scan from ALL set
    const ids = await this.redis.zrange(ApprovalReqKeys.ALL, 0, -1);
    return this.fetchAndFilter(ids, (rec) => rec.status === status);
  }

  async listByQuery(filter: ApprovalListFilter): Promise<ApprovalRequest[]> {
    // 按 threadId 使用专用 sorted set 缩小范围
    const sourceKey = filter.threadId
      ? ApprovalReqKeys.BY_THREAD(filter.threadId)
      : ApprovalReqKeys.ALL;
    const ids = await this.redis.zrevrange(sourceKey, 0, -1);
    const limit = filter.limit ?? 100;
    const results = await this.fetchAndFilter(ids, (rec) => {
      if (filter.status && rec.status !== filter.status) return false;
      if (filter.threadId && rec.threadId !== filter.threadId) return false;
      if (filter.catId && rec.catId !== filter.catId) return false;
      return true;
    });
    return results.slice(0, limit);
  }

  // ---- helpers ----

  private async fetchAndFilter(
    ids: string[],
    predicate: (rec: ApprovalRequest) => boolean,
  ): Promise<ApprovalRequest[]> {
    if (ids.length === 0) return [];
    const pipeline = this.redis.pipeline();
    for (const id of ids) pipeline.hgetall(ApprovalReqKeys.detail(id));
    const results = await pipeline.exec();
    if (!results) return [];

    const records: ApprovalRequest[] = [];
    for (const [err, data] of results) {
      if (err || !data || typeof data !== 'object') continue;
      const d = data as Record<string, string>;
      if (!d.id) continue;
      const rec = hydrateApproval(d);
      if (predicate(rec)) records.push(rec);
    }
    return records.sort((a, b) => a.createdAt - b.createdAt);
  }

  private async evictIfFull(): Promise<void> {
    const count = await this.redis.zcard(ApprovalReqKeys.ALL);
    if (count < this.maxRecords) return;

    const allIds = await this.redis.zrange(ApprovalReqKeys.ALL, 0, 0);
    if (allIds.length === 0) return;
    const oldest = allIds[0]!;

    const isPending = await this.redis.zscore(ApprovalReqKeys.PENDING, oldest);
    const pipeline = this.redis.pipeline();
    pipeline.del(ApprovalReqKeys.detail(oldest));
    pipeline.zrem(ApprovalReqKeys.ALL, oldest);
    if (isPending !== null) pipeline.zrem(ApprovalReqKeys.PENDING, oldest);
    await pipeline.exec();
  }
}

// ---- Serialization helpers (module-level to keep class lean) ----

function serializeApproval(record: ApprovalRequest): string[] {
  const fields: string[] = [
    'id', record.id,
    'invocationId', record.invocationId,
    'catId', record.catId,
    'threadId', record.threadId,
    'userId', record.userId,
    'toolName', record.toolName,
    'toolArgs', JSON.stringify(record.toolArgs),
    'policyId', record.policyId,
    'riskLevel', record.riskLevel,
    'reason', record.reason,
    'status', record.status,
    'escalationTier', String(record.escalationTier),
    'currentApproverSpec', JSON.stringify(record.currentApproverSpec),
    'decisions', JSON.stringify(record.decisions),
    'createdAt', String(record.createdAt),
    'updatedAt', String(record.updatedAt),
    'expiresAt', String(record.expiresAt),
    'notifiedChannels', JSON.stringify(record.notifiedChannels),
  ];
  if (record.context) fields.push('context', record.context);
  if (record.suspendedSessionId) fields.push('suspendedSessionId', record.suspendedSessionId);
  if (record.suspendedCliSessionId) fields.push('suspendedCliSessionId', record.suspendedCliSessionId);
  return fields;
}

function hydrateApproval(data: Record<string, string>): ApprovalRequest {
  return {
    id: data.id!,
    invocationId: data.invocationId!,
    catId: data.catId! as CatId,
    threadId: data.threadId!,
    userId: data.userId!,
    toolName: data.toolName!,
    toolArgs: JSON.parse(data.toolArgs ?? '{}') as Record<string, unknown>,
    policyId: data.policyId!,
    riskLevel: data.riskLevel! as ToolRiskLevel,
    reason: data.reason!,
    status: data.status! as ApprovalStatus,
    escalationTier: parseInt(data.escalationTier ?? '0', 10),
    currentApproverSpec: JSON.parse(data.currentApproverSpec ?? '{}') as ApproverSpec,
    decisions: JSON.parse(data.decisions ?? '[]') as ApprovalDecision[],
    createdAt: parseInt(data.createdAt!, 10),
    updatedAt: parseInt(data.updatedAt!, 10),
    expiresAt: parseInt(data.expiresAt!, 10),
    notifiedChannels: JSON.parse(data.notifiedChannels ?? '[]') as string[],
    ...(data.context ? { context: data.context } : {}),
    ...(data.suspendedSessionId ? { suspendedSessionId: data.suspendedSessionId } : {}),
    ...(data.suspendedCliSessionId ? { suspendedCliSessionId: data.suspendedCliSessionId } : {}),
  };
}

function buildPatchPairs(patch: ApprovalPatch, now: number): string[] {
  const pairs: string[] = ['updatedAt', String(patch.updatedAt ?? now)];
  if (patch.status) pairs.push('status', patch.status);
  if (patch.escalationTier !== undefined) pairs.push('escalationTier', String(patch.escalationTier));
  if (patch.currentApproverSpec) pairs.push('currentApproverSpec', JSON.stringify(patch.currentApproverSpec));
  if (patch.notifiedChannels) pairs.push('notifiedChannels', JSON.stringify(patch.notifiedChannels));
  if (patch.suspendedSessionId) pairs.push('suspendedSessionId', patch.suspendedSessionId);
  if (patch.suspendedCliSessionId) pairs.push('suspendedCliSessionId', patch.suspendedCliSessionId);
  return pairs;
}
