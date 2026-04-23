/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F32-b P4d: Resolve breedId for a catName.
 * Tries officeClawRegistry first (dynamic, includes variants), falls back to
 * static OFFICE_CLAW_CONFIGS (always available, no async dependency).
 */
import { OFFICE_CLAW_CONFIGS, officeClawRegistry } from '@office-claw/shared';

export function resolveBreedId(catName: string): string | undefined {
  const entry = officeClawRegistry.tryGet(catName);
  if (entry?.config.breedId) return entry.config.breedId;
  return OFFICE_CLAW_CONFIGS[catName]?.breedId;
}
