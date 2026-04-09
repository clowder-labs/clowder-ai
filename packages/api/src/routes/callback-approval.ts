/**
 * Callback Approval Routes — Agent 请求工具执行审批 + 策略检查 + 状态轮询
 * 安全: invocationId + callbackToken 验证 (同 callback-auth.ts)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ApprovalManager } from '../domains/cats/services/approval/ApprovalManager.js';
import type { ToolPolicyEngine } from '../domains/cats/services/approval/ToolPolicyEngine.js';
import type { InvocationRegistry } from '../domains/cats/services/agents/invocation/InvocationRegistry.js';
import { EXPIRED_CREDENTIALS_ERROR } from './callback-errors.js';

export interface CallbackApprovalRoutesOptions {
  registry: InvocationRegistry;
  approvalManager: ApprovalManager;
  policyEngine: ToolPolicyEngine;
}

// ── Zod 校验 ──

const requestToolExecSchema = z.object({
  invocationId: z.string().min(1),
  callbackToken: z.string().min(1),
  toolName: z.string().min(1).max(200),
  toolArgs: z.record(z.unknown()).default({}),
  reason: z.string().min(1).max(2000),
  context: z.string().max(5000).optional(),
  riskAssessment: z.object({
    level: z.string(),
    explanation: z.string(),
  }).optional(),
  sessionSnapshot: z.object({
    cliSessionId: z.string().min(1),
    sessionRecordId: z.string().min(1),
    callId: z.string().optional(),
  }).optional(),
});

const checkPolicySchema = z.object({
  invocationId: z.string().min(1),
  callbackToken: z.string().min(1),
  toolName: z.string().min(1).max(200),
  toolArgs: z.record(z.unknown()).optional(),
});

const checkStatusSchema = z.object({
  invocationId: z.string().min(1),
  callbackToken: z.string().min(1),
  approvalRequestId: z.string().min(1),
});

// ── 路由注册 ──

export const callbackApprovalRoutes: FastifyPluginAsync<CallbackApprovalRoutesOptions> = async (app, opts) => {
  const { registry, approvalManager, policyEngine } = opts;

  // POST /api/callbacks/request-tool-execution — Agent 请求危险工具执行
  app.post('/api/callbacks/request-tool-execution', async (request, reply) => {
    const parseResult = requestToolExecSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Invalid request body', details: parseResult.error.issues };
    }

    const { invocationId, callbackToken, toolName, toolArgs, reason, context, riskAssessment, sessionSnapshot } =
      parseResult.data;

    const record = registry.verify(invocationId, callbackToken);
    if (!record) {
      reply.status(401);
      return EXPIRED_CREDENTIALS_ERROR;
    }

    const response = await approvalManager.requestApproval({
      invocationId,
      catId: record.catId,
      threadId: record.threadId,
      userId: record.userId,
      toolName,
      toolArgs,
      reason,
      ...(context ? { context } : {}),
      ...(riskAssessment ? { riskAssessment } : {}),
      ...(sessionSnapshot ? { sessionSnapshot } : {}),
    });

    return response;
  });

  // GET /api/callbacks/check-tool-policy — 快速检查工具是否需要审批
  app.get('/api/callbacks/check-tool-policy', async (request, reply) => {
    const parseResult = checkPolicySchema.safeParse(request.query);
    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Missing required query parameters' };
    }

    const { invocationId, callbackToken, toolName, toolArgs } = parseResult.data;
    const record = registry.verify(invocationId, callbackToken);
    if (!record) {
      reply.status(401);
      return EXPIRED_CREDENTIALS_ERROR;
    }

    const policy = await policyEngine.matchPolicy(
      toolName,
      (toolArgs ?? {}) as Record<string, unknown>,
      { catId: record.catId, threadId: record.threadId },
    );

    if (!policy || !policy.requiresApproval) {
      return { requiresApproval: false };
    }

    return {
      requiresApproval: true,
      policyId: policy.id,
      riskLevel: policy.riskLevel,
      timeoutMs: policy.timeoutMs,
    };
  });

  // GET /api/callbacks/check-execution-status — Agent 轮询审批状态
  app.get('/api/callbacks/check-execution-status', async (request, reply) => {
    const parseResult = checkStatusSchema.safeParse(request.query);
    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Missing required query parameters' };
    }

    const { invocationId, callbackToken, approvalRequestId } = parseResult.data;
    const record = registry.verify(invocationId, callbackToken);
    if (!record) {
      reply.status(401);
      return EXPIRED_CREDENTIALS_ERROR;
    }

    const approvalReq = await approvalManager.getRequest(approvalRequestId);
    if (!approvalReq) {
      reply.status(404);
      return { error: 'Approval request not found' };
    }

    // 校验 requestId 归属当前 invocation
    if (
      approvalReq.invocationId !== invocationId ||
      approvalReq.catId !== record.catId ||
      approvalReq.threadId !== record.threadId
    ) {
      reply.status(403);
      return { error: 'Approval request belongs to a different invocation' };
    }

    return {
      approvalRequestId: approvalReq.id,
      status: approvalReq.status,
      toolName: approvalReq.toolName,
      riskLevel: approvalReq.riskLevel,
      createdAt: approvalReq.createdAt,
      expiresAt: approvalReq.expiresAt,
      decisions: approvalReq.decisions.length,
      ...(approvalReq.status === 'approved' || approvalReq.status === 'denied'
        ? { resolvedAt: approvalReq.updatedAt }
        : {}),
    };
  });
};
