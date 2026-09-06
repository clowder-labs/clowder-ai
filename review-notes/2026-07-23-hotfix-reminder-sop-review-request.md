# Review Request: hotfix reminder SOP registration

Review-Target-ID: fix-hotfix-reminder-sop
Branch: fix/hotfix-reminder-sop
PR: https://github.com/clowder-labs/clowder-ai/pull/92
Head: use PR #92 current head; the routing message supplies the exact SHA.

## What

- Updated schedule MCP descriptions to distinguish user-requested schedules from the one trusted workflow-mandated exception.
- Updated `schedule-tasks` so ordinary user schedules still require preview and confirmation, while only trusted built-in canonical `merge-gate` Step 7.6 may register after preview verification.
- Added schedule registration idempotency for workflow replay safety: stable `idempotencyKey` values dedupe exact callback retries to the existing dynamic task, while same-key semantic mismatches return `409 IDEMPOTENCY_CONFLICT`.
- Bound each idempotency key to a canonical request fingerprint covering template, trigger input, params/target, display, delivery thread, and actor.
- Made preview drafts match final registration semantics: target canonicalization, actor, delivery thread, display, and idempotency key are visible in the draft before persistence.
- Added a `tips_exempt` frontmatter note because this is an internal SOP/MCP workflow clarification, not a new end-user capability.
- Updated `merge-gate` Step 7.6 so hotfix 14-day upgrade reminders must preview, verify draft fields, then register with no extra user confirmation and a repo+PR-scoped stable `idempotencyKey`; conflicts now fail closed.
- Added MCP/API regression tests for tool descriptions, skill docs, preview parity, idempotency-key passthrough, persistent dedupe, same-key conflicts, and replay behavior.

## Why

Daily patrol found a process contradiction: hotfix merge-gate requires registering a 14-day upgrade review reminder, but schedule guidance required user confirmation for every registration. That left several hotfix tails as previews instead of persisted reminders.

## Original Requirements

> 每日北京时间 00:00 系统先锋巡检。
> 巡检 clowder-code / Cat Cafe 系统中不完善、待改进、可提升竞争力的地方。
> 每轮必须先查真相源和证据，再给风险/价值判断与下一步动作。
> 发现可执行事项后主导闭环。

- 来源：Cat Cafe patrol thread `thread_mqcj45byxoka2z7u`, task `0001784736110466-000578-8fa70fcb`
- 请 reviewer 对照上面的摘录判断这次修复是否闭合了 hotfix reminder 漏注册的流程缺口。

## Tradeoff

The exception is intentionally narrow. I did not remove confirmation from normal schedule registration; user-requested reminders still require preview and explicit confirmation. Plugin/project/user/external skills do not qualify; only the built-in canonical `merge-gate` Step 7.6 hotfix reminder workflow can register after preview verification.

The API change is additive: callers without `idempotencyKey` keep the existing create-new-task behavior. Callers with a stable key get replay-safe dedupe only for the same canonical request; conflicting reuse returns 409 and does not mutate the existing task.

## Architecture Ownership

Architecture cell: workflow / MCP collab schedule surface + scheduler persistence
Map delta: none
Why: This extends the existing schedule route and `DynamicTaskStore` with idempotency key/fingerprint columns and an index; it does not add a new Store, Queue, Router, Adapter, Dispatcher, Binding, or runtime ownership boundary.

Reviewer checks:

- Verify `Map delta: none` matches the diff.
- Verify the exception cannot be read as bypassing user confirmation for ordinary user-requested schedules.
- Verify plugin/project/user/external skills are excluded from the no-extra-confirmation exception.
- Verify schedule registration retry with the same `idempotencyKey` cannot create duplicate reminders.
- Verify same-key semantic mismatch returns `409 IDEMPOTENCY_CONFLICT` without modifying the existing task.
- Verify preview draft fields match final registration semantics, including target, actor, delivery thread, display, and idempotency key.
- Verify `merge-gate` Step 7.6 is actionable and fail-closed.

## Open Questions

### 技术 OQ

- Is the trusted built-in canonical `merge-gate` Step 7.6 boundary tight enough to prevent workflow-mandated from becoming a blanket bypass?
- For cross-cat takeover of the same merge-gate reminder, this implementation chooses fail-closed `409` when actor/provenance differs. Please verify that is the right contract.

### 价值 OQ

无。

## Next Action

Please review PR #92 against its current head. Focus on the trusted workflow boundary, merge-gate hotfix reminder flow, idempotent registration replay/conflict behavior, preview/register parity, and whether the regression tests protect the right surfaces.

## Review Sandbox

- Path: `/tmp/cat-cafe-review/fix-hotfix-reminder-sop/{reviewer-handle}`
- Start Command: `pnpm review:start` is not required for this PR; no runtime/frontend path is involved.
- Ports: none.

### Sandbox Bootstrap

```bash
unset NODE_ENV
PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm install --frozen-lockfile
```

## 自检证据

### Spec 合规

- 巡检范围：hotfix merge-gate reminder tail, schedule MCP descriptions, `schedule-tasks`, and `merge-gate` Step 7.6.
- 根因：schedule confirmation wording and merge-gate mandated registration were inconsistent.
- 修复：preview remains mandatory; confirmation remains mandatory for user-requested schedules; only built-in canonical `merge-gate` Step 7.6 hotfix reminder can register after verified preview with no extra confirmation; exact register retries are deduped by stable `idempotencyKey`, while same-key semantic mismatches return `409`.
- Dogfood scope: exempt. This is an internal SOP/tool-description fix with no user-facing runtime path.
- Artifact hygiene: root media/design artifact checks returned no matches.

### 测试结果

```bash
git diff --check
# passed

PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm check
# passed; existing advisory warnings only

PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter @cat-cafe/api build
# passed

PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter @cat-cafe/mcp-server build
# passed

PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter @cat-cafe/mcp-server test -- --test-name-pattern "workflow-mandated|idempotency key|workflow fields"
# passed: 387 tests, 0 failed

node --test packages/api/test/scheduler/dynamic-task-store.test.js --test-name-pattern "idempotency|columns"
# passed: 13 tests, 0 failed

node --test packages/api/test/schedule-route.test.js --test-name-pattern "idempotencyKey|workflow audit"
# passed: 40 tests, 0 failed

node --test packages/api/test/memory/schema-v17.test.js packages/api/test/memory/schema-v19-f200.test.js packages/api/test/memory/schema-v2.test.js packages/api/test/memory/schema-v26-recall-result-count.test.js packages/api/test/memory/world-scope-filter.test.js packages/api/test/pack-knowledge-scope.test.js --test-name-pattern "CURRENT_SCHEMA_VERSION|schema V6 migration|V26 migration"
# passed: 30 tests, 0 failed
```

### Local Caveat

Quality-gate helper caveats in this local checkout: `node scripts/check-fallback-layers.mjs` is unavailable because the script is not present, and `pnpm check:architecture-ownership` is not registered. I ran the equivalent manual diff scan for architecture-surface changes and the root artifact hygiene checks; no blocker found.

Node 24 local API `node --test` is blocked by the local `better-sqlite3` native module being compiled for Node 22 (`NODE_MODULE_VERSION 127` vs Node 24 `137`). Focused API tests are green under default Node 22; TypeScript builds and repo `pnpm check` are green under Node 24. GitHub CI should be treated as the full-suite truth source for this PR.
