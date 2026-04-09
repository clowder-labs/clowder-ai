/**
 * Approval Center MCP Tools
 * 审批中心工具 — 危险操作的两阶段审批流程
 */

import { z } from 'zod';
import { callbackGet, callbackPost } from './callback-tools.js';
import type { ToolResult } from './file-tools.js';

// ============ Input Schemas ============

export const requestToolExecutionInputSchema = {
  toolName: z.string().min(1).describe('Name of the tool requiring approval (e.g. "bash", "write_file")'),
  toolArgs: z.record(z.unknown()).describe('The original arguments for the tool call'),
  reason: z.string().min(1).max(2000).describe('Why this tool execution is needed'),
  context: z
    .string()
    .max(5000)
    .optional()
    .describe('Optional additional context for the approver (e.g. plan, expected impact)'),
};

export const checkExecutionStatusInputSchema = {
  requestId: z.string().min(1).describe('The requestId returned from a previous request_tool_execution call'),
};

export const respondApprovalInputSchema = {
  requestId: z.string().min(1).describe('The approval request ID to respond to'),
  decision: z.enum(['approve', 'deny']).describe('Approval decision'),
  reason: z.string().max(2000).optional().describe('Optional reason for the decision'),
  scope: z.string().max(500).optional().describe('Optional scope modifier (e.g. "session", "once") for the approval'),
};

// ============ Handlers ============

/** 请求执行一个需要审批的危险工具 */
export async function handleRequestToolExecution(input: {
  toolName: string;
  toolArgs: Record<string, unknown>;
  reason: string;
  context?: string | undefined;
}): Promise<ToolResult> {
  return callbackPost('/api/callbacks/request-tool-execution', {
    toolName: input.toolName,
    toolArgs: input.toolArgs,
    reason: input.reason,
    ...(input.context ? { context: input.context } : {}),
  });
}

/** 轮询审批请求的当前状态 */
export async function handleCheckExecutionStatus(input: { requestId: string }): Promise<ToolResult> {
  return callbackGet('/api/callbacks/check-execution-status', {
    requestId: input.requestId,
  });
}

/** 作为审批者回复审批请求 */
export async function handleRespondApproval(input: {
  requestId: string;
  decision: 'approve' | 'deny';
  reason?: string | undefined;
  scope?: string | undefined;
}): Promise<ToolResult> {
  return callbackPost('/api/approval/respond', {
    requestId: input.requestId,
    decision: input.decision,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.scope ? { scope: input.scope } : {}),
  });
}

// ============ Tool Definitions ============

type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: never) => Promise<unknown>;
};

export const approvalTools: readonly ToolDef[] = [
  {
    name: 'cat_cafe_request_tool_execution',
    description:
      'Request execution of a dangerous tool that requires approval (full two-phase). ' +
      'Returns a requestId to poll with check_execution_status. ' +
      'WORKFLOW: request_tool_execution → poll check_execution_status until approved/denied. ' +
      'Use when gateToolExecution signals that a tool call needs approval.',
    inputSchema: requestToolExecutionInputSchema,
    handler: handleRequestToolExecution as (args: never) => Promise<unknown>,
  },
  {
    name: 'cat_cafe_check_execution_status',
    description:
      'Poll the status of a tool execution approval request. ' +
      'Returns approved/denied/pending. Use the requestId from request_tool_execution.',
    inputSchema: checkExecutionStatusInputSchema,
    handler: handleCheckExecutionStatus as (args: never) => Promise<unknown>,
  },
  {
    name: 'cat_cafe_respond_approval',
    description:
      'Respond to an approval request as an approver agent. ' +
      'Use to approve or deny a pending tool execution request. ' +
      'Optionally specify scope ("session"/"once") and a reason for the decision.',
    inputSchema: respondApprovalInputSchema,
    handler: handleRespondApproval as (args: never) => Promise<unknown>,
  },
] as const;
