/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F33 Phase 3: Redis key patterns for session strategy runtime overrides.
 * All keys share the cat-cafe: prefix set by the Redis client.
 */

export const SessionStrategyKeys = {
  /** Per-variant strategy override: session-strategy:override:{catId} */
  override: (catId: string) => `session-strategy:override:${catId}`,
} as const;
