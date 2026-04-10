---
type: review-request
date: 2026-03-27
author: opus
branch: worktree-fix+774-stall-auto-kill
issue: 774
review-target-id: fix-774-stall-auto-kill
---

# Review Request: #774 stallAutoKill — idle-silent stall fast-fail

## What
在 `cli-spawn.ts` 主循环中，当 liveness probe 检测到 `suspected_stall` + `idle-silent` 状态时，立即 SIGTERM 进程并 yield `__cliTimeout`（带 `stallKill: true` 标志）。将 Codex 的 30 分钟静默超时缩短为 ~5 分钟快速失败。

**变更范围 (5 files, +168 -5)**:
- `cli-types.ts` — 新增 `stallAutoKill?: boolean` 配置
- `services/types.ts` — 同步新增 `stallAutoKill` 类型
- `cli-spawn.ts` — 主循环 drain warning 时检测 stall + auto-kill + 丰富 `__cliTimeout` 消息
- `invoke-single-cat.ts` — 全局启用 `stallAutoKill: true`
- `cli-spawn.test.js` — 3 个回归测试

## Why
Codex CLI 间歇性在 `turn.started` 后静默 30 分钟。根因：OpenAI API 响应流 hang，Codex CLI 无内置超时。Cat Café 的 liveness probe 在 ~5 分钟就检测到 idle-silent stall，但只报告不行动。唯一安全网是 30 分钟超时。

6 个真实超时样本（3/24-3/27），全部 processAlive=true + CPU flat + idle-silent。同期 Claude 零超时。

## Original Requirements（必填）
> @opus 你看现在砚砚还有这样的bug 很奇怪 比如你at 他 竟然没生效 ，然后截图是第二种！你at 他 他没任何反应直到 30分钟超时
> @opus 你可以现在开个新的issue好好排查一下 最好拉上砚砚一起
- 来源：铲屎官 2026-03-27 00:53 / 01:10 消息
- **请对照上面的摘录判断：30 分钟超时是否被有效缩短**

## Tradeoff
- **未做 retry**：stall-kill 后的自动重试是更大的变更（涉及 QueueProcessor 状态机），留后续 PR。当前用户需手动重新 @ 猫猫。
- **全局启用而非 per-provider**：数据显示 Claude CLI 永远不进 idle-silent（stderr thinking 持续触发 probe activity），所以全局启用不影响 Claude。测试 #3 验证了这一点。

## Open Questions
1. `stallWarningMs` 默认 300s (5 min) 是否合适？太短可能误杀正常但慢的上游 API。
2. 后续 retry PR 的优先级？

## Next Action
Review-Target-ID: fix-774-stall-auto-kill
Branch: worktree-fix+774-stall-auto-kill

请 review 以下重点：
- `cli-spawn.ts:208-220` stall detection + kill 逻辑
- `cli-spawn.ts:320-333` `__cliTimeout` 丰富字段
- 测试覆盖是否充分

## 自检证据

### Spec 合规
Bug fix，无 spec/plan。Issue #774 描述的修复方案已实现。

### 测试结果
```
node --test cli-spawn.test.js process-liveness-probe.test.js queue-processor.test.js
  → 100/100 pass, 0 failed ✅
pnpm lint → 0 errors ✅
pnpm biome check --diagnostic-level=error → 0 errors ✅
pnpm --filter @cat-cafe/api exec tsc --noEmit → exit 0 ✅
```

### 相关文档
- Issue: #774
- Joint investigation: #774 comment (缅因猫 + 布偶猫联合排查)
- Related: #768 (phantom replying, already fixed via PR #769)
