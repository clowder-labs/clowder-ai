import type { FastifyPluginAsync } from 'fastify';
import type { DynamicTaskDef } from '../infrastructure/scheduler/DynamicTaskStore.js';
import { f255ConfigRequired, isF255ConfigOnlyTemplate } from '../infrastructure/scheduler/f255-template-boundary.js';
import { fingerprintDynamicTaskDef } from '../infrastructure/scheduler/ScheduleMutationProposalStore.js';
import {
  notifyTaskDeleted,
  notifyTaskPaused,
  notifyTaskRegistered,
  notifyTaskResumed,
} from '../infrastructure/scheduler/schedule-notify.js';
import type { TaskDisplayMeta, TaskSpec_P1, TriggerSpec } from '../infrastructure/scheduler/types.js';
import { requireScheduleMutationPrincipal } from './schedule-mutation-principal.js';
import { createScheduleMutationAuditEntry, publishScheduleMutationProposal } from './schedule-mutation-proposal.js';
import {
  deriveScheduleRequestContext,
  f255ManagedTask,
  isF255ManagedTask,
  isVisibleDynamicTaskDef,
  normalizeOnceTrigger,
  normalizeScheduleTargetParam,
  resolveAgentKeyDeliveryThreadScope,
  resolveScopedDeliveryThreadId,
  type ScheduleRoutesOptions,
  toPlainScheduleParams,
} from './schedule-route-support.js';

type ScheduleMutationRoutesOptions = Pick<
  ScheduleRoutesOptions,
  | 'taskRunner'
  | 'dynamicTaskStore'
  | 'templateRegistry'
  | 'packTemplateStore'
  | 'threadStore'
  | 'notifyLifecycle'
  | 'registry'
  | 'ownerUserId'
  | 'scheduleMutationProposalStore'
  | 'approvalIngress'
>;

function normalizeIdempotencyKey(value: unknown): string | null | { error: string } {
  if (value == null) return null;
  if (typeof value !== 'string') return { error: 'idempotencyKey must be a string' };
  const trimmed = value.trim();
  if (!trimmed) return { error: 'idempotencyKey must not be empty' };
  if (trimmed.length > 200) return { error: 'idempotencyKey must be at most 200 characters' };
  return trimmed;
}

function dynamicTaskResponse(def: Pick<DynamicTaskDef, 'id' | 'display' | 'trigger'>) {
  return { id: def.id, ...def.display, trigger: def.trigger };
}

function compareUtf16(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        // Idempotency fingerprints must be byte-stable across host locales.
        .sort(([left], [right]) => compareUtf16(left, right))
        .map(([key, entry]) => [key, canonicalizeJson(entry)]),
    );
  }
  return value;
}

function buildScheduleIdempotencyFingerprint(input: {
  templateId: string;
  trigger: unknown;
  params: Record<string, unknown>;
  display: TaskDisplayMeta;
  deliveryThreadId: string | null;
  actor: { triggerUserId: string; createdBy: string };
}): string {
  return JSON.stringify(canonicalizeJson(input));
}

export const scheduleMutationRoutes: FastifyPluginAsync<ScheduleMutationRoutesOptions> = async (app, opts) => {
  const {
    taskRunner,
    dynamicTaskStore,
    templateRegistry,
    packTemplateStore,
    threadStore,
    notifyLifecycle,
    registry,
    ownerUserId,
    scheduleMutationProposalStore,
    approvalIngress,
  } = opts;

  app.post('/api/schedule/tasks', async (request, reply) => {
    if (!ownerUserId) {
      reply.status(503);
      return { error: 'Schedule mutation owner is not configured' };
    }
    const mutationPrincipal = requireScheduleMutationPrincipal(request, reply, ownerUserId);
    if (!mutationPrincipal) return;
    if (!dynamicTaskStore || !templateRegistry) {
      reply.status(501);
      return { error: 'Dynamic tasks not configured' };
    }
    if (!scheduleMutationProposalStore || !approvalIngress) {
      reply.status(503);
      return { error: 'Schedule mutation approval is not configured' };
    }

    const body = (request.body ?? {}) as {
      templateId?: string;
      trigger?: TriggerSpec;
      params?: Record<string, unknown>;
      display?: { label: string; category: string; description?: string };
      deliveryThreadId?: string;
      idempotencyKey?: unknown;
    };
    if (!body.templateId) {
      reply.status(400);
      return { error: 'Missing templateId' };
    }
    if (isF255ConfigOnlyTemplate(body.templateId, packTemplateStore)) {
      reply.status(409);
      return f255ConfigRequired();
    }
    const template = templateRegistry.get(body.templateId);
    if (!template) {
      reply.status(400);
      return { error: `Unknown template: ${body.templateId}` };
    }

    const requestTrigger = body.trigger ?? template.defaultTrigger;
    let trigger: TriggerSpec;
    const rawOnceTrigger =
      (requestTrigger as Record<string, unknown>).type === 'once' ? (requestTrigger as Record<string, unknown>) : null;
    const relativeOnceDelayMs =
      rawOnceTrigger && typeof rawOnceTrigger.delayMs === 'number' ? rawOnceTrigger.delayMs : undefined;
    if (rawOnceTrigger) {
      const result = normalizeOnceTrigger(rawOnceTrigger);
      if ('error' in result) {
        reply.status(400);
        return { error: result.error };
      }
      trigger = result;
    } else {
      trigger = requestTrigger;
    }
    const rawParams = toPlainScheduleParams(body.params ?? {});
    if (!rawParams) {
      reply.status(400);
      return { error: 'params must be a plain object' };
    }
    const normalizedIdempotencyKey = normalizeIdempotencyKey(body.idempotencyKey);
    if (normalizedIdempotencyKey && typeof normalizedIdempotencyKey !== 'string') {
      reply.status(400);
      return { error: normalizedIdempotencyKey.error };
    }
    const context = deriveScheduleRequestContext(request, {}, rawParams, mutationPrincipal);
    const targetResult = normalizeScheduleTargetParam(context.params);
    if (!targetResult.ok) {
      reply.status(400);
      return targetResult.error;
    }
    const { actor } = context;
    const params = targetResult.params;
    const id = `dyn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const display = body.display
      ? {
          label: body.display.label,
          category: body.display.category as import('../infrastructure/scheduler/types.js').DisplayCategory,
          description: body.display.description,
        }
      : { label: template.label, category: template.category, description: template.description };

    const resolution = await resolveScopedDeliveryThreadId(request.callbackAuth, body, registry);
    if (resolution.code === 'STALE_INVOCATION') {
      reply.status(409);
      return { error: 'Stale callback invocation superseded by a newer invocation', code: 'STALE_INVOCATION' };
    }
    if (request.callbackPrincipal?.kind === 'agent_key' && !resolution.deliveryThreadId) {
      reply.status(400);
      return {
        error:
          'deliveryThreadId is required for agent-key schedule registration because persistent agent-key calls have no invocation thread',
      };
    }
    const agentKeyScope = await resolveAgentKeyDeliveryThreadScope(request, resolution.deliveryThreadId, threadStore);
    if (!agentKeyScope.ok) {
      reply.status(agentKeyScope.statusCode);
      return { error: agentKeyScope.error, ...(agentKeyScope.code ? { code: agentKeyScope.code } : {}) };
    }

    const idempotencyFingerprint =
      normalizedIdempotencyKey == null
        ? null
        : buildScheduleIdempotencyFingerprint({
            templateId: body.templateId,
            trigger: requestTrigger,
            params,
            display,
            deliveryThreadId: resolution.deliveryThreadId,
            actor,
          });

    const ensureRuntimeTaskRegistered = (existing: DynamicTaskDef): void => {
      if (!existing.enabled || taskRunner.getRegisteredTasks().includes(existing.id)) return;
      const existingTemplate = templateRegistry.get(existing.templateId);
      if (!existingTemplate) return;
      const spec = existingTemplate.createSpec(existing.id, {
        trigger: existing.trigger,
        params: existing.params,
        deliveryThreadId: existing.deliveryThreadId,
      });
      spec.display = existing.display;
      taskRunner.registerDynamic(spec, existing.id);
    };

    const replayExistingTask = (existing: DynamicTaskDef, fingerprint: string) => {
      if (existing.idempotencyFingerprint !== fingerprint) {
        reply.status(409);
        return {
          error: 'Idempotency key already belongs to a different schedule registration request',
          code: 'IDEMPOTENCY_CONFLICT',
          task: dynamicTaskResponse(existing),
        };
      }
      ensureRuntimeTaskRegistered(existing);
      return { success: true, idempotent: true, task: dynamicTaskResponse(existing) };
    };

    if (normalizedIdempotencyKey && idempotencyFingerprint) {
      const existing = dynamicTaskStore.getByIdempotencyKey(normalizedIdempotencyKey);
      if (existing) {
        return replayExistingTask(existing, idempotencyFingerprint);
      }
    }

    const def = {
      id,
      templateId: body.templateId,
      trigger,
      params,
      display,
      deliveryThreadId: resolution.deliveryThreadId,
      enabled: true,
      createdBy: actor.createdBy,
      createdAt: new Date().toISOString(),
      idempotencyKey: normalizedIdempotencyKey,
      idempotencyFingerprint,
    };
    if (mutationPrincipal.kind === 'cat') {
      if (normalizedIdempotencyKey && idempotencyFingerprint) {
        const existingProposal = scheduleMutationProposalStore.findUnsettledCreateByIdempotencyKey(
          ownerUserId,
          mutationPrincipal.catId,
          normalizedIdempotencyKey,
          idempotencyFingerprint,
        );
        if (existingProposal) {
          if (existingProposal.kind === 'conflict') {
            reply.status(409);
            return {
              error: 'Idempotency key already belongs to a different schedule registration proposal',
              code: 'IDEMPOTENCY_CONFLICT',
              proposalId: existingProposal.proposal.proposalId,
              task: dynamicTaskResponse(existingProposal.proposal.mutation.task),
            };
          }
          reply.status(202);
          return {
            success: true,
            proposed: true,
            idempotent: true,
            proposalId: existingProposal.proposal.proposalId,
            task: dynamicTaskResponse(existingProposal.proposal.mutation.task),
          };
        }
      }
      const cardThreadId =
        mutationPrincipal.authKind === 'invocation' ? mutationPrincipal.threadId : resolution.deliveryThreadId;
      if (!cardThreadId) {
        reply.status(400);
        return { error: 'Verified source thread is required for a schedule approval proposal' };
      }
      const proposal = await publishScheduleMutationProposal({
        ownerUserId,
        principal: mutationPrincipal,
        mutation: {
          kind: 'create',
          task: def,
          ...(relativeOnceDelayMs === undefined ? {} : { relativeOnceDelayMs }),
        },
        cardThreadId,
        approvalIngress,
        store: scheduleMutationProposalStore,
      });
      reply.status(202);
      return {
        success: true,
        proposed: true,
        proposalId: proposal.proposalId,
        task: dynamicTaskResponse(def),
      };
    }

    const spec = template.createSpec(id, { trigger, params, deliveryThreadId: def.deliveryThreadId });
    spec.display = display;
    const audit = createScheduleMutationAuditEntry(ownerUserId, mutationPrincipal, 'create', id, {
      templateId: def.templateId,
      deliveryThreadId: def.deliveryThreadId,
    });
    try {
      scheduleMutationProposalStore.insertTaskWithAudit(def, audit);
    } catch (err) {
      if (normalizedIdempotencyKey && idempotencyFingerprint) {
        const existing = dynamicTaskStore.getByIdempotencyKey(normalizedIdempotencyKey);
        if (existing) {
          return replayExistingTask(existing, idempotencyFingerprint);
        }
      }
      throw err;
    }
    taskRunner.registerDynamic(spec, id);
    notifyTaskRegistered(notifyLifecycle, def);
    return { success: true, proposed: false, task: dynamicTaskResponse(def) };
  });

  app.delete('/api/schedule/tasks/:id', async (request, reply) => {
    if (!ownerUserId) {
      reply.status(503);
      return { error: 'Schedule mutation owner is not configured' };
    }
    const mutationPrincipal = requireScheduleMutationPrincipal(request, reply, ownerUserId);
    if (!mutationPrincipal) return;
    if (!dynamicTaskStore) {
      reply.status(501);
      return { error: 'Dynamic tasks not configured' };
    }
    if (!scheduleMutationProposalStore || !approvalIngress) {
      reply.status(503);
      return { error: 'Schedule mutation approval is not configured' };
    }

    const { id } = request.params as { id: string };
    const defForNotify = dynamicTaskStore.getById(id);
    if (!isVisibleDynamicTaskDef(defForNotify)) {
      reply.status(404);
      return { error: 'Dynamic task not found' };
    }
    if (isF255ManagedTask(defForNotify)) {
      reply.status(409);
      return f255ManagedTask();
    }
    if (mutationPrincipal.kind === 'cat') {
      const sourceThreadId =
        mutationPrincipal.authKind === 'invocation'
          ? mutationPrincipal.threadId
          : ((request.query as { sourceThreadId?: string }).sourceThreadId ?? null);
      const agentKeyScope = await resolveAgentKeyDeliveryThreadScope(request, sourceThreadId, threadStore);
      if (!agentKeyScope.ok) {
        reply.status(agentKeyScope.statusCode);
        return { error: agentKeyScope.error, ...(agentKeyScope.code ? { code: agentKeyScope.code } : {}) };
      }
      if (!sourceThreadId) {
        reply.status(400);
        return { error: 'Verified sourceThreadId is required for an agent-key schedule delete proposal' };
      }
      const proposal = await publishScheduleMutationProposal({
        ownerUserId,
        principal: mutationPrincipal,
        mutation: {
          kind: 'delete',
          taskId: defForNotify.id,
          expectedFingerprint: fingerprintDynamicTaskDef(defForNotify),
          taskSnapshot: defForNotify,
        },
        cardThreadId: sourceThreadId,
        approvalIngress,
        store: scheduleMutationProposalStore,
      });
      reply.status(202);
      return { success: true, proposed: true, proposalId: proposal.proposalId, taskId: id };
    }

    const audit = createScheduleMutationAuditEntry(ownerUserId, mutationPrincipal, 'delete', id);
    if (!scheduleMutationProposalStore.deleteTaskWithAudit(id, audit)) {
      reply.status(404);
      return { error: 'Dynamic task not found' };
    }
    taskRunner.unregister(id);
    notifyTaskDeleted(notifyLifecycle, defForNotify);
    return { success: true, proposed: false };
  });

  app.patch('/api/schedule/tasks/:id', async (request, reply) => {
    if (!ownerUserId) {
      reply.status(503);
      return { error: 'Schedule mutation owner is not configured' };
    }
    const mutationPrincipal = requireScheduleMutationPrincipal(request, reply, ownerUserId);
    if (!mutationPrincipal) return;
    if (!dynamicTaskStore || !templateRegistry) {
      reply.status(501);
      return { error: 'Dynamic tasks not configured' };
    }
    if (!scheduleMutationProposalStore) {
      reply.status(503);
      return { error: 'Schedule mutation audit is not configured' };
    }

    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { enabled?: boolean };
    if (typeof body.enabled !== 'boolean') {
      reply.status(400);
      return { error: 'Missing enabled field' };
    }
    const defBeforeUpdate = dynamicTaskStore.getById(id);
    if (!isVisibleDynamicTaskDef(defBeforeUpdate)) {
      reply.status(404);
      return { error: 'Dynamic task not found' };
    }
    if (isF255ManagedTask(defBeforeUpdate)) {
      reply.status(409);
      return f255ManagedTask();
    }
    let resumeSpec: TaskSpec_P1 | null = null;
    if (body.enabled) {
      const template = templateRegistry.get(defBeforeUpdate.templateId);
      if (!template) {
        reply.status(500);
        return { error: `Template ${defBeforeUpdate.templateId} not found — task cannot resume` };
      }
      resumeSpec = template.createSpec(defBeforeUpdate.id, {
        trigger: defBeforeUpdate.trigger,
        params: defBeforeUpdate.params,
        deliveryThreadId: defBeforeUpdate.deliveryThreadId,
      });
      resumeSpec.display = defBeforeUpdate.display;
    }

    const audit = createScheduleMutationAuditEntry(
      ownerUserId,
      mutationPrincipal,
      body.enabled ? 'resume' : 'pause',
      id,
    );
    if (!scheduleMutationProposalStore.setTaskEnabledWithAudit(id, body.enabled, audit)) {
      reply.status(404);
      return { error: 'Dynamic task not found' };
    }

    const def = { ...defBeforeUpdate, enabled: body.enabled };
    if (!body.enabled) {
      taskRunner.unregister(id);
      notifyTaskPaused(notifyLifecycle, def);
    } else if (resumeSpec) {
      try {
        taskRunner.registerDynamic(resumeSpec, def.id);
      } catch {
        // Already registered.
      }
      notifyTaskResumed(notifyLifecycle, def);
    }
    return { success: true, enabled: body.enabled };
  });
};
