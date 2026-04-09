/**
 * Suspended Session Store
 * 挂起会话持久化 — 审批期间保存的执行快照，按 approvalRequestId 索引
 */

import type { SuspendedSessionState } from '@cat-cafe/shared';

export interface ISuspendedSessionStore {
  /** 保存/更新挂起会话 */
  save(state: SuspendedSessionState): void | Promise<void>;
  /** 按审批请求 ID 获取挂起会话 */
  get(approvalRequestId: string): SuspendedSessionState | null | Promise<SuspendedSessionState | null>;
  /** 移除挂起会话，返回是否存在 */
  remove(approvalRequestId: string): boolean | Promise<boolean>;
  /** 列出所有挂起会话 */
  listAll(): SuspendedSessionState[] | Promise<SuspendedSessionState[]>;
}

const DEFAULT_MAX = 500;

export class SuspendedSessionStore implements ISuspendedSessionStore {
  private sessions = new Map<string, SuspendedSessionState>();
  private readonly maxSessions: number;

  constructor(options?: { maxSessions?: number }) {
    this.maxSessions = options?.maxSessions ?? DEFAULT_MAX;
  }

  save(state: SuspendedSessionState): void {
    if (!this.sessions.has(state.approvalRequestId) && this.sessions.size >= this.maxSessions) {
      // Evict oldest (earliest suspendedAt)
      let oldestKey: string | null = null;
      let oldestAt = Number.POSITIVE_INFINITY;
      for (const [key, s] of this.sessions) {
        if (s.suspendedAt < oldestAt) {
          oldestAt = s.suspendedAt;
          oldestKey = key;
        }
      }
      if (oldestKey) this.sessions.delete(oldestKey);
    }
    this.sessions.set(state.approvalRequestId, state);
  }

  get(approvalRequestId: string): SuspendedSessionState | null {
    return this.sessions.get(approvalRequestId) ?? null;
  }

  remove(approvalRequestId: string): boolean {
    return this.sessions.delete(approvalRequestId);
  }

  listAll(): SuspendedSessionState[] {
    return [...this.sessions.values()].sort((a, b) => a.suspendedAt - b.suspendedAt);
  }

  get size(): number {
    return this.sessions.size;
  }
}
