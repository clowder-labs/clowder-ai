/**
 * Feishu Approval Channel (飞书审批渠道)
 *
 * 实现 IApprovalChannel 接口，对接飞书 OA 审批流程。
 *
 * Phase 1 — 消息卡片审批 (interactive card + card action callback)
 * Phase 2 — 原生审批实例 (external approval via open API)
 *
 * 参考:
 * - 审批集成方案: https://open.feishu.cn/solutions/detail/approval?lang=zh-CN
 * - OA 门户集成: https://open.feishu.cn/solutions/detail/oa
 * - Lark OpenAPI MCP: https://github.com/larksuite/lark-openapi-mcp
 * - Feishu CLI: https://feishu-cli.com/
 */

import type { ApprovalDecision, ApprovalRequest, RespondScope } from '@cat-cafe/shared';
import type { IApprovalChannel } from '../../domains/cats/services/approval/ApprovalChannelGateway.js';

export interface FeishuChannelConfig {
  /** 飞书应用 App ID */
  readonly appId: string;
  /** 飞书应用 App Secret */
  readonly appSecret: string;
  /** 审批定义 Code (用于原生审批实例模式) */
  readonly approvalCode?: string;
  /** Webhook 验证 Token */
  readonly verificationToken: string;
  /** Webhook 加密 Key (payload 解密) */
  readonly encryptKey?: string;
  /** 交互卡片模板 ID */
  readonly cardTemplateId?: string;
  /** Cat Cafe 深链基础 URL (卡片内嵌跳转) */
  readonly catCafeBaseUrl?: string;
}

export class FeishuApprovalChannel implements IApprovalChannel {
  readonly id: string;
  readonly type = 'feishu' as const;

  constructor(
    id: string,
    private readonly config: FeishuChannelConfig,
  ) {
    this.id = id;
  }

  // ── Phase 1: 消息卡片审批 ──

  async sendApprovalRequest(
    _request: ApprovalRequest,
  ): Promise<{ delivered: boolean; externalId?: string }> {
    // TODO: Phase 1 — 发送交互卡片到飞书群/个人
    // 1. 获取 tenant_access_token (POST /open-apis/auth/v3/tenant_access_token/internal)
    // 2. 构建交互卡片 JSON (包含 approve/deny 按钮 + requestId)
    // 3. POST /open-apis/im/v1/messages 发送卡片
    // 4. 返回 { delivered: true, externalId: message_id }
    throw new Error('FeishuApprovalChannel.sendApprovalRequest: not yet implemented');
  }

  async sendApprovalResult(
    _request: ApprovalRequest,
    _decision: ApprovalDecision,
  ): Promise<void> {
    // TODO: 更新飞书卡片状态 (PATCH card content) 或发送结果通知
    throw new Error('FeishuApprovalChannel.sendApprovalResult: not yet implemented');
  }

  async sendEscalation(_request: ApprovalRequest, _tier: number): Promise<void> {
    // TODO: 发送升级卡片到上级审批群
    throw new Error('FeishuApprovalChannel.sendEscalation: not yet implemented');
  }

  // ── 入站回调处理 ──

  /**
   * 验证飞书事件签名
   * 飞书回调验证机制:
   * - URL 验证: challenge 握手 (首次配置)
   * - 事件签名: timestamp + nonce + encrypt_key + body → SHA256
   */
  verifyInboundSignature(
    _headers: Readonly<Record<string, string>>,
    _rawBody: string,
  ): boolean {
    // TODO: 实现飞书签名验证
    // const { timestamp, nonce } = headers;
    // const expected = sha256(timestamp + nonce + this.config.encryptKey + rawBody);
    // return headers['x-lark-signature'] === expected;
    throw new Error('FeishuApprovalChannel.verifyInboundSignature: not yet implemented');
  }

  /**
   * 解析飞书审批回调
   * 支持两种事件:
   * 1. 卡片按钮回调 (card action) — Phase 1
   * 2. 原生审批实例状态变更 (approval_instance) — Phase 2
   */
  parseInboundResponse(payload: unknown): ApprovalDecision | null {
    if (!payload || typeof payload !== 'object') return null;
    const data = payload as Record<string, unknown>;

    // Card action callback: { action: { value: { decision, requestId } }, operator: { open_id } }
    const action = data.action as Record<string, unknown> | undefined;
    if (action?.value && typeof action.value === 'object') {
      const val = action.value as Record<string, unknown>;
      const decision = val.decision;
      if (decision !== 'approve' && decision !== 'deny') return null;
      const openId = ((data.operator as Record<string, unknown>)?.open_id as string) ?? 'feishu-user';
      return {
        decidedBy: `feishu:${openId}`,
        decidedByType: 'human',
        decision,
        scope: 'once' as RespondScope,
        decidedAt: Date.now(),
      };
    }

    // Approval instance callback: { event: { status: 'APPROVED'|'REJECTED', user_id } }
    const event = data.event as Record<string, unknown> | undefined;
    if (event?.status) {
      const status = event.status;
      if (status !== 'APPROVED' && status !== 'REJECTED') return null;
      const userId = typeof event.user_id === 'string' ? event.user_id : 'feishu-user';
      return {
        decidedBy: `feishu:${userId}`,
        decidedByType: 'human',
        decision: status === 'APPROVED' ? 'approve' : 'deny',
        scope: 'once' as RespondScope,
        decidedAt: Date.now(),
      };
    }

    return null;
  }
}
