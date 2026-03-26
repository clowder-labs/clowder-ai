import { resolve } from 'node:path';
import { findMonorepoRoot } from './monorepo-root.js';

export function resolveCatCafeHostRoot(start = process.cwd()): string {
  const configured = process.env.CAT_CAFE_CONFIG_ROOT?.trim();
  if (configured) {
    return resolve(configured);
  }
  return findMonorepoRoot(start);
}
