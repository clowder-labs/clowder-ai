/**
 * Webhook Approval Channel (通用 Webhook 审批渠道)
 *
 * 通过 HTTP POST 将审批请求推送到外部系统，并解析回调响应。
 * 支持自定义 payload 模板 — 可对接任意 OA / 工单 / IM 系统。
 */

import type { ApprovalDecision, ApprovalRequest, RespondScope } from '@cat-cafe/shared';
import type { IApprovalChannel } from '../../domains/cats/services/approval/ApprovalChannelGateway.js';

export interface WebhookChannelConfig {
  /** Webhook 目标 URL */
  readonly url: string;
  /** 可选自定义 headers */
  readonly headers?: Readonly<Record<string, string>>;
  /** 超时(毫秒) */
  readonly timeoutMs?: number;
  /** HMAC secret (用于签名验证入站回调) */
  readonly hmacSecret?: string;
}

export class WebhookApprovalChannel implements IApprovalChannel {
  readonly id: string;
  readonly type = 'webhook' as const;

  constructor(
    id: string,
    private readonly config: WebhookChannelConfig,
  ) {
    this.id = id;
  }

  async sendApprovalRequest(request: ApprovalRequest): Promise<{ delivered: boolean; externalId?: string }> {
    try {
      const resp = await fetch(this.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        body: JSON.stringify({
          event: 'approval_request',
          requestId: request.id,
          catId: request.catId,
          threadId: request.threadId,
          toolName: request.toolName,
          toolArgs: request.toolArgs,
          riskLevel: request.riskLevel,
          reason: request.reason,
          context: request.context,
          createdAt: request.createdAt,
          expiresAt: request.expiresAt,
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000),
      });
      return { delivered: resp.ok };
    } catch {
      return { delivered: false };
    }
  }

  async sendApprovalResult(request: ApprovalRequest, decision: ApprovalDecision): Promise<void> {
    try {
      await fetch(this.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        body: JSON.stringify({
          event: 'approval_result',
          requestId: request.id,
          decision: decision.decision,
          decidedBy: decision.decidedBy,
          reason: decision.reason,
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000),
      });
    } catch {
      // best-effort
    }
  }

  async sendEscalation(request: ApprovalRequest, tier: number): Promise<void> {
    try {
      await fetch(this.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        body: JSON.stringify({
          event: 'approval_escalated',
          requestId: request.id,
          escalationTier: tier,
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000),
      });
    } catch {
      // best-effort
    }
  }

  /**
   * 解析入站 webhook 回调 — 外部 OA 系统通过此回调审批
   *
   * 期望 payload 格式:
   * { "requestId": "...", "decision": "approve"|"deny", "decidedBy": "user@org", "reason"?: "..." }
   */
  parseInboundResponse(payload: unknown): ApprovalDecision | null {
    if (!payload || typeof payload !== 'object') return null;
    const data = payload as Record<string, unknown>;

    const decision = data.decision;
    if (decision !== 'approve' && decision !== 'deny') return null;

    const decidedBy = typeof data.decidedBy === 'string' ? data.decidedBy : 'webhook';
    const reason = typeof data.reason === 'string' ? data.reason : undefined;
    const scope: RespondScope = (data.scope as RespondScope) ?? 'once';

    return {
      decidedBy,
      decidedByType: 'human',
      decision,
      scope,
      decidedAt: Date.now(),
      ...(reason ? { reason } : {}),
    };
  }
}
