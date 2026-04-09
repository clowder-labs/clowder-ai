/**
 * Approval Center Types (审批中心)
 * 工具调用风险分级 + 多级审批 + 会话挂起恢复
 */

import type { CatId } from './ids.js';
import type { RespondScope } from './authorization.js';

// ---- 风险等级与策略 ----
/** 工具风险等级 */
export type ToolRiskLevel = 'safe' | 'elevated' | 'dangerous' | 'critical';

/** 工具策略条件 — 条件审批时按 JSONPath 匹配参数 */
export interface ToolPolicyCondition {
  /** 工具参数的 JSONPath */
  readonly field: string;
  /** 比较运算符 */
  readonly operator: 'gt' | 'lt' | 'eq' | 'neq' | 'contains' | 'matches';
  /** 匹配值 */
  readonly value: string | number;
  /** 匹配后的效果：require 要求审批 / exempt 豁免审批 */
  readonly effect: 'require' | 'exempt';
}

/** 审批人规格 — 指定谁可以审批 */
export interface ApproverSpec {
  readonly userIds?: readonly string[];
  readonly roles?: readonly string[];
  /** 可审批的 Agent CatId 列表 */
  readonly agentIds?: readonly string[];
  /** 最少审批通过数 */
  readonly minApprovals?: number;
}

/** 升级目标 — 超时后自动升级到更高审批层 */
export interface EscalationTarget {
  /** 升级延迟(毫秒) */
  readonly delayMs: number;
  /** 升级后的审批人规格 */
  readonly approverSpec: ApproverSpec;
  /** 升级通知渠道 ID 列表 */
  readonly channelIds?: readonly string[];
}

/** 工具策略规则 — 控制工具调用是否需要审批 */
export interface ToolPolicy {
  readonly id: string;
  /** 工具名匹配模式 (支持 glob) */
  readonly toolPattern: string;
  readonly riskLevel: ToolRiskLevel;
  readonly requiresApproval: boolean;
  readonly condition?: ToolPolicyCondition;
  readonly approverSpec?: ApproverSpec;
  /** 审批超时(毫秒) */
  readonly timeoutMs?: number;
  readonly escalationChain?: readonly EscalationTarget[];
  /** 策略作用范围 */
  readonly scope: 'global' | 'project' | 'thread';
  /** 范围绑定 ID (project 或 thread ID) */
  readonly scopeId?: string;
  /** 优先级，数字越大优先级越高 */
  readonly priority: number;
  readonly enabled: boolean;
  readonly createdAt: number;
  readonly createdBy: string;
}

// ---- 审批生命周期 ----
/** 审批状态 — 覆盖从创建到执行完成的全生命周期 */
export type ApprovalStatus =
  | 'pending'
  | 'escalated'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'canceled'
  | 'executing'
  | 'executed'
  | 'exec_failed';

/** 单条审批决策记录 */
export interface ApprovalDecision {
  readonly decidedBy: string;
  readonly decidedByType: 'human' | 'agent';
  readonly decision: 'approve' | 'deny';
  readonly reason?: string;
  readonly scope: RespondScope;
  readonly decidedAt: number;
}

/** 审批请求完整记录 (可序列化，存 Redis/SQLite) */
export interface ApprovalRequest {
  readonly id: string;
  readonly invocationId: string;
  readonly catId: CatId;
  readonly threadId: string;
  readonly userId: string;
  readonly toolName: string;
  readonly toolArgs: Readonly<Record<string, unknown>>;
  readonly policyId: string;
  readonly riskLevel: ToolRiskLevel;
  readonly reason: string;
  readonly context?: string;
  readonly status: ApprovalStatus;
  /** 当前升级层级 (0 = 初始) */
  readonly escalationTier: number;
  readonly currentApproverSpec: ApproverSpec;
  readonly decisions: readonly ApprovalDecision[];
  readonly suspendedSessionId?: string;
  readonly suspendedCliSessionId?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly expiresAt: number;
  readonly notifiedChannels: readonly string[];
}

// ---- 会话挂起 ----
/** 挂起的会话状态 — 审批期间保存的执行快照 */
export interface SuspendedSessionState {
  readonly approvalRequestId: string;
  readonly catId: CatId;
  readonly threadId: string;
  readonly userId: string;
  readonly cliSessionId: string;
  readonly sessionRecordId: string;
  /** 等待审批的工具调用 */
  readonly pendingToolCall: {
    readonly toolName: string;
    readonly toolArgs: Readonly<Record<string, unknown>>;
    readonly callId?: string;
  };
  /** 调用快照 — 用于恢复回调 */
  readonly invocationSnapshot: {
    readonly invocationId: string;
    readonly callbackToken: string;
  };
  readonly suspendedAt: number;
  readonly expiresAt: number;
}

// ---- 通知渠道 ----

/** 审批通知渠道类型 */
export type ApprovalChannelType =
  | 'websocket'
  | 'webhook'
  | 'dingtalk'
  | 'feishu'
  | 'wecom'
  | 'email'
  | 'telegram'
  | 'custom';

/** 审批通知渠道配置 */
export interface ApprovalChannelConfig {
  readonly id: string;
  readonly type: ApprovalChannelType;
  readonly name: string;
  readonly enabled: boolean;
  /** 渠道特定配置 */
  readonly config: Readonly<Record<string, unknown>>;
  /** 渠道优先级 */
  readonly priority: number;
  readonly createdAt: number;
}

// ---- API 契约 ----

/** 审批网关返回给猫猫的响应 */
export interface ApprovalResponse {
  readonly status: 'granted' | 'denied' | 'suspended';
  readonly approvalRequestId?: string;
  readonly riskLevel?: ToolRiskLevel;
  /** 预计等待时间(毫秒) */
  readonly expectedWaitMs?: number;
  readonly reason?: string;
}

// ---- WebSocket 事件 ----

/** Server -> Client: 审批请求推送 */
export interface ApprovalRequestEvent {
  readonly requestId: string;
  readonly catId: CatId;
  readonly threadId: string;
  readonly toolName: string;
  readonly riskLevel: ToolRiskLevel;
  readonly reason: string;
  readonly context?: string;
  readonly createdAt: number;
}

/** Client -> Server: 铲屎官/Agent 审批响应 */
export interface ApprovalRespondEvent {
  readonly requestId: string;
  readonly decision: 'approve' | 'deny';
  readonly scope: RespondScope;
  readonly reason?: string;
}
