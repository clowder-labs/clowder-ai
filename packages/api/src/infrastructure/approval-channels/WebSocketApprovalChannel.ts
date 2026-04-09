/**
 * WebSocket Approval Channel (内置 WebSocket 审批渠道)
 *
 * 通过 SocketManager 将审批请求推送到前端，实时通知铲屎官。
 * 这是第一个也是最基础的审批渠道 — 无需外部 OA 系统。
 */

import type { ApprovalDecision, ApprovalRequest } from '@cat-cafe/shared';
import type { Server as SocketIOServer } from 'socket.io';
import type { IApprovalChannel } from '../../domains/cats/services/approval/ApprovalChannelGateway.js';

export class WebSocketApprovalChannel implements IApprovalChannel {
  readonly id = 'websocket-builtin';
  readonly type = 'websocket' as const;

  constructor(private readonly io: SocketIOServer) {}

  async sendApprovalRequest(request: ApprovalRequest): Promise<{ delivered: boolean }> {
    this.io.to(`thread:${request.threadId}`).emit('approval:request', {
      requestId: request.id,
      catId: request.catId,
      threadId: request.threadId,
      toolName: request.toolName,
      riskLevel: request.riskLevel,
      reason: request.reason,
      ...(request.context ? { context: request.context } : {}),
      createdAt: request.createdAt,
    });
    return { delivered: true };
  }

  async sendApprovalResult(request: ApprovalRequest, decision: ApprovalDecision): Promise<void> {
    this.io.to(`thread:${request.threadId}`).emit('approval:response', {
      requestId: request.id,
      decision: decision.decision,
      scope: decision.scope,
      ...(decision.reason ? { reason: decision.reason } : {}),
    });
  }

  async sendEscalation(request: ApprovalRequest, tier: number): Promise<void> {
    this.io.to(`thread:${request.threadId}`).emit('approval:escalated', {
      requestId: request.id,
      escalationTier: tier,
      catId: request.catId,
      toolName: request.toolName,
      riskLevel: request.riskLevel,
    });
  }
}
