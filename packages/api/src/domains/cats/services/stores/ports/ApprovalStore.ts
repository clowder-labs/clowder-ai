/**
 * Approval Store
 * 审批请求持久化 — 工具调用风险审批的完整生命周期记录
 *
 * 只存可序列化的 ApprovalRequest，不存运行时回调。
 */

import type {
  ApprovalDecision,
  ApprovalRequest,
  ApprovalStatus,
  ApproverSpec,
  CatId,
  ToolRiskLevel,
} from '@cat-cafe/shared';
import { generateSortableId } from './MessageStore.js';

export interface CreateApprovalInput {
  readonly invocationId: string;
  readonly catId: CatId;
  readonly threadId: string;
  readonly userId: string;
  readonly toolName: string;
  readonly toolArgs: Record<string, unknown>;
  readonly policyId: string;
  readonly riskLevel: ToolRiskLevel;
  readonly reason: string;
  readonly context?: string;
  readonly currentApproverSpec: ApproverSpec;
  readonly expiresAt: number;
}

/** 可更新的审批字段子集 */
export type ApprovalPatch = Partial<
  Pick<
    ApprovalRequest,
    | 'status'
    | 'escalationTier'
    | 'currentApproverSpec'
    | 'updatedAt'
    | 'notifiedChannels'
    | 'suspendedSessionId'
    | 'suspendedCliSessionId'
  >
>;

/** 通用查询过滤器 */
export interface ApprovalListFilter {
  readonly status?: ApprovalStatus;
  readonly threadId?: string;
  readonly catId?: CatId;
  readonly limit?: number;
}

export interface IApprovalStore {
  /** 创建审批请求 */
  create(input: CreateApprovalInput): ApprovalRequest | Promise<ApprovalRequest>;
  /** 按 ID 获取审批请求 */
  get(requestId: string): ApprovalRequest | null | Promise<ApprovalRequest | null>;
  /** 部分更新审批请求 */
  update(requestId: string, patch: ApprovalPatch): ApprovalRequest | null | Promise<ApprovalRequest | null>;
  /** 追加审批决策记录 */
  addDecision(
    requestId: string,
    decision: ApprovalDecision,
  ): ApprovalRequest | null | Promise<ApprovalRequest | null>;
  /** 列出待审批请求 (可按 threadId 过滤) */
  listPending(threadId?: string): ApprovalRequest[] | Promise<ApprovalRequest[]>;
  /** 按状态列出审批请求 */
  listByStatus(status: ApprovalStatus): ApprovalRequest[] | Promise<ApprovalRequest[]>;
  /** 通用查询 — 按 status/threadId/catId 过滤 */
  listByQuery(filter: ApprovalListFilter): ApprovalRequest[] | Promise<ApprovalRequest[]>;
}

const DEFAULT_MAX = 2000;

export class ApprovalStore implements IApprovalStore {
  private records = new Map<string, ApprovalRequest>();
  private readonly maxRecords: number;

  constructor(options?: { maxRecords?: number }) {
    this.maxRecords = options?.maxRecords ?? DEFAULT_MAX;
  }

  create(input: CreateApprovalInput): ApprovalRequest {
    this.evictIfFull();

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
    this.records.set(record.id, record);
    return record;
  }

  get(requestId: string): ApprovalRequest | null {
    return this.records.get(requestId) ?? null;
  }

  update(requestId: string, patch: ApprovalPatch): ApprovalRequest | null {
    const existing = this.records.get(requestId);
    if (!existing) return null;

    const updated: ApprovalRequest = {
      ...existing,
      ...patch,
      updatedAt: patch.updatedAt ?? Date.now(),
    };
    this.records.set(requestId, updated);
    return updated;
  }

  addDecision(requestId: string, decision: ApprovalDecision): ApprovalRequest | null {
    const existing = this.records.get(requestId);
    if (!existing) return null;

    const updated: ApprovalRequest = {
      ...existing,
      decisions: [...existing.decisions, decision],
      updatedAt: Date.now(),
    };
    this.records.set(requestId, updated);
    return updated;
  }

  listPending(threadId?: string): ApprovalRequest[] {
    const result: ApprovalRequest[] = [];
    for (const rec of this.records.values()) {
      if (rec.status !== 'pending' && rec.status !== 'escalated') continue;
      if (threadId && rec.threadId !== threadId) continue;
      result.push(rec);
    }
    return result.sort((a, b) => a.createdAt - b.createdAt);
  }

  listByStatus(status: ApprovalStatus): ApprovalRequest[] {
    const result: ApprovalRequest[] = [];
    for (const rec of this.records.values()) {
      if (rec.status !== status) continue;
      result.push(rec);
    }
    return result.sort((a, b) => a.createdAt - b.createdAt);
  }

  listByQuery(filter: ApprovalListFilter): ApprovalRequest[] {
    const result: ApprovalRequest[] = [];
    for (const rec of this.records.values()) {
      if (filter.status && rec.status !== filter.status) continue;
      if (filter.threadId && rec.threadId !== filter.threadId) continue;
      if (filter.catId && rec.catId !== filter.catId) continue;
      result.push(rec);
    }
    const sorted = result.sort((a, b) => b.createdAt - a.createdAt);
    const limit = filter.limit ?? 100;
    return sorted.slice(0, limit);
  }

  get size(): number {
    return this.records.size;
  }

  private evictIfFull(): void {
    if (this.records.size < this.maxRecords) return;

    // Evict oldest non-pending first, then oldest pending
    let evicted = false;
    for (const [id, rec] of this.records) {
      if (rec.status !== 'pending' && rec.status !== 'escalated') {
        this.records.delete(id);
        evicted = true;
        break;
      }
    }
    if (!evicted) {
      const firstKey = this.records.keys().next().value;
      if (firstKey) this.records.delete(firstKey);
    }
  }
}
