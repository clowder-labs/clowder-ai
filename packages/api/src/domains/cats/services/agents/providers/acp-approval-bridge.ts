/**
 * ACP Approval Center Bridge (审批中心 ACP 桥接)
 *
 * 将 ACP agent 的 session/request_permission RPC 委托给中心 ApprovalManager。
 * 由 handleACPControlMessage() 在处理权限请求时调用。
 *
 * 集成方式 (在 ACPAgentService.ts handleACPControlMessage 中):
 * ```typescript
 * // 在 selectPermissionOptionId 之前:
 * const centralResult = await checkCentralApproval(catId, threadId, params, approvalManager);
 * if (centralResult) {
 *   const optionId = centralResult === 'granted'
 *     ? options.find(o => o.kind === 'allow_once')?.optionId
 *     : options.find(o => o.kind === 'reject')?.optionId;
 *   // ... send result with optionId
 * }
 * ```
 */

import type { CatId } from '@cat-cafe/shared';
import type { ApprovalManager } from '../../approval/ApprovalManager.js';

/**
 * 检查中心审批策略 — ACP agent 发出的 session/request_permission
 * @returns 'granted' | 'denied' | 'suspended' | null (null = 中心不可用，回退本地)
 */
export async function checkCentralApproval(
  catId: CatId,
  threadId: string,
  userId: string,
  invocationId: string,
  params: Record<string, unknown>,
  approvalManager: ApprovalManager | undefined,
): Promise<'granted' | 'denied' | 'suspended' | null> {
  if (!approvalManager) return null;

  const toolCall = params.toolCall && typeof params.toolCall === 'object'
    ? (params.toolCall as Record<string, unknown>)
    : null;

  const toolName = typeof toolCall?.title === 'string' ? toolCall.title : 'acp_permission';
  const reason = typeof params.reason === 'string' ? params.reason : `ACP permission: ${toolName}`;

  try {
    const result = await approvalManager.requestApproval({
      invocationId,
      catId,
      threadId,
      userId,
      toolName,
      toolArgs: toolCall ?? {},
      reason,
    });
    return result.status;
  } catch {
    // 中心不可用 → 回退本地策略
    return null;
  }
}
