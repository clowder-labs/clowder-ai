# Review Request: hotfix reminder SOP registration

Review-Target-ID: fix-hotfix-reminder-sop
Branch: fix/hotfix-reminder-sop
PR: https://github.com/clowder-labs/clowder-ai/pull/92
Head: use PR #92 current head; the routing message supplies the exact SHA.

## What

- Updated schedule MCP descriptions to distinguish user-requested schedules from the one trusted workflow-mandated exception.
- Updated `schedule-tasks` so ordinary user schedules still require preview and confirmation, while only trusted built-in canonical `merge-gate` Step 7.6 may register after preview verification.
- Added schedule registration idempotency for workflow replay safety: stable `idempotencyKey` values dedupe callback retries to the existing dynamic task.
- Added a `tips_exempt` frontmatter note because this is an internal SOP/MCP workflow clarification, not a new end-user capability.
- Updated `merge-gate` Step 7.6 so hotfix 14-day upgrade reminders must preview, verify draft fields, then register with no extra user confirmation and a repo+PR-scoped stable `idempotencyKey`.
- Added MCP/API regression tests for tool descriptions, skill docs, idempotency-key passthrough, persistent dedupe, and replay behavior.

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

The API change is additive: callers without `idempotencyKey` keep the existing create-new-task behavior. Callers with a stable key get replay-safe dedupe and receive the existing task id on retry.

## Architecture Ownership

Architecture cell: workflow / MCP collab schedule surface + scheduler persistence
Map delta: none
Why: This extends the existing schedule route and `DynamicTaskStore` with an idempotency column/index; it does not add a new Store, Queue, Router, Adapter, Dispatcher, Binding, or runtime ownership boundary.

Reviewer checks:

- Verify `Map delta: none` matches the diff.
- Verify the exception cannot be read as bypassing user confirmation for ordinary user-requested schedules.
- Verify plugin/project/user/external skills are excluded from the no-extra-confirmation exception.
- Verify schedule registration retry with the same `idempotencyKey` cannot create duplicate reminders.
- Verify `merge-gate` Step 7.6 is actionable and fail-closed.

## Open Questions

### 技术 OQ

- Is the trusted built-in canonical `merge-gate` Step 7.6 boundary tight enough to prevent workflow-mandated from becoming a blanket bypass?
- Is global uniqueness on stable workflow `idempotencyKey` sufficient, given keys are explicitly namespaced by workflow + repo + PR?

### 价值 OQ

无。

## Next Action

Please review PR #92 against its current head. Focus on the trusted workflow boundary, merge-gate hotfix reminder flow, idempotent registration replay, and whether the regression tests protect the right surfaces.

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
- 修复：preview remains mandatory; confirmation remains mandatory for user-requested schedules; only built-in canonical `merge-gate` Step 7.6 hotfix reminder can register after verified preview with no extra confirmation; register retries are deduped by stable `idempotencyKey`.
- Dogfood scope: exempt. This is an internal SOP/tool-description fix with no user-facing runtime path.
- Artifact hygiene: root media/design artifact checks returned no matches.

### 测试结果

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter @cat-cafe/mcp-server test -- --test-name-pattern "workflow-mandated|cat_cafe_register_scheduled_task"
# passed: 385 tests, 0 failed

node --test packages/api/test/scheduler/dynamic-task-store.test.js --test-name-pattern "idempotency|columns"
# passed: 13 tests, 0 failed

node --test packages/api/test/schedule-route.test.js --test-name-pattern "idempotent workflow registration"
# passed: 37 tests, 0 failed

PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm check:skills:manifest
# passed: 48 skills validated; existing advisory warnings only

PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm check:skills:surfaces
# passed: 11 tests, no raw first-party Hub/API curl main paths

PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm check
# passed

git diff --check
# passed
```

### Local Caveat

`pnpm check:skills` is blocked in this local worktree by missing provider skill mounts. `pnpm sync:skills --dry-run` would touch 34 worktrees, so I did not apply that environment repair in this PR.

`pnpm --filter @cat-cafe/api test` did not produce a usable local full-suite green: the default Node 22 run violates the package `>=24` engine and failed in unrelated `capabilities-route` tests; the Node 24 rerun still mixed the same unrelated capability assertions with a local `better-sqlite3` native ABI mismatch. Focused schedule/API tests, `pnpm check`, and `@cat-cafe/api build` are green above; GitHub CI should be treated as the full-suite truth source for this PR.
