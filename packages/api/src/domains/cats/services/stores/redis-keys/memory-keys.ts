/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Redis key patterns for memory store.
 */

/** Memory hash key pattern: cat-cafe:memory:{threadId} */
export function memoryKey(threadId: string): string {
  return `cat-cafe:memory:${threadId}`;
}

/** TTL for memory entries: 30 days */
export const MEMORY_TTL_SECONDS = 30 * 24 * 60 * 60;
