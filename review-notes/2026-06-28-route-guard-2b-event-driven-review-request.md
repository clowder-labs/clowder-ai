# Review Request: route guard 2b event-driven external wait

Review-Target-ID: fix-route-guard-2b-event-driven
Branch: fix/route-guard-2b-event-driven
Target: local branch based on `origin/main` at `8e412d2b`

## What

The routing guard now treats a final-slot line of
`External Wait: event-driven (<id>)` as a legitimate 2b external-wait exit.

Changed paths:
- `packages/api/src/domains/cats/services/agents/routing/guards/routing-guard-remedial.ts`
- `packages/api/src/domains/cats/services/agents/routing/route-serial.ts`
- `packages/api/test/routing-guard-remedial.test.js`
- `packages/api/test/route-serial-routing-guard-remedial.test.js`

## Why

Daily patrol found a real routing contradiction: when PR tracking had structured
callback coverage and EYES>0, the collaboration rule said 2b event-driven wait
means no `hold_ball`, but the server-side routing guard rejected the response as
"no legal route exit" unless it saw line-start `@` or `cat_cafe_hold_ball`.
That caused unnecessary remedial churn and local cat ping-pong even though the
next action was an external callback.

## Original Requirements

Source: scheduled patrol in `thread_mqcj45byxoka2z7u`, wake
`2026-06-28 00:00 Asia/Shanghai`.

> 每轮必须先查真相源和证据，再给风险/价值判断与下一步动作。
> 发现可执行事项后主导闭环：按家规走 feature lifecycle（定位真相源、立项、实现/协调、质量门禁、review、完成记录）。

Observed incident source: `clowder-labs/clowder-ai#32` review/check wait path
where current rules selected 2b event-driven waiting but route guard demanded
`@` or `hold_ball`.

## Tradeoff

This is intentionally structural: only a final routing slot line matching
`External Wait: event-driven (<id>)` counts. It does not classify natural
language like "I will wait for CI", so the F177/KD-8 guard remains mechanical.

The remedial prompt now teaches that exact outlet format, so future guard
patches can add the missing exit without redoing work.

## Architecture Ownership

Architecture cell: routing / A2A guard
Map delta: none
Why: this extends the existing routing guard exit predicate and route-serial
input plumbing. It does not add a new Store, Queue, Router, Adapter, Dispatcher,
Binding, runtime service, or external contract.

Please check:
- diff matches `Map delta: none`
- the `External Wait` recognizer is structural enough and not an intent classifier
- route-serial passes the correct stored text at every guard check

## Quality Gate Evidence

### Red

- `routing-guard-remedial.test.js`: `2b External Wait event-driven 槽位 → 不触发 remedial` failed, returning `true` instead of `false`.
- `routing-guard-remedial.test.js`: `External Wait: event-driven(<id>) counts as a valid 2b external-wait exit` failed, returning `false` instead of `true`.
- `routing-guard-remedial.test.js`: prompt test failed because `event-driven` was missing.
- `route-serial-routing-guard-remedial.test.js`: event-driven external wait caused two Codex invocations instead of one.

### Green

- `pnpm --dir packages/api run build`: passed
- `CAT_CAFE_DISABLE_SHARED_STATE_PREFLIGHT=1 bash packages/api/scripts/with-test-home.sh node --import $(pwd)/packages/api/test/helpers/setup-cat-registry.js --test --test-timeout=60000 packages/api/test/routing-guard-remedial.test.js packages/api/test/route-serial-routing-guard-remedial.test.js`: 33 tests passed
- `CAT_CAFE_DISABLE_SHARED_STATE_PREFLIGHT=1 bash packages/api/scripts/with-test-home.sh node --import $(pwd)/packages/api/test/helpers/setup-cat-registry.js --test --test-timeout=60000 packages/api/test/final-routing-slot.test.js packages/api/test/verdict-detect.test.js`: 57 tests passed
- `pnpm --dir packages/api run lint`: passed
- `git diff --check`: passed
- `pnpm check`: passed

### Extra Gate Checks

- `node scripts/check-hotfix-pattern.mjs`: `{"hotfix":false,"matchedTerms":[],"matches":[]}`
- `node scripts/check-fallback-layers.mjs`: N/A, script is not present in this tree.
- `pnpm run check:architecture-ownership`: N/A, script is not present in this tree.
- `rg --files designs | rg '\.pen$'`: N/A, `designs/` is not present.
- Root artifact hygiene:
  - `git status --short | rg '^.. [^/]+\.(png|jpe?g|webp|gif|webm|mp4|mov|wav|pdf|pen)$'`: no output
  - `git diff --name-only origin/main...HEAD | rg '^[^/]+\.(png|jpe?g|webp|gif|webm|mp4|mov|wav|pdf|pen)$'`: no output

### Dogfood-Your-Slice

Scope verdict: required. This is cat-visible routing behavior.

Dogfood path: the route-serial integration suite exercises a guarded Codex turn
whose final slot is `External Wait: event-driven (pr:clowder-labs/clowder-ai#32)`.
Before the fix, route-serial invoked Codex twice; after the fix, it persists the
original visible response with one invocation and no routing-guard failure.

## Open Questions

### Technical OQ

- Should we accept only the English `External Wait` template, or also add a
  separate Chinese canonical template later? This patch keeps the existing
  documented template only.
- Is line-level matching inside the final slot acceptable, or should the entire
  final paragraph be exactly one `External Wait` line?

### Value OQ

None.

## Next Action

Please do a non-author review of `fix/route-guard-2b-event-driven`. If clean,
approve and include the focused validation you ran. If there are P1/P2 findings,
route back to `@codex` for receive-review.

## Receive-Review Update

Reviewer found one P2 on current head `a9e177d8`: `External Wait: event-driven`
was accepted by `routing-guard-remedial`, but Phase H `validateRoutingSyntax`
still treated an inline mention in the same final slot as `invalid_route_syntax`.

Fix:
- moved the structural event-driven external-wait predicate into
  `final-routing-slot.ts`
- made `routing-guard-remedial.ts` reuse that shared helper
- taught `validateRoutingSyntax()` to treat the same final-slot event-driven
  exit as a legitimate syntax suppressor

Red→Green:
- `2b event-driven external wait exit suppresses inline mention syntax warning`
  failed with `invalid_route_syntax`, now passes with `ok`.

Failure-mode sweep:
- Pattern: newly added legitimate route exit must be recognized consistently by
  every mechanical routing guard in this PR.
- Scanned touched routing guard surfaces: remedial exit predicate, route-serial
  guard invocation sites, Phase H final-slot syntax validator, verdict adjacent
  tests.
- Result: shared helper now prevents remedial/Phase-H drift for this exit.

Additional verification after the fix:
- `pnpm --dir packages/api run build`: passed
- `CAT_CAFE_DISABLE_SHARED_STATE_PREFLIGHT=1 bash packages/api/scripts/with-test-home.sh node --import $(pwd)/packages/api/test/helpers/setup-cat-registry.js --test --test-timeout=60000 packages/api/test/final-routing-slot.test.js`: 23 tests passed
- `CAT_CAFE_DISABLE_SHARED_STATE_PREFLIGHT=1 bash packages/api/scripts/with-test-home.sh node --import $(pwd)/packages/api/test/helpers/setup-cat-registry.js --test --test-timeout=60000 packages/api/test/routing-guard-remedial.test.js packages/api/test/route-serial-routing-guard-remedial.test.js packages/api/test/verdict-detect.test.js`: 68 tests passed

## Receive-Review Update 2

Cloud review on current head `e44e81c2` found one current P2, plus an older
still-applicable same-family P2:

1. `External Wait: event-driven (...)` remedials were still not recognized by
   `normalizeRouteOnlyRemedialText`, so route-serial treated the bare wait line
   as replacement content and discarded useful first-pass text.
2. Valid 2b event-driven waits could still trip `void-hold-hint` when the text
   mentioned `hold_ball`, because void-hold suppression only knew `@`, structured
   targets, co-creator, or actual hold tool calls.

Fix:
- `normalizeRouteOnlyRemedialText()` now treats the shared structural
  event-driven external wait template as route-only content.
- `runRoutingGuardRemedial()` returns separate `routingContent`; route-serial
  persists the original visible text but validates follow-up guards against
  `storedContent + routingContent`.
- `void-hold-detect.ts` and `verdict-detect.ts` now reuse
  `hasEventDrivenExternalWaitExit()` so direct 2b waits suppress the same
  false-positive class without adding semantic intent classification.

Red→Green:
- `event-driven external-wait remedial counts as route-only and keeps first-pass
  text visible` failed by persisting `External Wait: event-driven (pr:35)`, now
  persists the original first-pass text and emits no guard/syntax/void-hold hint.
- `does not warn when structural event-driven external wait exit exists` failed
  in `void-hold-detect`, now suppresses while preserving the matched hold pattern.
- `verdict + structural event-driven external wait exit → false` failed in
  `verdict-detect`, now suppresses as a legitimate external wait exit.

Failure-mode sweep:
- Invariant: the structural 2b external-wait exit must be recognized consistently
  by every mechanical post-output guard, not only the remedial gate.
- Scanned touched sibling guard surfaces: remedial route-only normalization,
  Phase H syntax validation, verdict-without-pass detection, void-hold detection,
  and route-serial post-remedial validation.
- Result: all current touched surfaces now consume the shared final-slot helper.

Additional verification after the cloud fix:
- `pnpm --dir packages/api run build`: passed
- Focused red→green suite:
  `route-serial-routing-guard-remedial.test.js`,
  `void-hold-detect.test.js`,
  `verdict-detect.test.js`: 85/85 passed
- Expanded guard suite:
  `final-routing-slot.test.js`, `routing-guard-remedial.test.js`,
  `route-serial-routing-guard-remedial.test.js`, `verdict-detect.test.js`,
  `void-hold-detect.test.js`: 122/122 passed
- `git diff --check`: passed
- `pnpm check:hotfix-pattern`: 24/24 passed
- `pnpm check`: passed
- `scripts/check-fallback-layers.mjs`: unavailable in this tree
- `pnpm check:architecture-ownership`: unavailable in this tree

## Receive-Review Update 3

Cloud review on current head `b41b72a3` found one P2:

- Signed outputs like
  `External Wait: event-driven (pr:35)\n\n[砚砚/GPT-5.5]`
  made `finalRoutingSlot()` pick the trailing signature paragraph, so
  `hasEventDrivenExternalWaitExit()` returned `false` and the new legal 2b exit
  could still trip remedial/verdict/void-hold guards.

Fix:
- moved trailing cat-signature stripping into `final-routing-slot.ts`
- made `hasEventDrivenExternalWaitExit()` strip signatures before selecting the
  final slot
- made `verdict-detect.ts` reuse the same shared signature stripper instead of
  keeping a separate local copy

Red→Green:
- `signed 2b event-driven external wait exit suppresses inline mention syntax
  warning` failed because `hasEventDrivenExternalWaitExit()` returned `false`,
  now passes.

Failure-mode sweep:
- Invariant: final-slot guard helpers must treat trailing identity signatures as
  metadata, not content.
- Scanned touched sibling surfaces: event-driven exit detection, Phase H syntax
  validation, verdict detection, void-hold detection.
- Result: event-driven exit and verdict detection now share the same signature
  stripping helper.

Additional verification after the signed-exit fix:
- `pnpm --dir packages/api run build`: passed
- Expanded guard suite:
  `final-routing-slot.test.js`, `routing-guard-remedial.test.js`,
  `route-serial-routing-guard-remedial.test.js`, `verdict-detect.test.js`,
  `void-hold-detect.test.js`: 123/123 passed
- `git diff --check`: passed
- `pnpm check`: passed
