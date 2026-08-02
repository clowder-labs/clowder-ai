# Review Request R2: Node 24 Runtime Guard Coverage

Review-Target-ID: fix-node24-runtime-guard
Branch: fix/node24-runtime-guard
Base: origin/develop
Code Commit: 82078353b354bf8a779fe2d60f45c9a81bd2b902
Worktree: `/Users/xxx/workspace/AI/cat-cafe-node24-runtime-guard`

## What

R1 reviewer finding from @sol was correct: package lifecycle hooks only protect exact script names. The first implementation protected canonical `build/test/lint` for a hardcoded package list, but left supported commands such as `packages/finance lint`, API `test:public`, and web `test:lint-rules` able to run under default Node v22.

R2 adds a central pnpm guard:

- `.npmrc`: `engine-strict=true`
- `scripts/node-runtime-guard.test.mjs`: replaces fixed package/script assertions with workspace package discovery plus validation entrypoint discovery (`build`, `test`, `lint`, `check`, `gate`, `test:*`, `check:*`)

The invariant is now: either a validation entrypoint has its exact `pre<name>` lifecycle guard, or the repo has central pnpm engine-strict protection before any package work runs.

## Why

This closes the original failure mode without growing a brittle list of `pretest:*` and `precheck:*` hooks. Future workspace packages or namespaced validation commands are discovered by the regression test.

## Tradeoff

`engine-strict=true` changes default pnpm behavior under unsupported Node from a warning to a hard failure. That is intentional for this repo because direct validation output under the wrong Node is not trustworthy. Existing Node 24 paths continue to run.

## Failure-Mode Sweep

Pattern: exact lifecycle hook inventory was used as the guard boundary.

Sweep result:

- Root `check:*` and `test:*` entrypoints were unprotected.
- API `test:*` entrypoints including `test:public` were unprotected.
- `packages/finance` canonical `build/test/lint` was unprotected.
- Web `test:lint-rules` was unprotected.

Fix shape: central engine-strict plus dynamic test, not per-entry patching.

## Validation Evidence

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" node --test scripts/node-runtime-guard.test.mjs
# 14 pass / 0 fail / 0 cancelled

pnpm --filter @cat-cafe/finance run lint
# default Node v22.22.3: ERR_PNPM_UNSUPPORTED_ENGINE before tsc

pnpm --filter @cat-cafe/api run test:public
# default Node v22.22.3: ERR_PNPM_UNSUPPORTED_ENGINE before package script

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

Note: under Node 24, `pnpm --filter @cat-cafe/api run test:public` reaches the public-test resolver but fails because `packages/api/config/public-test-exclusions.json` entries expired on 2026-07-31. That is a separate existing gate-health issue, tracked as task `0001785687002134-001212-84b1606d`.

## Quality-Gate Notes

- Artifact hygiene: no root media/design artifacts in worktree or branch diff.
- Fallback layer script: unavailable in this checkout (`scripts/check-fallback-layers.mjs` missing); manual diff scan found no >=3 fallback-layer additions.
- Architecture ownership script: unavailable in this checkout (`check:architecture-ownership` intentionally absent from public package scripts).
- Architecture cell: harness-eval
- Map delta: none
- Why: validation/preflight behavior only; no Store, Queue, Router, Adapter, Dispatcher, Binding, or service boundary change.

## Next Action

Please re-review current branch HEAD after `82078353b` and give APPROVE or REQUEST-CHANGES. If approved, I will continue PR/merge-gate flow.

[砚砚/gpt-5.5🐾]
