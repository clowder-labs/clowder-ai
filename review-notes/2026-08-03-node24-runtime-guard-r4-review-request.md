# Review Request R4: Node 24 Runtime Guard Coverage

Review-Target-ID: fix-node24-runtime-guard
Branch: fix/node24-runtime-guard
Base: origin/develop
Code Commit: d5d174773526c95d291d053e0685564f98158175
Worktree: `/Users/xxx/workspace/AI/cat-cafe-node24-runtime-guard`
Reviewer: `@sol`

## What

R4 addresses Sol R3 finding against `f2b0d6bf48d4ed5f5d17d005e8daeda4f91909bb`.

- `isValidationEntrypoint()` now recognizes validation intent by colon-delimited tokens: `audit`, `build`, `check`, `gate`, `lint`, `smoke`, `test`, `verify`, plus suffix `*-smoke`.
- Added exact prehooks for every existing R3 sweep miss:
  - `package.json#f210:agy-profile-smoke`
  - `package.json#alpha:test`
  - `package.json#runtime:test`
  - `package.json#audit:feature-docs`
  - `packages/api/package.json#verify:sigusr1`
  - `packages/api/package.json#smoke:f210-agy-profiles`
- Added an explicit regression test that keeps `verify:sigusr1`, `audit:*`, `smoke:*`, `*:test`, and `*-smoke` in the validation-entrypoint set while keeping startup scripts out.

## Why

R3 showed the previous dynamic audit still depended on a narrow name whitelist. `verify:sigusr1` could run under default Node 22 and print a trustworthy-looking `PASS`, which violates the patrol objective: validation output from this checkout must not be produced under unsupported Node.

## Tradeoff

This stays with scoped lifecycle hooks. I did not restore global `.npmrc engine-strict=true`, so startup/operational commands retain their Node 24 auto-reexec path.

## Red -> Green

Red step:

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" node --test scripts/node-runtime-guard.test.mjs
# FAIL: validation entrypoints without node runtime guard:
# package.json#alpha:test
# package.json#audit:feature-docs
# package.json#f210:agy-profile-smoke
# package.json#runtime:test
# packages/api/package.json#smoke:f210-agy-profiles
# packages/api/package.json#verify:sigusr1
```

Green step:

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" node --test scripts/node-runtime-guard.test.mjs
# 16 pass / 0 fail / 0 cancelled
```

## Failure-Mode Sweep

Pattern: validation semantics were inferred from an incomplete exact/prefix list.

Sweep result:

- `verify:*`: protected (`verify:sigusr1`)
- `audit:*`: protected (`audit:feature-docs`)
- `smoke:*`: protected (`smoke:f210-agy-profiles`)
- `*-smoke`: protected (`f210:agy-profile-smoke`)
- `*:test`: protected (`alpha:test`, `runtime:test`)
- startup/operational scripts remain excluded (`start`, `start:status`, `start:direct`, `dev:direct`)

## Validation Evidence

Default Node 22 fail-fast:

```bash
pnpm --filter @cat-cafe/api run verify:sigusr1
# fails in preverify:sigusr1 via check-validation-node-runtime.mjs before printing PASS

pnpm --filter @cat-cafe/api run smoke:f210-agy-profiles
# fails in presmoke:f210-agy-profiles via check-validation-node-runtime.mjs

pnpm run f210:agy-profile-smoke
# fails in pref210:agy-profile-smoke via check-validation-node-runtime.mjs

pnpm run alpha:test
# fails in prealpha:test via check-validation-node-runtime.mjs

pnpm run runtime:test
# fails in preruntime:test via check-validation-node-runtime.mjs

pnpm run audit:feature-docs
# fails in preaudit:feature-docs via check-validation-node-runtime.mjs
```

Node 24 positive paths and regression gates:

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter @cat-cafe/api run verify:sigusr1
# PASS — guard suppresses SIGUSR1 inspector across the tsx watch tree

PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm run audit:feature-docs
# PASS: docs=256 green=240 yellow=16 red=0
# generated audit artifacts were cleaned and are not part of this diff

env -u CAT_CAFE_NODE_RUNTIME_GUARD_REEXEC \
  CAT_CAFE_NODE_BIN=/opt/homebrew/opt/node@24/bin/node \
  pnpm start:status
# reaches start-entry.mjs, re-execs Node 24, exits only because daemon is not running

PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm check
# PASS; existing advisory warnings only

git diff --check
# PASS
```

## Quality-Gate Notes

- Artifact hygiene: no root media/design artifacts in worktree or branch diff.
- Design check: no `designs/` directory in this checkout.
- Dogfood scope: internal validation/startup guard bugfix; exercised actual validation commands plus startup status recovery.
- Fallback layer script: unavailable in this checkout (`scripts/check-fallback-layers.mjs` missing); diff adds no fallback stack.
- Architecture ownership script: unavailable in this checkout (`check:architecture-ownership` missing).
- Architecture cell: harness-eval
- Map delta: none
- Why: validation/preflight behavior only; no Store, Queue, Router, Adapter, Dispatcher, Binding, or service boundary change.

## Next Action

Please re-review `d5d174773526c95d291d053e0685564f98158175` and the R4 packet, then give APPROVE or REQUEST-CHANGES. If approved, I will continue PR/merge-gate flow.

[砚砚/gpt-5.5🐾]
