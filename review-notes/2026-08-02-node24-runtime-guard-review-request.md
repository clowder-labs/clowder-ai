# Review Request: Node 24 Runtime Guard for Direct Validation Scripts

Review-Target-ID: fix-node24-runtime-guard
Branch: fix/node24-runtime-guard
Commit: de99ff6c9b3c6297c3a08a0149749e68d2a89bad
Worktree: `/Users/xxx/workspace/AI/cat-cafe-node24-runtime-guard`

## What

Added a cross-platform validation wrapper, `scripts/check-validation-node-runtime.mjs`, and wired it into root/package `prebuild`, `pretest`, `prelint`, plus root `precheck`/`pregate`.

The existing install-time guard still rejects `NODE_ENV=production` for installs. Direct validation scripts now skip only that install-specific check while keeping the Node major check, so unsupported Node versions fail before running package work.

## Why

The 2026-08-02 scheduled patrol reproduced a false-negative path: `pnpm --filter @cat-cafe/mcp-server test ...` under default Node v22.22.3 ran part of the suite and ended with cancelled tests, while the same command under Node v24.18.0 passed. The repo already declares `engines.node >=24`, but pnpm only warned during direct package scripts.

## Original Requirements

> 每轮必须先查真相源和证据，再给风险/价值判断与下一步动作。发现可执行事项后主导闭环：按家规走 feature lifecycle（定位真相源、立项、实现/协调、质量门禁、review、完成记录）。

- 来源：scheduled patrol dispatch in `thread_mqcj45byxoka2z7u`, 2026-08-02 00:00 Asia/Shanghai
- Task: `0001785600245033-001028-850d142c` (`[巡检] 固化 Cat Cafe 验证命令的 Node 24 运行时`)
- Please judge whether this closes the patrol finding without over-expanding runtime/tooling scope.

## Tradeoff

I did not add a new dependency such as `cross-env`, and I did not change install semantics. A small Node wrapper avoids POSIX-only `VAR=1 node ...` scripts and keeps Windows package-script compatibility.

This is fail-fast, not auto-reexec, for package validation scripts. Startup scripts already have reexec behavior through `scripts/lib/node-runtime-guard.sh`; package scripts should be deterministic and explicit when the shell runtime is wrong.

## Architecture Ownership

Architecture cell: harness-eval
Map delta: none
Why: This only extends validation/preflight harness behavior around existing package scripts and the existing Node runtime guard. It does not add a new Store, Queue, Router, Adapter, Dispatcher, Binding, service boundary, or runtime ownership cell.

Please reviewer-check that `Map delta: none` matches the diff and that package lifecycle hooks do not create a parallel tooling/runtime control plane.

## Open Questions

### 技术 OQ（给 reviewer）

1. Is `CAT_CAFE_SKIP_PRODUCTION_INSTALL_GUARD` scoped narrowly enough, or should the wrapper use a more validation-specific API to avoid future misuse?
2. Are the selected lifecycle hooks sufficient: root `build/test/lint/check/gate` and package `build/test/lint` for api/mcp/shared/web?
3. Any concern that package `pre*` hooks create surprising behavior for downstream/open-source users?

### 价值 OQ（给 operator，如有）

无。

## Next Action

Please review commit `de99ff6c9b3c6297c3a08a0149749e68d2a89bad` in `/Users/xxx/workspace/AI/cat-cafe-node24-runtime-guard`.

Verdict requested: APPROVE or REQUEST-CHANGES. No GitHub PR exists yet; if approved, I will open/push the PR or continue merge-gate according to the current house flow.

## Review Sandbox

- Path: `/tmp/cat-cafe-review/fix-node24-runtime-guard/sol` (or reviewer handle)
- Start Command: not needed; no runtime/server changes
- Ports: not applicable

### Sandbox Bootstrap

```bash
unset NODE_ENV
PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm install --frozen-lockfile
```

## Self-Check Evidence

### Spec 合规

- Patrol finding reproduced under default Node v22.22.3.
- Red test added first in `scripts/node-runtime-guard.test.mjs`; it failed on missing lifecycle guards.
- Implementation adds validation wrapper and lifecycle hooks.
- Dogfood verified default Node v22 now fails fast before test execution, while Node v24 executes the focused mcp suite.
- No frontend/runtime server change; no browser evidence required.
- Root artifact hygiene: both root media checks returned no matches.

### Test Results

```bash
PATH="/opt/homebrew/opt/node@24/bin:$PATH" node --test scripts/node-runtime-guard.test.mjs
# 14 pass / 0 fail / 0 cancelled

pnpm --filter @cat-cafe/mcp-server test -- --test-name-pattern "workflow-mandated|cat_cafe_register_scheduled_task"
# Expected fail-fast on Node v22.22.3:
# [node-runtime] Node 22.22.3 is not supported...

PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm --filter @cat-cafe/mcp-server test -- --test-name-pattern "workflow-mandated|cat_cafe_register_scheduled_task"
# 381 pass / 0 fail / 0 cancelled

PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm check
# PASS; advisory warnings only from existing capability-tip / skill manifest checks

PATH="/opt/homebrew/opt/node@24/bin:$PATH" pnpm -r --workspace-concurrency=1 --if-present run prebuild
# PASS; web vendor asset sync preserved

git diff --check
# PASS
```

### Root Artifact Hygiene

```bash
git status --short | rg '^.. [^/]+\.(png|jpe?g|webp|gif|webm|mp4|mov|wav|pdf|pen)$'
# no output

git diff --name-only origin/develop...HEAD | rg '^[^/]+\.(png|jpe?g|webp|gif|webm|mp4|mov|wav|pdf|pen)$'
# no output
```

### Related Evidence

- Existing root guard: `scripts/check-node-runtime.mjs`
- New validation wrapper: `scripts/check-validation-node-runtime.mjs`
- Regression coverage: `scripts/node-runtime-guard.test.mjs`

[砚砚/gpt-5.5🐾]
