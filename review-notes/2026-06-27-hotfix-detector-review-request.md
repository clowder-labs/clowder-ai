# Review Request: clowder-ai hotfix detector

Review-Target-ID: fix-hotfix-detector-script
Branch: fix/hotfix-detector-script
PR: https://github.com/clowder-labs/clowder-ai/pull/32
Target: current PR head

## Original Requirements

Source: scheduled patrol in `thread_mqcj45byxoka2z7u`.

> 每轮必须先查真相源和证据，再给风险/价值判断与下一步动作。
> 发现可执行事项后主导闭环：按家规走 feature lifecycle（定位真相源、立项、实现/协调、质量门禁、review、完成记录）。

## What Changed

- Added `scripts/check-hotfix-pattern.mjs`, the repo-local script required by `merge-gate` and `quality-gate`.
- Added `scripts/check-hotfix-pattern.test.mjs` covering:
  - conventional `fix:` detection
  - copied detector-output false positives
  - real hotfix metadata preservation
  - CLI JSON output from `--input-json`
  - fail-closed missing-input JSON
- Added `check:hotfix-pattern` to root `pnpm check`.

## Architecture Ownership

Architecture cell: governance / merge-gate tooling
Map delta: none
Why: this fills a missing repo-local script required by existing SOP/skills; it does not introduce a new runtime service, store, queue, router, or external contract.

## Quality Gate Evidence

- RED: `node --test scripts/check-hotfix-pattern.test.mjs` failed with `ERR_MODULE_NOT_FOUND` before implementation.
- GREEN: `pnpm check:hotfix-pattern` passed.
- `pnpm check` passed.
- `pnpm build` passed.
- `pnpm lint` passed with existing frontend warnings only.
- `git diff --check` passed.
- Artifact hygiene: no root media/design artifacts.

Residual risk: full `pnpm test` was attempted and hit the existing `packages/api/test/capabilities-route.test.js` 60s timeout path. This is unrelated to the root script change and was previously seen during PR #29.

## Review Focus

- Does the detector preserve the F177 governance semantics expected by `merge-gate` and `quality-gate`?
- Is the fail-closed CLI behavior acceptable for merge-gate JSON parsing?
- Does the detector-output scrub avoid false positives without hiding real hotfix metadata?
