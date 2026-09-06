# R3 Review Request: hotfix reminder SOP schema-test floor

Review-Target-ID: fix-hotfix-reminder-sop
Branch: fix/hotfix-reminder-sop
PR: https://github.com/clowder-labs/clowder-ai/pull/92
Code Delta: 06131a27996dc19179f6ea66848ac5fa0db5e1de..7aae6d8d40c45b5e8bd3371b11ab0ac750699dd5

## What

Daily patrol found three memory tests still pinning `CURRENT_SCHEMA_VERSION` to `39` after PR #92 raised the memory schema to V41 for schedule registration idempotency.

Changed those assertions to verify the relevant migration floor instead:

- V34 reflection migration tests require `CURRENT_SCHEMA_VERSION >= 34`.
- V37 memory cue migration tests require `CURRENT_SCHEMA_VERSION >= 37`.
- `MemoryReflectionStore` keeps its V34 behavior check without blocking unrelated later schema bumps.

## Why

These tests prove older migration features still exist. They should not fail every time an unrelated later migration increments the global schema version.

## Original Requirements

> 每日北京时间 00:00 系统先锋巡检。
> 每轮必须先查真相源和证据，再给风险/价值判断与下一步动作。
> 发现可执行事项后主导闭环。

Source: scheduled patrol thread; today navigation truth source was `packages/api/src/domains/memory/schema.ts`.

## Tradeoff

I did not weaken tests that compare the applied database version to `CURRENT_SCHEMA_VERSION`; those still protect full migration completion. This only removes stale exact-version pins from tests scoped to V34/V37 behavior.

## Architecture Ownership

Architecture cell: memory schema tests
Map delta: none
Why: test-only assertion maintenance; no new Store, Queue, Router, Adapter, Dispatcher, Binding, schema table, or runtime boundary.

## Open Questions

### Technical OQ

Please verify no exact schema-version pin remains where the test should track a migration floor.

### Value OQ

None.

## Next Action

Please perform a scoped continuity review for PR #92 after this patrol fix. Focus only on the test-only delta and whether the prior local approval needs to be rebound to the new exact HEAD.

## Quality Gate

Dogfood-Your-Slice: exempt. This is test-only maintenance and has no user/cat-visible runtime path.

Artifact hygiene:

- `git status --short | grep ...root media...` returned no matches.
- `git diff --name-only origin/develop...HEAD | grep ...root media...` returned no matches.
- `find designs/*.pen` returned no matches.

Verification:

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm build
# passed

PATH="/opt/homebrew/opt/node@24/bin:$PATH" CAT_CAFE_DISABLE_SHARED_STATE_PREFLIGHT=1 \
  bash ./scripts/with-test-home.sh node --test --test-reporter=dot --test-timeout=60000 \
  test/memory/schema-v2.test.js \
  test/memory/schema-v17.test.js \
  test/memory/schema-v19-f200.test.js \
  test/memory/schema-v26-recall-result-count.test.js \
  test/memory/schema-v34-reflection.test.js \
  test/memory/schema-v37-memory-cue.test.js \
  test/memory/memory-reflection-store.test.js \
  test/scheduler/dynamic-task-store.test.js
# passed

PATH="/opt/homebrew/opt/node@24/bin:$PATH" CAT_CAFE_DISABLE_SHARED_STATE_PREFLIGHT=1 \
  bash ./scripts/with-test-home.sh node --test --test-reporter=dot --test-timeout=60000 \
  test/scheduler/schedule-mutation-proposal-store.test.js \
  test/scheduler/schedule-proposal-decision-routes.test.js \
  test/schedule-route.test.js
# passed

PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm biome check \
  packages/api/test/memory/schema-v34-reflection.test.js \
  packages/api/test/memory/schema-v37-memory-cue.test.js \
  packages/api/test/memory/memory-reflection-store.test.js
# passed

git diff --check
# passed
```

