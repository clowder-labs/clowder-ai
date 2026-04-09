/**
 * Approval Center Management Routes — 审批中心前端/管理接口
 * 安全: X-Cat-Cafe-User header（兼容 legacy x-user-id）
 */

import type { ApprovalStatus, CatId, RespondScope } from '@cat-cafe/shared';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ApprovalManager } from '../domains/cats/services/approval/ApprovalManager.js';
import type { IApprovalStore } from '../domains/cats/services/stores/ports/ApprovalStore.js';
import type { IToolPolicyStore } from '../domains/cats/services/stores/ports/ToolPolicyStore.js';
import type { ApprovalChannelGateway } from '../domains/cats/services/approval/ApprovalChannelGateway.js';
import type { SocketManager } from '../infrastructure/websocket/index.js';

export interface ApprovalCenterRoutesOptions {
  approvalManager: ApprovalManager;
  approvalStore: IApprovalStore;
  policyStore: IToolPolicyStore;
  socketManager: SocketManager;
  channelGateway?: ApprovalChannelGateway;
}

function resolveAuthorizationUserId(request: {
  headers: Record<string, string | string[] | undefined>;
}): string | null {
  const fromPrimary = request.headers['x-cat-cafe-user'];
  if (typeof fromPrimary === 'string' && fromPrimary.trim().length > 0) return fromPrimary.trim();
  if (Array.isArray(fromPrimary) && typeof fromPrimary[0] === 'string' && fromPrimary[0].trim().length > 0) {
    return fromPrimary[0].trim();
  }
  const fromLegacy = request.headers['x-user-id'];
  if (typeof fromLegacy === 'string' && fromLegacy.trim().length > 0) return fromLegacy.trim();
  if (Array.isArray(fromLegacy) && typeof fromLegacy[0] === 'string' && fromLegacy[0].trim().length > 0) {
    return fromLegacy[0].trim();
  }
  return null;
}

// ── Zod 校验 ──

const respondSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(['approve', 'deny']),
  scope: z.enum(['once', 'thread', 'global']),
  reason: z.string().max(1000).optional(),
});

const createPolicySchema = z.object({
  toolPattern: z.string().min(1).max(200),
  riskLevel: z.enum(['safe', 'elevated', 'dangerous', 'critical']),
  requiresApproval: z.boolean(),
  scope: z.enum(['global', 'project', 'thread']),
  scopeId: z.string().optional(),
  priority: z.number().int().min(0).max(9999),
  enabled: z.boolean(),
  condition: z.object({
    field: z.string().min(1),
    operator: z.enum(['gt', 'lt', 'eq', 'neq', 'contains', 'matches']),
    value: z.union([z.string(), z.number()]),
    effect: z.enum(['require', 'exempt']),
  }).optional(),
  approverSpec: z.object({
    userIds: z.array(z.string()).optional(),
    roles: z.array(z.string()).optional(),
    agentIds: z.array(z.string()).optional(),
    minApprovals: z.number().int().min(1).optional(),
  }).optional(),
  timeoutMs: z.number().int().positive().optional(),
});

const updatePolicySchema = createPolicySchema.partial();

const webhookPayloadSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(['approve', 'deny']),
  decidedBy: z.string().min(1),
  reason: z.string().max(1000).optional(),
  scope: z.enum(['once', 'thread', 'global']).default('once'),
});

// ── 路由注册 ──

export const approvalCenterRoutes: FastifyPluginAsync<ApprovalCenterRoutesOptions> = async (app, opts) => {
  const { approvalManager, approvalStore, policyStore, socketManager, channelGateway } = opts;

  // POST /api/approval/respond — 审批人（人类或 Agent）做出决策
  app.post('/api/approval/respond', async (request, reply) => {
    const userId = resolveAuthorizationUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Cat-Cafe-User header)' };
    }

    const parseResult = respondSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Invalid request body', details: parseResult.error.issues };
    }

    const { requestId, decision, scope, reason } = parseResult.data;
    const updated = await approvalManager.respondToApproval(requestId, {
      decidedBy: userId,
      decidedByType: 'human',
      decision,
      scope: scope as RespondScope,
      decidedAt: Date.now(),
      ...(reason ? { reason } : {}),
    });

    if (!updated) {
      reply.status(404);
      return { error: 'Request not found or already resolved' };
    }

    socketManager.broadcastToRoom(`thread:${updated.threadId}`, 'approval:response', {
      requestId,
      decision,
      scope,
      ...(reason ? { reason } : {}),
    });

    return { status: 'ok', record: updated };
  });

  // GET /api/approval/requests — 列出审批请求（按 status/threadId/catId 过滤）
  app.get('/api/approval/requests', async (request, reply) => {
    const userId = resolveAuthorizationUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Cat-Cafe-User header)' };
    }

    const query = request.query as Record<string, string>;
    const records = await approvalStore.listByQuery({
      ...(query.status ? { status: query.status as ApprovalStatus } : {}),
      ...(query.threadId ? { threadId: query.threadId } : {}),
      ...(query.catId ? { catId: query.catId as CatId } : {}),
      ...(query.limit ? { limit: parseInt(query.limit, 10) } : {}),
    });
    return { requests: records };
  });

  // GET /api/approval/requests/:id — 获取单条审批详情
  app.get('/api/approval/requests/:id', async (request, reply) => {
    const userId = resolveAuthorizationUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Cat-Cafe-User header)' };
    }

    const { id } = request.params as { id: string };
    const record = await approvalManager.getRequest(id);
    if (!record) {
      reply.status(404);
      return { error: 'Approval request not found' };
    }
    return { request: record };
  });

  // PATCH /api/approval/requests/:id/cancel — 取消待审批请求
  app.patch('/api/approval/requests/:id/cancel', async (request, reply) => {
    const userId = resolveAuthorizationUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Cat-Cafe-User header)' };
    }

    const { id } = request.params as { id: string };
    const canceled = await approvalManager.cancel(id);
    if (!canceled) {
      reply.status(404);
      return { error: 'Request not found or not cancelable' };
    }

    socketManager.broadcastToRoom(`thread:${canceled.threadId}`, 'approval:response', {
      requestId: id,
      decision: 'canceled',
    });

    return { status: 'ok', record: canceled };
  });

  // GET /api/approval/policies — 列出工具策略
  app.get('/api/approval/policies', async (request, reply) => {
    const userId = resolveAuthorizationUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Cat-Cafe-User header)' };
    }

    const policies = await policyStore.listAll();
    return { policies };
  });

  // POST /api/approval/policies — 创建工具策略
  app.post('/api/approval/policies', async (request, reply) => {
    const userId = resolveAuthorizationUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Cat-Cafe-User header)' };
    }

    const parseResult = createPolicySchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Invalid request body', details: parseResult.error.issues };
    }

    const policy = await policyStore.add({ ...parseResult.data, createdBy: userId });
    return { status: 'ok', policy };
  });

  // PUT /api/approval/policies/:id — 更新工具策略
  app.put('/api/approval/policies/:id', async (request, reply) => {
    const userId = resolveAuthorizationUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Cat-Cafe-User header)' };
    }

    const { id } = request.params as { id: string };
    const parseResult = updatePolicySchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Invalid request body', details: parseResult.error.issues };
    }

    const updated = await policyStore.update(id, parseResult.data);
    if (!updated) {
      reply.status(404);
      return { error: 'Policy not found' };
    }
    return { status: 'ok', policy: updated };
  });

  // DELETE /api/approval/policies/:id — 删除工具策略
  app.delete('/api/approval/policies/:id', async (request, reply) => {
    const userId = resolveAuthorizationUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Cat-Cafe-User header)' };
    }

    const { id } = request.params as { id: string };
    const removed = await policyStore.remove(id);
    if (!removed) {
      reply.status(404);
      return { error: 'Policy not found' };
    }
    return { status: 'ok' };
  });

  // POST /api/approval/webhook/:channelId — 外部 OA 系统回调入口
  // 通过 channelGateway 进行签名验证 + 解析，不直接处理 payload
  app.post('/api/approval/webhook/:channelId', async (request, reply) => {
    const { channelId } = request.params as { channelId: string };
    if (!channelId) {
      reply.status(400);
      return { error: 'Missing channelId' };
    }

    // Prefer channel gateway for verification + parsing
    if (channelGateway) {
      const headers = request.headers as Record<string, string>;
      const rawBody = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      const result = channelGateway.handleInboundResponse(channelId, request.body, headers, rawBody);

      if ('error' in result) {
        reply.status(400);
        return { error: result.error };
      }

      const updated = await approvalManager.respondToApproval(result.requestId, result.decision);
      if (!updated) {
        reply.status(404);
        return { error: 'Request not found or already resolved' };
      }

      socketManager.broadcastToRoom(`thread:${updated.threadId}`, 'approval:response', {
        requestId: result.requestId,
        decision: result.decision.decision,
        scope: result.decision.scope,
      });
      return { status: 'ok' };
    }

    // Fallback: direct parsing (backward compat when no gateway configured)
    const parseResult = webhookPayloadSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400);
      return { error: 'Invalid webhook payload', details: parseResult.error.issues };
    }

    const { requestId, decision, decidedBy, reason, scope } = parseResult.data;
    const updated = await approvalManager.respondToApproval(requestId, {
      decidedBy,
      decidedByType: 'human',
      decision,
      scope: scope as RespondScope,
      decidedAt: Date.now(),
      ...(reason ? { reason } : {}),
    });

    if (!updated) {
      reply.status(404);
      return { error: 'Request not found or already resolved' };
    }

    socketManager.broadcastToRoom(`thread:${updated.threadId}`, 'approval:response', {
      requestId, decision, scope, ...(reason ? { reason } : {}),
    });
    return { status: 'ok' };
  });

  // POST /api/approval/test-request — 测试用: 模拟创建审批请求 (仅 SKIP_AUTH 模式)
  app.post('/api/approval/test-request', async (request, reply) => {
    if (process.env['CAT_CAFE_SKIP_AUTH'] !== '1') {
      reply.status(403);
      return { error: 'Test endpoint only available in SKIP_AUTH mode' };
    }
    const userId = resolveAuthorizationUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required' };
    }
    const body = request.body as Record<string, unknown>;
    const toolName = typeof body.toolName === 'string' ? body.toolName : 'write_file';
    const reason = typeof body.reason === 'string' ? body.reason : `Test: agent requests ${toolName}`;
    const threadId = typeof body.threadId === 'string' ? body.threadId : 'default';
    const catId = (typeof body.catId === 'string' ? body.catId : 'office') as CatId;
    const toolArgs = (body.toolArgs && typeof body.toolArgs === 'object' ? body.toolArgs : {}) as Record<string, unknown>;

    const result = await approvalManager.requestApproval({
      invocationId: `test-${Date.now()}`,
      catId,
      threadId,
      userId,
      toolName,
      toolArgs,
      reason,
    });
    return result;
  });

  // GET /api/approval/audit — 审批审计日志（复用 approvalStore 查询）
  app.get('/api/approval/audit', async (request, reply) => {
    const userId = resolveAuthorizationUserId(request);
    if (!userId) {
      reply.status(401);
      return { error: 'Identity required (X-Cat-Cafe-User header)' };
    }

    const query = request.query as Record<string, string>;
    // 审计查询只返回已终态的审批记录（approved/denied/expired/canceled/executed/exec_failed）
    const records = await approvalStore.listByQuery({
      ...(query.status ? { status: query.status as ApprovalStatus } : {}),
      ...(query.threadId ? { threadId: query.threadId } : {}),
      ...(query.catId ? { catId: query.catId as CatId } : {}),
      ...(query.limit ? { limit: parseInt(query.limit, 10) } : {}),
    });
    return { entries: records };
  });
};
