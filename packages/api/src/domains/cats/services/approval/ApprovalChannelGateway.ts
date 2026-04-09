/**
 * Approval Channel Gateway (审批通知渠道网关)
 * 管理多种审批通知渠道 — WebSocket / Feishu / DingTalk / Webhook / Custom
 *
 * 设计: 组合层，不替换现有 Connector Adapter，而是包装它们
 */

import type { ApprovalChannelConfig, ApprovalChannelType, ApprovalDecision, ApprovalRequest } from '@cat-cafe/shared';

/** 审批通知渠道标准接口 — 所有渠道插件必须实现 */
export interface IApprovalChannel {
  readonly id: string;
  readonly type: ApprovalChannelType;
  /** 发送审批请求通知 */
  sendApprovalRequest(request: ApprovalRequest): Promise<{ delivered: boolean; externalId?: string }>;
  /** 发送审批结果通知 */
  sendApprovalResult(request: ApprovalRequest, decision: ApprovalDecision): Promise<void>;
  /** 发送升级通知 */
  sendEscalation(request: ApprovalRequest, tier: number): Promise<void>;
  /** 解析外部 OA 回调 (webhook 渠道用) */
  parseInboundResponse?(payload: unknown): ApprovalDecision | null;
}

export class ApprovalChannelGateway {
  private channels = new Map<string, IApprovalChannel>();

  registerChannel(channel: IApprovalChannel): void {
    this.channels.set(channel.id, channel);
  }

  unregisterChannel(channelId: string): void {
    this.channels.delete(channelId);
  }

  getChannel(channelId: string): IApprovalChannel | undefined {
    return this.channels.get(channelId);
  }

  /** 按优先级通知所有已注册渠道，best-effort */
  async notifyApprovers(request: ApprovalRequest): Promise<string[]> {
    const notified: string[] = [];
    for (const channel of this.channels.values()) {
      try {
        const result = await channel.sendApprovalRequest(request);
        if (result.delivered) notified.push(channel.id);
      } catch {
        // best-effort — 某个渠道失败不影响其他渠道
      }
    }
    return notified;
  }

  /** 通知审批结果 */
  async notifyResult(request: ApprovalRequest, decision: ApprovalDecision): Promise<void> {
    for (const channel of this.channels.values()) {
      try {
        await channel.sendApprovalResult(request, decision);
      } catch {
        // best-effort
      }
    }
  }

  /** 通知升级 */
  async notifyEscalation(request: ApprovalRequest, tier: number): Promise<void> {
    for (const channel of this.channels.values()) {
      try {
        await channel.sendEscalation(request, tier);
      } catch {
        // best-effort
      }
    }
  }

  /** 处理外部 OA 系统的审批回调 */
  handleInboundResponse(channelId: string, payload: unknown): ApprovalDecision | null {
    const channel = this.channels.get(channelId);
    if (!channel?.parseInboundResponse) return null;
    return channel.parseInboundResponse(payload);
  }

  /** 获取已注册渠道列表 */
  listChannels(): ApprovalChannelConfig[] {
    const result: ApprovalChannelConfig[] = [];
    for (const ch of this.channels.values()) {
      result.push({
        id: ch.id,
        type: ch.type,
        name: ch.id,
        enabled: true,
        config: {},
        priority: 0,
        createdAt: 0,
      });
    }
    return result;
  }
}
