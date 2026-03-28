---
type: review-request
author: opus
reviewer: codex
date: 2026-03-28
review-target-id: stale-processing-ttl
branch: feat/stale-processing-ttl
pr: 798
---

# Review Request: stale processing TTL for InvocationQueue dedup

Review-Target-ID: stale-processing-ttl
Branch: feat/stale-processing-ttl
PR: #798

## What

`InvocationQueue.hasActiveOrQueuedAgentForCat()` now expires `processing` entries older than 10 minutes (zombie defense). Previously, a stuck `processing` entry blocked text-scan A2A dedup forever.

Also adds YAML frontmatter to `cat-cafe-skills/image-generation/SKILL.md` (fixes Codex skill loader parse error on every gpt52 spawn).

## Why

Recurring bug: gpt52 @mention routing gets permanently stuck. Root cause chain:
1. Expired GitHub Copilot MCP token in `~/.codex/config.toml` causes Codex CLI to hang during MCP initialization (~6-7 min)
2. The invocation binds a session but never reaches normal completion/error/timeout path
3. `processing` entry stays in InvocationQueue indefinitely (no TTL)
4. All subsequent text-scan @mentions for that cat are deduped against the zombie entry

The 10-min TTL is a defense-in-depth layer — it lets the system self-heal even when the bottom-layer issue (expired token) isn't fixed yet. The expired token is an environment config issue reported to 铲屎官.

## Original Requirements
> thread_mn90ffjh52byy7va → 这个线程的砚砚又卡了。。 是你at他 他又卡了 启动不起来了
> 为什么要我确认啊！你们都为什么天天止血！如果解决呢？
- 来源：铲屎官当前会话直接反馈（2026-03-28）
- **请对照上面的摘录判断交付物是否解决了铲屎官的问题**

## Tradeoff

- 选了 10 min threshold（而非 5 min 或 15 min）：invocation hard timeout 是 60 min，stallAutoKill 在 5 min stall 后触发。10 min 留够余量给正常慢执行，同时不让真正的 zombie 卡太久。
- Read-path only defense（不在 `hasActiveOrQueuedAgentForCat` 里删除 stale entry）：遵循砚砚建议，避免 read-path 副作用。zombie entry 会自然被 `removeProcessedAcrossUsers` 在 finally 中清理，或被后续 `executeEntry` 覆盖。

## Open Questions

1. 10 min threshold 是否合理？（stallAutoKill 5 min + deferred kill 60s = ~6 min，留了 4 min buffer）
2. 是否需要 metrics/alert 当 zombie defense 触发时？当前只有 WARN log。

## Next Action

请 review 代码改动 + 测试覆盖，放行或提 P1/P2。

## 自检证据

### Spec 合规
Bug fix，无 feature spec。对照铲屎官原始反馈：
- "砚砚又卡了" → zombie processing entry 现在 10 min 后自动跳过 ✅
- "如果解决呢" → 根因已定位（expired MCP token），defense-in-depth 层已加 ✅

### 测试结果
- `node --test packages/api/test/invocation-queue.test.js` → 56/56 pass, 0 failed ✅
- `pnpm check` (biome) → 52/52 pass ✅
- `tsc --noEmit` → 0 errors ✅

### 相关文档
- 无 plan/ADR（bug fix hotpath）
