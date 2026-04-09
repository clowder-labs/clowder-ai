/**
 * Tool Execution Gate — approval center middleware
 * 工具执行网关 — 对危险工具调用进行策略检查，需要审批时返回暂停信号
 */

import type { ToolResult } from './tools/file-tools.js';
import { successResult } from './tools/file-tools.js';

interface GateCallbackConfig {
  apiUrl: string;
  invocationId: string;
  callbackToken: string;
}

/** 从环境变量读取回调配置；缺失时返回 null（pass-through） */
export function getGateCallbackConfig(): GateCallbackConfig | null {
  const apiUrl = process.env['CAT_CAFE_API_URL'];
  const invocationId = process.env['CAT_CAFE_INVOCATION_ID'];
  const callbackToken = process.env['CAT_CAFE_CALLBACK_TOKEN'];
  if (!apiUrl || !invocationId || !callbackToken) return null;
  return { apiUrl, invocationId, callbackToken };
}

interface PolicyResponse {
  requiresApproval: boolean;
  requestId?: string;
  reason?: string;
}

/** POST 到 check-tool-policy 检查工具是否需要审批 */
async function checkToolPolicy(
  config: GateCallbackConfig,
  toolName: string,
  toolArgs: Record<string, unknown>,
): Promise<PolicyResponse> {
  const response = await fetch(`${config.apiUrl}/api/callbacks/check-tool-policy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invocationId: config.invocationId,
      callbackToken: config.callbackToken,
      toolName,
      toolArgs,
    }),
  });
  if (!response.ok) {
    // On policy-check failure, allow pass-through to avoid blocking agents
    return { requiresApproval: false };
  }
  return (await response.json()) as PolicyResponse;
}

/**
 * Gate tool execution through the approval center.
 * 通过审批中心网关拦截工具执行：
 * - 无环境配置 → 直接执行（pass-through）
 * - 策略检查返回 requiresApproval: false → 直接执行
 * - 策略检查返回 requiresApproval: true → 返回暂停信号
 */
export async function gateToolExecution(
  toolName: string,
  args: Record<string, unknown>,
  handler: (args: never) => Promise<unknown>,
): Promise<ToolResult> {
  const config = getGateCallbackConfig();
  if (!config) {
    return (await handler(args as never)) as ToolResult;
  }

  let policy: PolicyResponse;
  try {
    policy = await checkToolPolicy(config, toolName, args);
  } catch {
    // Network error — fail-open to avoid blocking agents
    return (await handler(args as never)) as ToolResult;
  }

  if (!policy.requiresApproval) {
    return (await handler(args as never)) as ToolResult;
  }

  // Return suspension signal — normal result (NOT isError) telling the LLM to pause
  const suspension = {
    status: 'approval_required',
    toolName,
    requestId: policy.requestId ?? null,
    message:
      `Tool "${toolName}" requires approval before execution. ` +
      'Use cat_cafe_request_tool_execution to submit a formal approval request, ' +
      'then poll cat_cafe_check_execution_status until approved or denied.',
    ...(policy.reason ? { reason: policy.reason } : {}),
  };
  return successResult(JSON.stringify(suspension));
}
