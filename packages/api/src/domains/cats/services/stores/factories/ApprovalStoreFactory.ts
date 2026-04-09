/**
 * Approval Store Factory
 * REDIS_URL 有值 → RedisApprovalStore
 * 无 → ApprovalStore (内存)
 */

import type { RedisClient } from '@cat-cafe/shared/utils';
import type { IApprovalStore } from '../ports/ApprovalStore.js';
import { ApprovalStore } from '../ports/ApprovalStore.js';
import { RedisApprovalStore } from '../redis/RedisApprovalStore.js';

export function createApprovalStore(redis?: RedisClient): IApprovalStore {
  if (redis) {
    return new RedisApprovalStore(redis);
  }
  return new ApprovalStore();
}
