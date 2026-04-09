/**
 * Redis key patterns for Approval Center stores (policies, requests, sessions, audit).
 * All keys share the cat-cafe: prefix set by the Redis client.
 */

export const ToolPolicyKeys = {
  /** Hash with policy details: tool-policy:{id} */
  detail: (id: string) => `tool-policy:${id}`,
  /** SortedSet of all policy IDs by createdAt: tool-policies:all */
  ALL: 'tool-policies:all',
} as const;

export const ApprovalReqKeys = {
  /** Hash with approval request details: approval-req:{id} */
  detail: (id: string) => `approval-req:${id}`,
  /** SortedSet of all approval request IDs by createdAt: approval-reqs:all */
  ALL: 'approval-reqs:all',
  /** SortedSet of pending approval request IDs by createdAt: approval-reqs:pending */
  PENDING: 'approval-reqs:pending',
  /** SortedSet of approval request IDs for a specific thread */
  BY_THREAD: (threadId: string) => `approval-reqs:thread:${threadId}`,
} as const;

export const SuspendedSessionKeys = {
  /** Hash with suspended session details: suspended-session:{approvalReqId} */
  detail: (approvalReqId: string) => `suspended-session:${approvalReqId}`,
  /** SortedSet of all suspended session IDs by suspendedAt: suspended-sessions:all */
  ALL: 'suspended-sessions:all',
} as const;

export const ApprovalAuditKeys = {
  /** Hash with audit entry details: approval-audit:{id} */
  detail: (id: string) => `approval-audit:${id}`,
  /** SortedSet of all audit entry IDs by createdAt: approval-audit:all */
  ALL: 'approval-audit:all',
} as const;
