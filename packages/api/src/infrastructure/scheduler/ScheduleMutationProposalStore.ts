import {
  type ApprovalEnvelope,
  type ApprovalPublication,
  assertApprovalEnvelopeIdentity,
  commitApprovalEnvelope,
  type ScheduleMutationAuditEntry,
  type ScheduleMutationEffectCheckpoint,
  type ScheduleMutationProposal,
  type ScheduleMutationTaskDefinition,
} from '@cat-cafe/shared';
import type Database from 'better-sqlite3';
import type { ApprovalPublicationStore } from '../../domains/approval-hub/ports/ApprovalPublicationStore.js';
import {
  type AuditRow,
  deleteDynamicTaskWithAudit,
  fingerprintDynamicTaskDef,
  getDynamicTask,
  getDynamicTaskByIdempotencyKey,
  insertDynamicTask,
  insertDynamicTaskWithAudit,
  insertScheduleMutationAudit,
  type ProposalRow,
  setDynamicTaskEnabledWithAudit,
  toAudit,
  toProposal,
} from './schedule-mutation-storage.js';

export { fingerprintDynamicTaskDef } from './schedule-mutation-storage.js';

export type ScheduleMutationProposalStoreErrorCode =
  | 'SCHEDULE_PROPOSAL_NOT_FOUND'
  | 'SCHEDULE_PROPOSAL_STATE'
  | 'SCHEDULE_TASK_CONFLICT'
  | 'SCHEDULE_TASK_DRIFT';

export class ScheduleMutationProposalStoreError extends Error {
  constructor(
    readonly code: ScheduleMutationProposalStoreErrorCode,
    readonly statusCode: 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = 'ScheduleMutationProposalStoreError';
  }
}

type CreateScheduleMutation = Extract<ScheduleMutationProposal['mutation'], { kind: 'create' }>;
type CreateScheduleMutationProposal = ScheduleMutationProposal & { mutation: CreateScheduleMutation };
type CreateProposalIdempotencyLookup =
  | { kind: 'match'; proposal: CreateScheduleMutationProposal }
  | { kind: 'conflict'; proposal: CreateScheduleMutationProposal };
type ApplyCreateResult =
  | { outcome: 'ok'; applied: boolean; task: ScheduleMutationTaskDefinition }
  | { outcome: 'conflict'; taskId: string };

function materializeCreateTask(mutation: CreateScheduleMutation, appliedAt: number): ScheduleMutationTaskDefinition {
  const delayMs = mutation.relativeOnceDelayMs;
  if (delayMs === undefined) return mutation.task;
  const fireAt = appliedAt + delayMs;
  if (mutation.task.trigger.type !== 'once' || !Number.isFinite(delayMs) || delayMs < 0 || !Number.isFinite(fireAt)) {
    throw new ScheduleMutationProposalStoreError(
      'SCHEDULE_PROPOSAL_STATE',
      409,
      'Relative once schedule proposal has an invalid delay or trigger',
    );
  }
  return { ...mutation.task, trigger: { type: 'once', fireAt } };
}

export class ScheduleMutationProposalStore implements ApprovalPublicationStore {
  constructor(private readonly db: Database.Database) {}

  create(proposal: ScheduleMutationProposal): void {
    if (proposal.status !== 'pending' || proposal.publication.state !== 'staged' || proposal.effectCheckpoint) {
      throw new ScheduleMutationProposalStoreError(
        'SCHEDULE_PROPOSAL_STATE',
        409,
        'New schedule mutation proposal must be pending, staged and effect-free',
      );
    }
    this.db
      .prepare(
        `INSERT INTO schedule_mutation_proposals
          (proposal_id, owner_user_id, requester_cat_id, mutation_kind, mutation_json, status,
           publication_json, effect_checkpoint_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      )
      .run(
        proposal.proposalId,
        proposal.ownerUserId,
        proposal.requesterCatId,
        proposal.mutation.kind,
        JSON.stringify(proposal.mutation),
        proposal.status,
        JSON.stringify(proposal.publication),
        proposal.createdAt,
      );
  }

  getById(proposalId: string): ScheduleMutationProposal | null {
    const row = this.getRow(proposalId);
    return row ? toProposal(row) : null;
  }

  listPending(ownerUserId: string): ScheduleMutationProposal[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM schedule_mutation_proposals
           WHERE owner_user_id = ? AND status IN ('pending', 'applying')
           ORDER BY created_at ASC`,
        )
        .all(ownerUserId) as ProposalRow[]
    ).map(toProposal);
  }

  findUnsettledCreateByIdempotencyKey(
    ownerUserId: string,
    requesterCatId: string,
    idempotencyKey: string,
    idempotencyFingerprint: string,
  ): CreateProposalIdempotencyLookup | null {
    let conflictingProposal: CreateScheduleMutationProposal | null = null;
    for (const proposal of this.listPending(ownerUserId)) {
      if (proposal.requesterCatId !== requesterCatId) continue;
      if (proposal.mutation.kind !== 'create') continue;
      const createProposal = proposal as CreateScheduleMutationProposal;
      const task = proposal.mutation.task;
      if (task.idempotencyKey !== idempotencyKey) continue;
      if (task.idempotencyFingerprint === idempotencyFingerprint) {
        return { kind: 'match', proposal: createProposal };
      }
      conflictingProposal ??= createProposal;
    }
    return conflictingProposal ? { kind: 'conflict', proposal: conflictingProposal } : null;
  }

  listSettledByUser(ownerUserId: string, limit = 50): ScheduleMutationProposal[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM schedule_mutation_proposals
           WHERE owner_user_id = ? AND status IN ('approved', 'rejected')
           ORDER BY COALESCE(approved_at, rejected_at, created_at) DESC
           LIMIT ?`,
        )
        .all(ownerUserId, limit) as ProposalRow[]
    ).map(toProposal);
  }

  getPublication(proposalId: string): ApprovalPublication | null {
    return this.getById(proposalId)?.publication ?? null;
  }

  commitEnvelope(proposalId: string, envelope: ApprovalEnvelope): void {
    this.db.transaction(() => {
      const proposal = this.requireProposal(proposalId);
      assertApprovalEnvelopeIdentity(envelope, {
        canonicalProposalId: proposal.proposalId,
        sourceFeatureId: 'F139',
        ownerUserId: proposal.ownerUserId,
        requesterCatId: proposal.requesterCatId,
        createdAt: proposal.createdAt,
      });
      const publication = commitApprovalEnvelope(proposal.publication, envelope);
      this.updatePublication(proposalId, publication);
    })();
  }

  abortStaged(proposalId: string, reason: string): void {
    this.db.transaction(() => {
      const proposal = this.requireProposal(proposalId);
      if (proposal.publication.state === 'tombstoned') return;
      if (proposal.publication.state !== 'staged') {
        throw new ScheduleMutationProposalStoreError(
          'SCHEDULE_PROPOSAL_STATE',
          409,
          `Approval publication is ${proposal.publication.state}, not staged`,
        );
      }
      this.updatePublication(proposalId, { state: 'tombstoned', failedAt: Date.now(), reason });
    })();
  }

  claimForApproval(proposalId: string, claimedAt: number): ScheduleMutationProposal | null {
    const result = this.db
      .prepare(
        `UPDATE schedule_mutation_proposals SET status = 'applying', claimed_at = ?
         WHERE proposal_id = ? AND status = 'pending'`,
      )
      .run(claimedAt, proposalId);
    return result.changes === 1 ? this.getById(proposalId) : null;
  }

  rollbackApproval(proposalId: string): boolean {
    return (
      this.db
        .prepare(
          `UPDATE schedule_mutation_proposals SET status = 'pending', claimed_at = NULL
           WHERE proposal_id = ? AND status = 'applying'`,
        )
        .run(proposalId).changes === 1
    );
  }

  finalizeApproved(proposalId: string, approvedBy: string, approvedAt: number): ScheduleMutationProposal | null {
    const result = this.db
      .prepare(
        `UPDATE schedule_mutation_proposals
         SET status = 'approved', approved_by = ?, approved_at = ?
         WHERE proposal_id = ? AND status = 'applying' AND effect_checkpoint_json IS NOT NULL`,
      )
      .run(approvedBy, approvedAt, proposalId);
    return result.changes === 1 ? this.getById(proposalId) : null;
  }

  reject(
    proposalId: string,
    rejectedBy: string,
    rejectionReason: string,
    rejectedAt: number,
  ): ScheduleMutationProposal | null {
    const result = this.db
      .prepare(
        `UPDATE schedule_mutation_proposals
         SET status = 'rejected', rejected_by = ?, rejected_at = ?, rejection_reason = ?
         WHERE proposal_id = ? AND status = 'pending'`,
      )
      .run(rejectedBy, rejectedAt, rejectionReason, proposalId);
    return result.changes === 1 ? this.getById(proposalId) : null;
  }

  applyCreateEffect(proposalId: string, appliedAt: number): { applied: boolean; task: ScheduleMutationTaskDefinition } {
    const result = this.db.transaction(() => {
      const proposal = this.requireApplying(proposalId, 'create');
      const mutation = proposal.mutation.kind === 'create' ? proposal.mutation : unreachableMutation();
      if (proposal.effectCheckpoint) {
        if (proposal.effectCheckpoint.kind !== 'create') {
          throw new ScheduleMutationProposalStoreError(
            'SCHEDULE_PROPOSAL_STATE',
            409,
            `Schedule mutation proposal ${proposalId} has a non-create checkpoint`,
          );
        }
        const persistedTask = getDynamicTask(this.db, proposal.effectCheckpoint.taskId);
        if (!persistedTask) {
          throw new ScheduleMutationProposalStoreError(
            'SCHEDULE_PROPOSAL_STATE',
            409,
            `Dynamic task ${proposal.effectCheckpoint.taskId} is missing after its create checkpoint`,
          );
        }
        return { outcome: 'ok' as const, applied: false, task: persistedTask };
      }
      const task = materializeCreateTask(mutation, appliedAt);
      const existingResult = this.resolveExistingCreateTask(proposalId, task);
      if (existingResult) {
        if (existingResult.outcome === 'ok') {
          this.writeCheckpoint(proposalId, { kind: 'create', taskId: existingResult.task.id, appliedAt });
        }
        return existingResult;
      }

      insertDynamicTask(this.db, task);
      this.writeCheckpoint(proposalId, { kind: 'create', taskId: task.id, appliedAt });
      return { outcome: 'ok' as const, applied: true, task };
    })();
    if (result.outcome === 'conflict') {
      throw new ScheduleMutationProposalStoreError(
        'SCHEDULE_TASK_CONFLICT',
        409,
        `Dynamic task ${result.taskId} conflicts with the approved create payload`,
      );
    }
    return { applied: result.applied, task: result.task };
  }

  applyDeleteEffect(proposalId: string, deletedAt: number): { applied: boolean; task: ScheduleMutationTaskDefinition } {
    const result = this.db.transaction(() => {
      const proposal = this.requireApplying(proposalId, 'delete');
      const mutation = proposal.mutation.kind === 'delete' ? proposal.mutation : unreachableMutation();
      if (proposal.effectCheckpoint) {
        return { outcome: 'ok' as const, applied: false, task: mutation.taskSnapshot };
      }
      const current = getDynamicTask(this.db, mutation.taskId);
      if (!current || fingerprintDynamicTaskDef(current) !== mutation.expectedFingerprint) {
        this.rollbackApproval(proposalId);
        return { outcome: 'drift' as const, taskId: mutation.taskId };
      }
      this.db.prepare('DELETE FROM dynamic_task_defs WHERE id = ?').run(mutation.taskId);
      this.writeCheckpoint(proposalId, {
        kind: 'delete',
        taskId: mutation.taskId,
        expectedFingerprint: mutation.expectedFingerprint,
        deletedAt,
      });
      return { outcome: 'ok' as const, applied: true, task: mutation.taskSnapshot };
    })();
    if (result.outcome === 'drift') {
      throw new ScheduleMutationProposalStoreError(
        'SCHEDULE_TASK_DRIFT',
        409,
        `Dynamic task ${result.taskId} no longer matches the delete proposal`,
      );
    }
    return { applied: result.applied, task: result.task };
  }

  insertTaskWithAudit(task: ScheduleMutationTaskDefinition, audit: ScheduleMutationAuditEntry): void {
    insertDynamicTaskWithAudit(this.db, task, audit);
  }

  deleteTaskWithAudit(taskId: string, audit: ScheduleMutationAuditEntry): boolean {
    return deleteDynamicTaskWithAudit(this.db, taskId, audit);
  }

  setTaskEnabledWithAudit(taskId: string, enabled: boolean, audit: ScheduleMutationAuditEntry): boolean {
    return setDynamicTaskEnabledWithAudit(this.db, taskId, enabled, audit);
  }

  appendAudit(entry: ScheduleMutationAuditEntry): void {
    insertScheduleMutationAudit(this.db, entry);
  }

  listAudit(ownerUserId: string): ScheduleMutationAuditEntry[] {
    return (
      this.db
        .prepare('SELECT * FROM schedule_mutation_audit WHERE owner_user_id = ? ORDER BY created_at ASC')
        .all(ownerUserId) as AuditRow[]
    ).map(toAudit);
  }

  private requireProposal(proposalId: string): ScheduleMutationProposal {
    const proposal = this.getById(proposalId);
    if (!proposal) {
      throw new ScheduleMutationProposalStoreError(
        'SCHEDULE_PROPOSAL_NOT_FOUND',
        404,
        `Schedule mutation proposal ${proposalId} not found`,
      );
    }
    return proposal;
  }

  private requireApplying(proposalId: string, kind: 'create' | 'delete'): ScheduleMutationProposal {
    const proposal = this.requireProposal(proposalId);
    if (proposal.status !== 'applying' || proposal.mutation.kind !== kind) {
      throw new ScheduleMutationProposalStoreError(
        'SCHEDULE_PROPOSAL_STATE',
        409,
        `Schedule mutation proposal ${proposalId} is not applying ${kind}`,
      );
    }
    return proposal;
  }

  private resolveExistingCreateTask(
    proposalId: string,
    task: ScheduleMutationTaskDefinition,
  ): ApplyCreateResult | null {
    const existing = getDynamicTask(this.db, task.id);
    if (existing) {
      if (fingerprintDynamicTaskDef(existing) !== fingerprintDynamicTaskDef(task)) {
        this.rollbackApproval(proposalId);
        return { outcome: 'conflict', taskId: task.id };
      }
      return { outcome: 'ok', applied: false, task: existing };
    }

    if (!task.idempotencyKey) return null;
    const existingByIdempotencyKey = getDynamicTaskByIdempotencyKey(this.db, task.idempotencyKey);
    if (!existingByIdempotencyKey) return null;
    if (
      !task.idempotencyFingerprint ||
      existingByIdempotencyKey.idempotencyFingerprint !== task.idempotencyFingerprint
    ) {
      this.rollbackApproval(proposalId);
      return { outcome: 'conflict', taskId: existingByIdempotencyKey.id };
    }
    return { outcome: 'ok', applied: false, task: existingByIdempotencyKey };
  }

  private getRow(proposalId: string): ProposalRow | undefined {
    return this.db.prepare('SELECT * FROM schedule_mutation_proposals WHERE proposal_id = ?').get(proposalId) as
      | ProposalRow
      | undefined;
  }

  private updatePublication(proposalId: string, publication: ApprovalPublication): void {
    this.db
      .prepare('UPDATE schedule_mutation_proposals SET publication_json = ? WHERE proposal_id = ?')
      .run(JSON.stringify(publication), proposalId);
  }

  private writeCheckpoint(proposalId: string, checkpoint: ScheduleMutationEffectCheckpoint): void {
    this.db
      .prepare('UPDATE schedule_mutation_proposals SET effect_checkpoint_json = ? WHERE proposal_id = ?')
      .run(JSON.stringify(checkpoint), proposalId);
  }
}

function unreachableMutation(): never {
  throw new Error('Schedule mutation kind invariant violated');
}
