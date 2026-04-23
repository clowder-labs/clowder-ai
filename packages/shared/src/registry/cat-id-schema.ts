/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Dynamic catId Zod schema — defers validation to request time.
 *
 * Cannot use z.enum() because route modules are imported at startup
 * before the registry is populated. z.string().refine() evaluates
 * the predicate lazily at validation time.
 */

import { z } from 'zod';
import { officeClawRegistry } from './CatRegistry.js';

/**
 * Zod schema for catId fields in route schemas.
 * Returns z.string() refined against the live registry.
 */
export function catIdSchema() {
  return z.string().refine(
    (id) => officeClawRegistry.has(id),
    (id) => ({
      message: `Unknown cat ID: "${id}". Valid: ${officeClawRegistry.getAllIds().join(', ')}`,
    }),
  );
}
