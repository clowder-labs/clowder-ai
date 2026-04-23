# PR 407 Change Log

## Scope

This document summarizes the non-doc changes made while addressing the PR 407 review feedback for the OfficeClaw de-cat migration.

The guiding rules for this follow-up are:

- do not modify `docs/` historical content as part of the de-cat rollout
- remove incorrect legacy compatibility rewrites introduced by the migration
- continue de-cat cleanup for current implementation names where the old `cat-cafe` branding no longer belongs

## Review-Driven Fixes

### 1. Reverted `docs/` from this migration scope

The prior commit changed a large amount of historical documentation under `docs/`.
Those changes are intentionally excluded from this PR follow-up and were reverted to the pre-migration baseline.

### 2. Removed broken legacy migration rewrites

Several places had been mechanically rewritten from old `cat-cafe` names to `office-claw`, which broke the original migration intent.

Fixed items include:

- removed `cat-cafe` capability migration logic that had become self-mapping and incorrect
- removed old skill storage migration code and tests
- removed the old cleanup script for `cat-cafe` runtime state
- removed remaining runtime env compatibility fallbacks in favor of OfficeClaw-only names

## Current Implementation De-Cat Cleanup

### 1. RelayClaw MCP naming cleanup

Renamed the RelayClaw MCP helper module and related symbols from `catcafe` terminology to `office-claw` terminology.

Examples:

- `relayclaw-catcafe-mcp.ts` -> `relayclaw-office-claw-mcp.ts`
- `buildCatCafeMcpRequestConfig` -> `buildOfficeClawMcpRequestConfig`
- related env helper and constant names updated accordingly

### 2. API config module renames

Renamed the major config modules under `packages/api/src/config`:

- `cat-config-loader.ts` -> `office-claw-config-loader.ts`
- `cat-catalog-store.ts` -> `office-claw-catalog-store.ts`
- `cat-models.ts` -> `office-claw-models.ts`
- `cat-voices.ts` -> `office-claw-voices.ts`
- `cat-budgets.ts` -> `office-claw-budgets.ts`
- `cat-account-binding.ts` -> `office-claw-account-binding.ts`
- `runtime-cat-catalog.ts` -> `runtime-office-claw-catalog.ts`

All affected imports in API source and tests were updated.

### 3. Shared OfficeClaw aliases introduced and adopted

Introduced OfficeClaw-first shared aliases and started switching API code to them:

- `OfficeClawConfig`
- `OfficeClawConfigV1`
- `OfficeClawConfigV2`
- `OfficeClawConfigEntry`
- `OFFICE_CLAW_CONFIGS`
- `officeClawRegistry`
- `OfficeClawRegistry`

Only OfficeClaw naming remains in the config/auth/env paths touched by this PR.

### 4. MCP server and utility cleanup

Cleaned remaining implementation-side `CatCafe` naming in:

- MCP server path helpers
- RelayClaw skills helpers
- capability route local variable names
- various runtime and governance helper names

### 5. Frontend debug/global naming cleanup

Renamed old debug globals to OfficeClaw naming:

- `__catCafeDebug` -> `__officeClawDebug`
- `__catCafeCloseLoggerAttached` -> `__officeClawCloseLoggerAttached`

Associated tests were updated.

### 6. Packaging/runtime env naming cleanup

Updated macOS launcher env names from old `CAT_CAFE_*` runtime flags to `OFFICE_CLAW_*` equivalents where the new names already existed in runtime scripts.

## Deleted Files

- `packages/api/src/domains/cats/services/skillhub/SkillStorageMigration.ts`
- `packages/api/test/skill-storage-migration.test.js`
- `packages/api/src/domains/cats/services/agents/providers/relayclaw-catcafe-mcp.ts`

## New Files

- `packages/api/src/config/office-claw-config-loader.ts`
- `packages/api/src/config/office-claw-catalog-store.ts`
- `packages/api/src/config/office-claw-models.ts`
- `packages/api/src/config/office-claw-voices.ts`
- `packages/api/src/config/office-claw-budgets.ts`
- `packages/api/src/config/office-claw-account-binding.ts`
- `packages/api/src/config/runtime-office-claw-catalog.ts`
- `packages/api/src/domains/cats/services/agents/providers/relayclaw-office-claw-mcp.ts`

## Verification

The API package was rebuilt repeatedly during the rename steps with:

```bash
pnpm --filter @office-claw/api build
```

and was brought back to a passing build state after each config/shared rename batch.
