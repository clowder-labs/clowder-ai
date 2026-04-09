/**
 * SuspendedSession Store Factory
 * REDIS_URL 有值 → RedisSuspendedSessionStore
 * 无 → SuspendedSessionStore (内存)
 */

import type { RedisClient } from '@cat-cafe/shared/utils';
import type { ISuspendedSessionStore } from '../ports/SuspendedSessionStore.js';
import { SuspendedSessionStore } from '../ports/SuspendedSessionStore.js';
import { RedisSuspendedSessionStore } from '../redis/RedisSuspendedSessionStore.js';

export function createSuspendedSessionStore(redis?: RedisClient): ISuspendedSessionStore {
  if (redis) {
    return new RedisSuspendedSessionStore(redis);
  }
  return new SuspendedSessionStore();
}
