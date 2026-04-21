/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { RedisClient } from '@clowder/shared/utils';
import type { IWorkflowSopStore } from '../ports/WorkflowSopStore.js';
import { RedisWorkflowSopStore } from '../redis/RedisWorkflowSopStore.js';

export function createWorkflowSopStore(redis?: RedisClient): IWorkflowSopStore | undefined {
  if (!redis) return undefined;
  return new RedisWorkflowSopStore(redis);
}
