# Review Request R3: Node 24 Runtime Guard Coverage

Review-Target-ID: fix-node24-runtime-guard
Branch: fix/node24-runtime-guard
Base: origin/develop
Code Commit: 69a2e402af0b96f5e2def45bfc5dedb2ca942257
Worktree: `/Users/xxx/workspace/AI/cat-cafe-node24-runtime-guard`
Reviewer: `@sol`

## What

R3 addresses Sol R2 findings against `4e37805077826cf1299bfff4486ff0cafb969532`.

- P1 fixed: removed global `.npmrc` `engine-strict=true`, so startup and operational scripts can still reach `scripts/start-entry.mjs` and its Node 24 auto-reexec guard under default Node 22.
- P2 fixed: `scripts/node-runtime-guard.test.mjs` now uses POSIX path helpers for workspace package discovery and guard path construction, matching package.json script text on Windows and Unix.
- Coverage kept: validation entrypoints are still discovered dynamically and must have exact `pre<name>` guards. The test no longer accepts central `engine-strict` as a substitute.

## Why

The original patrol finding is still valid: validation output from this checkout is not trustworthy under Node 22 because the repo requires Node >=24. R2's central `engine-strict` approach closed that gap, but it expanded the blast radius into startup recovery. R3 narrows enforcement back to validation entrypoints while preserving startup semantics.

## Tradeoff

This is more verbose than a global pnpm setting because package-level `test:*` / `check:*` commands need explicit prehooks. The dynamic audit is the guard against future drift: new validation entrypoints fail `node-runtime-guard.test.mjs` until their matching lifecycle hook is added.

## Failure-Mode Sweep

Pattern: a broad package-manager guard fixed validation drift but crossed a runtime boundary.

Sweep result:

- Startup and operational scripts are explicitly classified as non-validation entrypoints in the regression test: `start`, `start:status`, `start:direct`, `dev:direct`.
- Root `check:*` and Redis test wrappers now have explicit guards.
- API `test:*`, finance `build/lint/test`, and web `test:lint-rules` now have explicit guards.
- Path comparison code now stays in POSIX form when comparing against package.json scripts.

## Validation Evidence

```bash
node -v && pnpm -v
# v22.22.3
# 9.15.4

PATH="/opt/homebrew/opt/node@24/bin:$PATH" node --test scripts/node-runtime-guard.test.mjs
# 15 pass / 0 fail / 0 cancelled

pnpm --filter @cat-cafe/finance run lint
# default Node v22.22.3: fails in @cat-cafe/finance prelint via check-validation-node-runtime.mjs before tsc

pnpm --filter @cat-cafe/api run test:public
# default Node v22.22.3: fails in @cat-cafe/api pretest:public via check-validation-node-runtime.mjs before package work

pnpm check:features
# default Node v22.22.3: fails in root precheck:features via check-validation-node-runtime.mjs

env -u CAT_CAFE_NODE_RUNTIME_GUARD_REEXEC \
  CAT_CAFE_NODE_BIN=/opt/homebrew/opt/node@24/bin/node \
  pnpm start:status
# reaches node ./scripts/start-entry.mjs status
# re-execs with /opt/homebrew/opt/node@24/bin/node (24.18.0)
# exits 1 only because the local daemon is not running; no ERR_PNPM_UNSUPPORTED_ENGINE

PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter @cat-cafe/finance run lint
# PASS

PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter @cat-cafe/web run test:lint-rules
# PASS

PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter @cat-cafe/mcp-server test -- --test-name-pattern "workflow-mandated|cat_cafe_register_scheduled_task"
# 381 pass / 0 fail / 0 cancelled

PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm check
# PASS; existing advisory warnings only

git diff --check
# PASS
```

Known unrelated gate-health issue:

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter @cat-cafe/api run test:public
# Reaches real public-test resolver under Node 24, then fails because
# packages/api/config/public-test-exclusions.json has expired "redis" exclusion:
# 2026-07-31 < 2026-08-02
```

That is tracked separately as task `0001785687002134-001212-84b1606d`.

## Quality-Gate Notes

- Artifact hygiene: no root media/design artifacts in worktree or branch diff.
- Design check: no `designs/` directory in this checkout.
- Dogfood scope: internal validation/startup guard bugfix; startup status path was manually exercised as the user-visible recovery path.
- Fallback layer script: unavailable in this checkout (`scripts/check-fallback-layers.mjs` missing); diff adds no fallback stack.
- Architecture ownership script: unavailable in this checkout (`check:architecture-ownership` missing).
- Architecture cell: harness-eval
- Map delta: none
- Why: validation/preflight behavior only; no Store, Queue, Router, Adapter, Dispatcher, Binding, or service boundary change.

## Next Action

Please re-review `69a2e402af0b96f5e2def45bfc5dedb2ca942257` and the R3 packet, then give APPROVE or REQUEST-CHANGES. If approved, I will continue PR/merge-gate flow.

[砚砚/gpt-5.5🐾]
