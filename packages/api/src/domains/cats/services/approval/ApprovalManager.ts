/**
 * Approval Manager (审批中心核心)
 * 包装 AuthorizationManager，叠加工具策略引擎 + 长生命周期审批 + 会话挂起恢复
 *
 * 设计原则:
 * - 简单权限走原 AuthorizationManager（兼容）
 * - 策略匹配的工具走 ApprovalStore + ChannelGateway（扩展）
 * - inFlightWaiters 保留为快速审批优化路径
 * - 长审批（OA 流程）完全走 Redis 持久化
 */

import type {
  ApprovalDecision,
  ApprovalRequest,
  ApprovalResponse,
  ApproverSpec,
  CatId,
  RespondScope,
  SuspendedSessionState,
  ToolRiskLevel,
} from '@cat-cafe/shared';
import type { Server as SocketIOServer } from 'socket.io';
import type { AuthorizationManager } from '../auth/AuthorizationManager.js';
import type { IApprovalStore } from '../stores/ports/ApprovalStore.js';
import type { ISuspendedSessionStore } from '../stores/ports/SuspendedSessionStore.js';
import type { ToolPolicyEngine } from './ToolPolicyEngine.js';

// ── 外部依赖接口 ──

/** 通知渠道网关（Phase 3 实现，此处预留接口） */
export interface IApprovalChannelGateway {
  notifyApprovers(request: ApprovalRequest): Promise<string[]>;
  notifyResult(request: ApprovalRequest, decision: ApprovalDecision): Promise<void>;
}

/** 调用队列（用于审批后恢复 agent 会话） */
export interface IResumeQueue {
  enqueueResume(params: {
    threadId: string;
    userId: string;
    catId: CatId;
    content: string;
    toolName: string;
    toolArgs: Readonly<Record<string, unknown>>;
  }): void;
}

// ── 请求审批输入 ──

export interface RequestApprovalInput {
  readonly invocationId: string;
  readonly catId: CatId;
  readonly threadId: string;
  readonly userId: string;
  readonly toolName: string;
  readonly toolArgs: Readonly<Record<string, unknown>>;
  readonly reason: string;
  readonly context?: string;
  readonly riskAssessment?: { readonly level: string; readonly explanation: string };
  /** 会话快照，用于挂起后恢复 */
  readonly sessionSnapshot?: {
    readonly cliSessionId: string;
    readonly sessionRecordId: string;
    readonly callId?: string;
  };
}

// ── 依赖注入 ──

interface ApprovalManagerDeps {
  authManager: AuthorizationManager;
  policyEngine: ToolPolicyEngine;
  approvalStore: IApprovalStore;
  suspendedSessionStore: ISuspendedSessionStore;
  channelGateway?: IApprovalChannelGateway;
  resumeQueue?: IResumeQueue;
  io?: SocketIOServer;
}

// ── 核心 ──

export class ApprovalManager {
  private readonly authManager: AuthorizationManager;
  private readonly policyEngine: ToolPolicyEngine;
  private readonly approvalStore: IApprovalStore;
  private readonly suspendedSessionStore: ISuspendedSessionStore;
  private readonly channelGateway?: IApprovalChannelGateway;
  private readonly resumeQueue?: IResumeQueue;
  private readonly io?: SocketIOServer;

  constructor(deps: ApprovalManagerDeps) {
    this.authManager = deps.authManager;
    this.policyEngine = deps.policyEngine;
    this.approvalStore = deps.approvalStore;
    this.suspendedSessionStore = deps.suspendedSessionStore;
    this.channelGateway = deps.channelGateway;
    this.resumeQueue = deps.resumeQueue;
    if (deps.io) this.io = deps.io;
  }

  /**
   * 中心入口 — 所有 Agent 拦截层最终调此方法
   * 返回: granted（直接执行）| denied（拒绝）| suspended（等待审批）
   */
  async requestApproval(req: RequestApprovalInput): Promise<ApprovalResponse> {
    // 1. 快速路径: 查已有授权规则
    const ruleDecision = await this.authManager.checkRule(req.catId, req.toolName, req.threadId);
    if (ruleDecision === 'allow') return { status: 'granted' };
    if (ruleDecision === 'deny') return { status: 'denied' };

    // 2. 匹配工具策略
    const policy = await this.policyEngine.matchPolicy(
      req.toolName,
      req.toolArgs as Record<string, unknown>,
      { catId: req.catId, threadId: req.threadId },
    );
    if (!policy || !policy.requiresApproval) return { status: 'granted' };

    // 3. 创建审批请求
    const timeoutMs = policy.timeoutMs ?? 86_400_000; // 默认 24 小时
    const approvalReq = await this.approvalStore.create({
      invocationId: req.invocationId,
      catId: req.catId,
      threadId: req.threadId,
      userId: req.userId,
      toolName: req.toolName,
      toolArgs: req.toolArgs as Record<string, unknown>,
      policyId: policy.id,
      riskLevel: policy.riskLevel,
      reason: req.reason,
      ...(req.context ? { context: req.context } : {}),
      currentApproverSpec: policy.approverSpec ?? { minApprovals: 1 },
      expiresAt: Date.now() + timeoutMs,
    });

    // 4. 保存会话快照（审批后恢复用）
    if (req.sessionSnapshot) {
      await this.suspendedSessionStore.save({
        approvalRequestId: approvalReq.id,
        catId: req.catId,
        threadId: req.threadId,
        userId: req.userId,
        cliSessionId: req.sessionSnapshot.cliSessionId,
        sessionRecordId: req.sessionSnapshot.sessionRecordId,
        pendingToolCall: {
          toolName: req.toolName,
          toolArgs: req.toolArgs as Record<string, unknown>,
          ...(req.sessionSnapshot.callId ? { callId: req.sessionSnapshot.callId } : {}),
        },
        invocationSnapshot: {
          invocationId: req.invocationId,
          callbackToken: '', // 不存敏感 token，恢复时重新创建
        },
        suspendedAt: Date.now(),
        expiresAt: Date.now() + timeoutMs,
      });
    }

    // 5. 通知审批人
    let notifiedChannels: string[] = [];
    if (this.channelGateway) {
      notifiedChannels = await this.channelGateway.notifyApprovers(approvalReq);
    }

    // WebSocket 推送
    if (this.io) {
      this.io.to(`thread:${req.threadId}`).emit('approval:request', {
        requestId: approvalReq.id,
        catId: req.catId,
        threadId: req.threadId,
        toolName: req.toolName,
        toolArgs: req.toolArgs,
        riskLevel: policy.riskLevel,
        reason: req.reason,
        ...(req.context ? { context: req.context } : {}),
        createdAt: approvalReq.createdAt,
      });
    }

    // 6. 更新通知记录
    if (notifiedChannels.length > 0) {
      await this.approvalStore.update(approvalReq.id, { notifiedChannels });
    }

    return {
      status: 'suspended',
      approvalRequestId: approvalReq.id,
      riskLevel: policy.riskLevel,
      expectedWaitMs: timeoutMs,
    };
  }

  /**
   * 审批人（人类或 Agent）做出决策
   */
  async respondToApproval(
    requestId: string,
    decision: ApprovalDecision,
  ): Promise<ApprovalRequest | null> {
    const req = await this.approvalStore.get(requestId);
    if (!req) return null;
    if (req.status !== 'pending' && req.status !== 'escalated') return null;

    // 记录决策
    const updated = await this.approvalStore.addDecision(requestId, decision);
    if (!updated) return null;

    if (decision.decision === 'deny') {
      const denied = await this.approvalStore.update(requestId, { status: 'denied' });
      const finalRecord = denied ?? updated;

      if (this.channelGateway) {
        await this.channelGateway.notifyResult(finalRecord, decision);
      }

      this.emitApprovalResponse(finalRecord, decision);
      return finalRecord;
    }

    // 检查法定人数
    const approveCount = updated.decisions.filter((d) => d.decision === 'approve').length;
    const needed = updated.currentApproverSpec.minApprovals ?? 1;

    if (approveCount >= needed) {
      const approved = await this.approvalStore.update(requestId, { status: 'approved' });
      const finalRecord = approved ?? updated;

      // 创建授权规则 — 直接写入 ruleStore（不经过 pendingStore）
      // once → 短暂 thread 规则（60s TTL，用完即焚）
      // thread/global → 持久规则
      const isOnce = decision.scope === 'once';
      const ruleScope: 'thread' | 'global' = isOnce ? 'thread' : decision.scope;
      await this.authManager.addRule({
        catId: finalRecord.catId,
        action: finalRecord.toolName,
        scope: ruleScope,
        decision: 'allow',
        ...(ruleScope === 'thread' ? { threadId: finalRecord.threadId } : {}),
        createdBy: decision.decidedBy,
        reason: decision.reason ?? `Approved: ${finalRecord.toolName}`,
        ...(isOnce ? { ttlSeconds: 60 } : {}),
      });

      // OA 恢复: 通过 InvocationQueue 自动发起新 agent 调用
      await this.resumeSession(finalRecord);

      if (this.channelGateway) {
        await this.channelGateway.notifyResult(finalRecord, decision);
      }

      this.emitApprovalResponse(finalRecord, decision);
      return finalRecord;
    }

    // 还需要更多审批
    return updated;
  }

  /**
   * 升级审批 — 超时后推给更高层审批人
   */
  async escalate(requestId: string): Promise<ApprovalRequest | null> {
    const req = await this.approvalStore.get(requestId);
    if (!req || (req.status !== 'pending' && req.status !== 'escalated')) return null;

    const nextTier = req.escalationTier + 1;
    const updated = await this.approvalStore.update(requestId, {
      status: 'escalated',
      escalationTier: nextTier,
    });

    if (updated && this.channelGateway) {
      await this.channelGateway.notifyApprovers(updated);
    }

    return updated;
  }

  /**
   * 过期审批
   */
  async expire(requestId: string): Promise<ApprovalRequest | null> {
    const req = await this.approvalStore.get(requestId);
    if (!req || (req.status !== 'pending' && req.status !== 'escalated')) return null;

    const updated = await this.approvalStore.update(requestId, { status: 'expired' });

    // 清理挂起会话
    await this.suspendedSessionStore.remove(requestId);

    return updated;
  }

  /**
   * 取消审批
   */
  async cancel(requestId: string): Promise<ApprovalRequest | null> {
    const req = await this.approvalStore.get(requestId);
    if (!req || (req.status !== 'pending' && req.status !== 'escalated')) return null;

    const updated = await this.approvalStore.update(requestId, { status: 'canceled' });
    await this.suspendedSessionStore.remove(requestId);

    return updated;
  }

  /** 查询审批状态 */
  async getRequest(requestId: string): Promise<ApprovalRequest | null> {
    return this.approvalStore.get(requestId);
  }

  /** 列出待处理审批 */
  async listPending(threadId?: string): Promise<ApprovalRequest[]> {
    return this.approvalStore.listPending(threadId);
  }

  // ── 内部方法 ──

  /**
   * OA 模式恢复: 审批通过后自动发起新 agent 调用
   * 不恢复旧 session，而是创建全新调用 + 携带审批上下文
   * 授权规则已在 respondToApproval 中通过 scope 创建，新调用会自动放行
   */
  private async resumeSession(req: ApprovalRequest): Promise<void> {
    if (!this.resumeQueue) return;

    const argsStr = JSON.stringify(req.toolArgs);
    this.resumeQueue.enqueueResume({
      threadId: req.threadId,
      userId: req.userId,
      catId: req.catId,
      content:
        `[APPROVAL_GRANTED] 工具 "${req.toolName}" 已被批准 (审批单 ${req.id})。` +
        `请立即执行该工具，参数: ${argsStr}。` +
        `注意: 此次执行已获授权，无需再次申请审批。`,
      toolName: req.toolName,
      toolArgs: req.toolArgs,
    });

    // 清理挂起记录（如果有）
    await this.suspendedSessionStore.remove(req.id);
  }

  private emitApprovalResponse(req: ApprovalRequest, decision: ApprovalDecision): void {
    if (!this.io) return;
    this.io.to(`thread:${req.threadId}`).emit('approval:response', {
      requestId: req.id,
      decision: decision.decision,
      scope: decision.scope,
      ...(decision.reason ? { reason: decision.reason } : {}),
    });
  }
}
