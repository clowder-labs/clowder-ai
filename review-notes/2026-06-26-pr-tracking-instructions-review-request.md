# Review Request: suppress stale PR tracking instructions

Review-Target-ID: fix-pr-tracking-instruction-head-scope
Branch: fix/pr-tracking-instruction-head-scope

## What

PR #29 binds PR tracking instructions to the PR head observed when
`/api/callbacks/register-pr-tracking` stores them, then suppresses those
instructions from CI/review-feedback callbacks when later callbacks report a
different head.

## Why

Daily patrol found PR #187 callbacks replaying old head-specific instructions
after newer commits. A current-head CI/review callback should not keep telling
the receiver to handle stale findings from an earlier head.

## Original Requirements

> 每轮必须先查真相源和证据，再给风险/价值判断与下一步动作。
> 发现可执行事项后主导闭环：按家规走 feature lifecycle（定位真相源、立项、实现/协调、质量门禁、review、完成记录）。

- Source: patrol thread `thread_mqcj45byxoka2z7u`, scheduled wake `2026-06-26 00:00 Asia/Shanghai`.
- Please check that the implementation solves the observed PR-tracking callback problem, not just the narrow tests.

## Tradeoff

This keeps backward compatibility by still appending instructions for older
tasks that have no stored `trackingInstructionsHeadSha`, and it fails open when
a callback has no current head SHA. That avoids silently dropping instructions
from legacy/manual tracking records while fixing the stale-head replay path.

## Architecture Ownership

Architecture cell: callback-routing / PR-tracking automation state
Map delta: none
Why: This extends existing callback router/task automation metadata without
adding a new Store, Router, Adapter, Dispatcher, or ownership boundary.

Please check:
- diff matches `Map delta: none`
- no parallel Store/Queue/Router/Adapter/Dispatcher/Binding was introduced
- no architecture ownership docs should have changed

## Open Questions

### Technical OQ

- Is the fail-open behavior for legacy tasks without `trackingInstructionsHeadSha` the right compatibility boundary?
- Is the chosen head source during registration correct for both fresh and active re-registration paths?

### Value OQ

None.

## Next Action

Please do a non-author current-SHA review of PR #29. If there are P1/P2
findings, route back to receive-review. If clean, approve and include the
focused validation you ran.

## Review Sandbox

- Path: `/tmp/cat-cafe-review/fix-pr-tracking-instruction-head-scope/gpt555`
- Start Command: `pnpm review:start` or equivalent read-only checkout/test commands
- Ports: not used; no frontend/runtime server needed for this review

## Self-Check Evidence

### Spec Compliance

- Found truth source in `CiCdRouter`, `ReviewFeedbackRouter`, `ReviewFeedbackTaskSpec`, and `register-pr-tracking`.
- Created task `[Patrol P2] PR tracking callbacks should not replay stale head-specific instructions`.
- Implemented in isolated worktree with dev/test `.env` pointing Redis to `6398`.
- Registered PR tracking for PR #29.

### Test Results

Red tests first:
- `cicd-router.test.js`: stale-head CI instructions assertion failed before implementation.
- `review-feedback-router.test.js`: stale-head review feedback instructions assertion failed before implementation.
- `callback-routes.test.js`: expected `trackingInstructionsHeadSha === "test-head"`, got `undefined` before implementation.

Green / focused:
- `pnpm --dir packages/api run build`: passed
- `CAT_CAFE_DISABLE_SHARED_STATE_PREFLIGHT=1 bash packages/api/scripts/with-test-home.sh node --import ./packages/api/test/helpers/setup-cat-registry.js --test --test-timeout=60000 packages/api/test/cicd-router.test.js packages/api/test/review-feedback-router.test.js`: 41 tests / 17 suites passed
- `CAT_CAFE_DISABLE_SHARED_STATE_PREFLIGHT=1 bash packages/api/scripts/with-test-home.sh node --import ./packages/api/test/helpers/setup-cat-registry.js --test --test-timeout=60000 --test-name-pattern "binds instructions" packages/api/test/callback-routes.test.js`: 1 test passed
- `CAT_CAFE_DISABLE_SHARED_STATE_PREFLIGHT=1 bash packages/api/scripts/with-test-home.sh node --import ./packages/api/test/helpers/setup-cat-registry.js --test --test-timeout=60000 packages/api/test/f202-phase2-c.test.js packages/api/test/task-store-instructions.test.js`: 30 tests / 11 suites passed
- `pnpm --dir packages/api run lint`: passed
- `git diff --check`: passed

Dogfood:
- Built `buildCiMessageContent()` with a current head plus old-head instructions; output omitted the stale Tracking Instructions block.

Known unrelated checks:
- `pnpm check` passed Biome and then failed `check-feature-truth` on an existing `ROADMAP` reference to missing `F207`.
- An accidental broad API test run hit an unrelated `capabilities-route.test.js` timeout; the targeted suites above passed.

### Related Documents

- `docs/features/F133-cicd-tracking.md`
- `docs/features/F140-github-pr-automation.md`
- PR: https://github.com/clowder-labs/clowder-ai/pull/29
