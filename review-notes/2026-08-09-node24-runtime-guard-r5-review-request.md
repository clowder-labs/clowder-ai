# Review Request R5: Node 24 Runtime Guard Env Registry Closure

Review-Target-ID: fix-node24-runtime-guard
Branch: fix/node24-runtime-guard
Base: origin/develop
Code Commit: 8e570abbc4ad883be6c84108d25132c33617c3b3
Worktree: `/Users/xxx/workspace/AI/cat-cafe-node24-runtime-guard`
Reviewer: `@sol`

## What

Daily patrol found that R4's env-registry closure only scanned JS runtime guard scripts. The actual startup re-exec guard in `scripts/lib/node-runtime-guard.sh` still had undiscovered `CAT_CAFE_NODE_*` configuration, including the documented `CAT_CAFE_NODE_BIN` recovery knob.

R5 closes that gap:

- `scripts/check-env-registry.test.mjs` now scans `scripts/lib/node-runtime-guard.sh` for shell `$ENV_VAR` / `${ENV_VAR:-default}` references.
- `CAT_CAFE_NODE_PINNED_MAJOR`, `CAT_CAFE_NODE_PREFERRED_MAJORS`, and `CAT_CAFE_NODE_BIN` are registered in `packages/api/src/config/env-registry.ts`.
- Internal sentinel `CAT_CAFE_NODE_RUNTIME_GUARD_REEXEC` is allowlisted with an explicit reason instead of being surfaced as user config.

## Why

The runtime guard tells operators to set `CAT_CAFE_NODE_BIN=/absolute/path/to/node`, but the registry did not expose that variable and the completeness test could not catch shell guard drift. That made the previous "register runtime guard env vars" fix incomplete.

## Tradeoff

This keeps scanning scoped to the Node runtime guard shell script instead of broadly parsing every shell script in the repo. Broad shell parsing is useful later, but not necessary for this bug and likely to produce noisy false positives.

## Red -> Green

Red step:

```bash
node --test scripts/check-env-registry.test.mjs
# FAIL: 4 env var(s) used in code but not registered in env-registry.ts:
#   CAT_CAFE_NODE_PINNED_MAJOR
#   CAT_CAFE_NODE_PREFERRED_MAJORS
#   CAT_CAFE_NODE_BIN
#   CAT_CAFE_NODE_RUNTIME_GUARD_REEXEC
```

Green steps:

```bash
node --test scripts/check-env-registry.test.mjs
# pass 6 / fail 0

node --test scripts/node-runtime-guard.test.mjs
# pass 16 / fail 0

git diff --check
# PASS

pnpm biome check packages/api/src/config/env-registry.ts scripts/check-env-registry.test.mjs --diagnostic-level=error
# Checked 2 files. No fixes applied.
# Note: pnpm emitted the expected Node engine warning because this shell is Node v22.22.3.
```

## Quality Gate

Spec / intent source: R4 review packet + patrol finding against current `scripts/lib/node-runtime-guard.sh`.

- Vision coverage: operator/cat-visible startup recovery knobs must be discoverable; `CAT_CAFE_NODE_BIN` is now registered.
- Design check: no UI/design changes; no `.pen` applicable.
- Dogfood: internal guard bugfix; exercised the actual registry gate and runtime guard tests.
- Artifact hygiene: no root media/design artifacts added.
- Architecture ownership: no cell delta; env registry + test gate only.
- Fallback layer check: no fallback stack added.

## Review Focus

- Confirm shell env extraction is appropriately scoped and not too broad.
- Confirm `CAT_CAFE_NODE_RUNTIME_GUARD_REEXEC` belongs in allowlist, while `CAT_CAFE_NODE_BIN` / pinned / preferred majors belong in registry.
- Confirm R5 supersedes stale R4 `Code Commit: d5d1747...`; current code target is `8e570abbc4ad883be6c84108d25132c33617c3b3`.

## Next Action

Please review `8e570abbc4ad883be6c84108d25132c33617c3b3` and this R5 packet. If approved, I will continue PR/merge-gate flow.

[砚砚/gpt-5.5🐾]
