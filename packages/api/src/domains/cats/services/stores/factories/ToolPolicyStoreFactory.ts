/**
 * ToolPolicy Store Factory
 * REDIS_URL 有值 → RedisToolPolicyStore
 * 无 → ToolPolicyStore (内存)
 */

import type { RedisClient } from '@cat-cafe/shared/utils';
import type { IToolPolicyStore } from '../ports/ToolPolicyStore.js';
import { ToolPolicyStore } from '../ports/ToolPolicyStore.js';
import { RedisToolPolicyStore } from '../redis/RedisToolPolicyStore.js';

export function createToolPolicyStore(redis?: RedisClient): IToolPolicyStore {
  if (redis) {
    return new RedisToolPolicyStore(redis);
  }
  return new ToolPolicyStore();
}
