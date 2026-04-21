/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * @clowder/shared
 * 共享类型和 schemas
 *
 * Note: Redis utils are NOT exported from root to avoid pulling
 * Node-only dependencies into frontend bundles.
 * Import from '@clowder/shared/utils' instead.
 */

// Export registry (CatRegistry, catIdSchema, assertKnownCatId)
export * from './registry/index.js';

// Export all schemas
export * from './schemas/index.js';
// Export shared text helpers
export * from './text-utils.js';
// Export all types
export * from './types/index.js';
// Export agent error transform utilities
export {
  APIG_DAILY_QUOTA_EXHAUSTED_ERROR_CODE,
  getDailyQuotaExhaustedMessage,
  getFriendlyAgentErrorMessage,
  getRateLimitMessage,
  classifyError,
  isDailyQuotaExhaustedError,
  isRateLimitError,
  isSensitiveInputError,
  MODEL_ARTS_RATE_LIMIT_ERROR_CODE,
  MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE,
  type ErrorFallbackKind,
  type ErrorFallbackMetadata,
  type ErrorLike,
} from './agent-error-transform.js';
