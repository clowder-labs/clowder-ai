/**
 * Redis Tool Policy Store
 * Redis-backed 工具策略持久化 — 进程重启后策略不丢失
 *
 * Data structures:
 * - Hash tool-policy:{id} — policy details
 * - SortedSet tool-policies:all — all policy IDs scored by createdAt
 *
 * IMPORTANT: ioredis keyPrefix auto-prefixes ALL commands including eval() KEYS[].
 */

import type { ApproverSpec, EscalationTarget, ToolPolicy, ToolPolicyCondition, ToolRiskLevel } from '@cat-cafe/shared';
import type { RedisClient } from '@cat-cafe/shared/utils';
import type { IToolPolicyStore, ToolPolicyPatch } from '../ports/ToolPolicyStore.js';
import { matchToolPattern } from '../ports/ToolPolicyStore.js';
import { generateSortableId } from '../ports/MessageStore.js';
import { ToolPolicyKeys } from '../redis-keys/approval-keys.js';

const DEFAULT_TTL_SECONDS = 180 * 24 * 60 * 60; // 180 days
const DEFAULT_MAX_POLICIES = 200;

export class RedisToolPolicyStore implements IToolPolicyStore {
  private readonly redis: RedisClient;
  private readonly ttlSeconds: number | null;
  private readonly maxPolicies: number;

  constructor(redis: RedisClient, options?: { ttlSeconds?: number; maxPolicies?: number }) {
    this.redis = redis;
    this.maxPolicies = options?.maxPolicies ?? DEFAULT_MAX_POLICIES;
    const ttl = options?.ttlSeconds;
    if (ttl === undefined) {
      this.ttlSeconds = DEFAULT_TTL_SECONDS;
    } else if (!Number.isFinite(ttl) || ttl <= 0) {
      this.ttlSeconds = null;
    } else {
      this.ttlSeconds = Math.floor(ttl);
    }
  }

  async add(input: Omit<ToolPolicy, 'id' | 'createdAt'>): Promise<ToolPolicy> {
    await this.evictIfFull();

    const now = Date.now();
    const policy: ToolPolicy = {
      ...input,
      id: generateSortableId(now),
      createdAt: now,
    };

    const key = ToolPolicyKeys.detail(policy.id);
    const fields = this.serializePolicy(policy);
    const pipeline = this.redis.multi();
    pipeline.hset(key, ...fields);
    if (this.ttlSeconds) pipeline.expire(key, this.ttlSeconds);
    pipeline.zadd(ToolPolicyKeys.ALL, String(now), policy.id);
    await pipeline.exec();

    return policy;
  }

  async update(policyId: string, patch: ToolPolicyPatch): Promise<ToolPolicy | null> {
    const existing = await this.get(policyId);
    if (!existing) return null;

    const merged: ToolPolicy = { ...existing, ...patch };
    const key = ToolPolicyKeys.detail(policyId);
    const fields = this.serializePolicy(merged);
    await this.redis.hset(key, ...fields);
    return merged;
  }

  async remove(policyId: string): Promise<boolean> {
    const key = ToolPolicyKeys.detail(policyId);
    const deleted = await this.redis.del(key);
    await this.redis.zrem(ToolPolicyKeys.ALL, policyId);
    return deleted > 0;
  }

  async get(policyId: string): Promise<ToolPolicy | null> {
    const data = await this.redis.hgetall(ToolPolicyKeys.detail(policyId));
    if (!data || !data.id) return null;
    return this.hydratePolicy(data);
  }

  async listEnabled(): Promise<ToolPolicy[]> {
    const all = await this.fetchAll();
    return all.filter((p) => p.enabled).sort((a, b) => b.priority - a.priority);
  }

  async listAll(): Promise<ToolPolicy[]> {
    const all = await this.fetchAll();
    return all.sort((a, b) => b.priority - a.priority);
  }

  async matchTool(toolName: string): Promise<ToolPolicy[]> {
    const all = await this.fetchAll();
    return all
      .filter((p) => p.enabled && matchToolPattern(p.toolPattern, toolName))
      .sort((a, b) => b.priority - a.priority);
  }

  // ---- private helpers ----

  private async fetchAll(): Promise<ToolPolicy[]> {
    const ids = await this.redis.zrevrange(ToolPolicyKeys.ALL, 0, -1);
    if (ids.length === 0) return [];

    const pipeline = this.redis.pipeline();
    for (const id of ids) {
      pipeline.hgetall(ToolPolicyKeys.detail(id));
    }
    const results = await pipeline.exec();
    if (!results) return [];

    const policies: ToolPolicy[] = [];
    for (const [err, data] of results) {
      if (err || !data || typeof data !== 'object') continue;
      const record = data as Record<string, string>;
      if (!record.id) continue;
      policies.push(this.hydratePolicy(record));
    }
    return policies;
  }

  private async evictIfFull(): Promise<void> {
    const count = await this.redis.zcard(ToolPolicyKeys.ALL);
    if (count < this.maxPolicies) return;
    const oldest = await this.redis.zrange(ToolPolicyKeys.ALL, 0, 0);
    if (oldest.length > 0) {
      await this.redis.del(ToolPolicyKeys.detail(oldest[0]!));
      await this.redis.zrem(ToolPolicyKeys.ALL, oldest[0]!);
    }
  }

  private serializePolicy(policy: ToolPolicy): string[] {
    const fields: string[] = [
      'id', policy.id,
      'toolPattern', policy.toolPattern,
      'riskLevel', policy.riskLevel,
      'requiresApproval', policy.requiresApproval ? '1' : '0',
      'scope', policy.scope,
      'priority', String(policy.priority),
      'enabled', policy.enabled ? '1' : '0',
      'createdAt', String(policy.createdAt),
      'createdBy', policy.createdBy,
    ];
    if (policy.condition) fields.push('condition', JSON.stringify(policy.condition));
    if (policy.approverSpec) fields.push('approverSpec', JSON.stringify(policy.approverSpec));
    if (policy.timeoutMs !== undefined) fields.push('timeoutMs', String(policy.timeoutMs));
    if (policy.escalationChain) fields.push('escalationChain', JSON.stringify(policy.escalationChain));
    if (policy.scopeId) fields.push('scopeId', policy.scopeId);
    return fields;
  }

  private hydratePolicy(data: Record<string, string>): ToolPolicy {
    return {
      id: data.id!,
      toolPattern: data.toolPattern!,
      riskLevel: data.riskLevel! as ToolRiskLevel,
      requiresApproval: data.requiresApproval === '1',
      scope: data.scope! as 'global' | 'project' | 'thread',
      priority: parseInt(data.priority!, 10),
      enabled: data.enabled === '1',
      createdAt: parseInt(data.createdAt!, 10),
      createdBy: data.createdBy!,
      ...(data.condition ? { condition: JSON.parse(data.condition) as ToolPolicyCondition } : {}),
      ...(data.approverSpec ? { approverSpec: JSON.parse(data.approverSpec) as ApproverSpec } : {}),
      ...(data.timeoutMs ? { timeoutMs: parseInt(data.timeoutMs, 10) } : {}),
      ...(data.escalationChain
        ? { escalationChain: JSON.parse(data.escalationChain) as EscalationTarget[] }
        : {}),
      ...(data.scopeId ? { scopeId: data.scopeId } : {}),
    };
  }
}
