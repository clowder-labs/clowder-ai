/**
 * Tool Policy Store
 * 持久化工具策略规则 — 审批中心的策略引擎数据层
 *
 * toolPattern 支持 glob 通配: 'git_*' 匹配 'git_commit', '*' 匹配一切
 */

import type { CatId, ToolPolicy } from '@cat-cafe/shared';
import { generateSortableId } from './MessageStore.js';

/** 策略可更新字段子集 */
export type ToolPolicyPatch = Partial<
  Omit<ToolPolicy, 'id' | 'createdAt' | 'createdBy'>
>;

export interface IToolPolicyStore {
  /** 新增策略 */
  add(policy: Omit<ToolPolicy, 'id' | 'createdAt'>): ToolPolicy | Promise<ToolPolicy>;
  /** 部分更新策略 */
  update(policyId: string, patch: ToolPolicyPatch): ToolPolicy | null | Promise<ToolPolicy | null>;
  /** 删除策略 */
  remove(policyId: string): boolean | Promise<boolean>;
  /** 按 ID 获取策略 */
  get(policyId: string): ToolPolicy | null | Promise<ToolPolicy | null>;
  /** 列出所有启用的策略 */
  listEnabled(): ToolPolicy[] | Promise<ToolPolicy[]>;
  /** 列出所有策略（含已禁用） */
  listAll(): ToolPolicy[] | Promise<ToolPolicy[]>;
  /** 匹配工具名 — 返回所有 toolPattern 匹配的策略（按 priority 降序） */
  matchTool(toolName: string): ToolPolicy[] | Promise<ToolPolicy[]>;
}

/** Simple glob-style match: 'git_*' matches 'git_commit' */
export function matchToolPattern(pattern: string, toolName: string): boolean {
  if (pattern === '*') return true;
  if (pattern === toolName) return true;
  if (pattern.endsWith('*')) {
    return toolName.startsWith(pattern.slice(0, -1));
  }
  return false;
}

const DEFAULT_MAX_POLICIES = 200;

export class ToolPolicyStore implements IToolPolicyStore {
  private policies = new Map<string, ToolPolicy>();
  private readonly maxPolicies: number;

  constructor(options?: { maxPolicies?: number }) {
    this.maxPolicies = options?.maxPolicies ?? DEFAULT_MAX_POLICIES;
  }

  add(input: Omit<ToolPolicy, 'id' | 'createdAt'>): ToolPolicy {
    if (this.policies.size >= this.maxPolicies) {
      const firstKey = this.policies.keys().next().value;
      if (firstKey) this.policies.delete(firstKey);
    }
    const policy: ToolPolicy = {
      ...input,
      id: generateSortableId(Date.now()),
      createdAt: Date.now(),
    };
    this.policies.set(policy.id, policy);
    return policy;
  }

  update(policyId: string, patch: ToolPolicyPatch): ToolPolicy | null {
    const existing = this.policies.get(policyId);
    if (!existing) return null;

    const updated: ToolPolicy = { ...existing, ...patch };
    this.policies.set(policyId, updated);
    return updated;
  }

  remove(policyId: string): boolean {
    return this.policies.delete(policyId);
  }

  get(policyId: string): ToolPolicy | null {
    return this.policies.get(policyId) ?? null;
  }

  listEnabled(): ToolPolicy[] {
    const result: ToolPolicy[] = [];
    for (const policy of this.policies.values()) {
      if (policy.enabled) result.push(policy);
    }
    return result.sort((a, b) => b.priority - a.priority);
  }

  listAll(): ToolPolicy[] {
    return [...this.policies.values()].sort((a, b) => b.priority - a.priority);
  }

  matchTool(toolName: string): ToolPolicy[] {
    const matched: ToolPolicy[] = [];
    for (const policy of this.policies.values()) {
      if (policy.enabled && matchToolPattern(policy.toolPattern, toolName)) {
        matched.push(policy);
      }
    }
    return matched.sort((a, b) => b.priority - a.priority);
  }

  get size(): number {
    return this.policies.size;
  }
}
