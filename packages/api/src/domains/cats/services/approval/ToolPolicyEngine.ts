/**
 * Tool Policy Engine (审批策略引擎)
 * 核心职责：根据工具名 + 参数 + 上下文匹配最高优先级策略
 *
 * 匹配流程:
 * 1. policyStore.matchTool(toolName) → 候选策略列表（已按 priority 降序）
 * 2. 逐条检查 scope 是否匹配当前上下文
 * 3. 若有 condition，检查工具参数是否满足
 * 4. 返回第一条通过的策略（最高优先级）
 */

import type { CatId, ToolPolicy, ToolPolicyCondition } from '@cat-cafe/shared';
import type { IToolPolicyStore } from '../stores/ports/ToolPolicyStore.js';

export interface PolicyMatchContext {
  readonly catId: CatId;
  readonly threadId: string;
  /** 项目 ID（用于 project scope 匹配） */
  readonly projectId?: string;
}

export class ToolPolicyEngine {
  constructor(private readonly policyStore: IToolPolicyStore) {}

  /**
   * 匹配最高优先级策略
   * @returns 匹配的策略 or null（无匹配 = 不需审批）
   */
  async matchPolicy(
    toolName: string,
    toolArgs: Record<string, unknown>,
    context: PolicyMatchContext,
  ): Promise<ToolPolicy | null> {
    const candidates = await this.policyStore.matchTool(toolName);
    if (candidates.length === 0) return null;

    for (const policy of candidates) {
      if (!this.evaluateScope(policy, context)) continue;
      if (policy.condition && !this.evaluateCondition(policy.condition, toolArgs)) continue;
      return policy;
    }
    return null;
  }

  /**
   * 检查策略 scope 是否匹配当前上下文
   * - global: 始终匹配
   * - project: scopeId === projectId
   * - thread: scopeId === threadId
   */
  private evaluateScope(policy: ToolPolicy, context: PolicyMatchContext): boolean {
    switch (policy.scope) {
      case 'global':
        return true;
      case 'project':
        return !!policy.scopeId && policy.scopeId === context.projectId;
      case 'thread':
        return !!policy.scopeId && policy.scopeId === context.threadId;
      default:
        return false;
    }
  }

  /**
   * 评估条件表达式 — 按 dot-path 取工具参数值并比较
   * 支持运算符: gt, lt, eq, neq, contains, matches
   */
  private evaluateCondition(
    condition: ToolPolicyCondition,
    args: Record<string, unknown>,
  ): boolean {
    const actual = getByDotPath(args, condition.field);
    if (actual === undefined) return false;

    const matched = compareValue(actual, condition.operator, condition.value);

    // effect 决定匹配后的含义：require = 条件成立时需要审批, exempt = 豁免
    // 对于 matchPolicy 来说：require → 条件成立=策略命中; exempt → 条件成立=策略跳过
    return condition.effect === 'require' ? matched : !matched;
  }
}

// ---- helpers ----

/** 简单 dot-path 取值: 'a.b.c' → obj.a.b.c */
function getByDotPath(obj: Record<string, unknown>, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = obj;
  for (const seg of segments) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}

/** 按运算符比较实际值与期望值 */
function compareValue(
  actual: unknown,
  operator: ToolPolicyCondition['operator'],
  expected: string | number,
): boolean {
  switch (operator) {
    case 'eq':
      return actual === expected || String(actual) === String(expected);
    case 'neq':
      return actual !== expected && String(actual) !== String(expected);
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'contains':
      return typeof actual === 'string' && actual.includes(String(expected));
    case 'matches': {
      if (typeof actual !== 'string') return false;
      try {
        return new RegExp(String(expected)).test(actual);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}
