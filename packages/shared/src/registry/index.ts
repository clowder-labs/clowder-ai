/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Registry exports
 */

export type { CatRegistryEntry, OfficeClawRegistryEntry } from './CatRegistry.js';
export {
  assertKnownCatId,
  catRegistry,
  CatRegistry,
  officeClawRegistry,
  OfficeClawRegistry,
} from './CatRegistry.js';

export { catIdSchema } from './cat-id-schema.js';
