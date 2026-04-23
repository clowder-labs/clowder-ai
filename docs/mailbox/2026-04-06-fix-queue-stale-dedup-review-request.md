# Review Request: hasQueuedAgentForCat stale zombie defense

Review-Target-ID: fix-queue-stale-dedup
Branch: feat/fix-queue-stale-dedup

## What

`InvocationQueue.hasQueuedAgentForCat()` 增加 60s stale 阈值防御，与 `hasActiveOrQueuedAgentForCat()` 行为对齐。附 DIAG 日志记录 stale 跳过事件。

变更文件（2 files, +48/-2）：
- `packages/api/src/.../InvocationQueue.ts` — stale threshold + DIAG log
- `packages/api/test/invocation-queue.test.js` — +1 test case

## Why

`hasQueuedAgentForCat()` 被 `callback-a2a-trigger.ts:102` 用于 A2A 去重。但它**没有 stale 阈值**——而同文件的 `hasActiveOrQueuedAgentForCat()` 有 60s/600s 防御。

这导致：一次失败/取消的 invocation 留下僵尸 queued 条目 → 后续该 cat 的所有 @mention 被永久静默拦截 → 只有服务重启才能恢复。

## Original Requirements（必填）

> 这个砚砚 thread id thread_mnn6uo92lgz3xdtj 很奇怪。智能体咖啡喊他没反应，但是我取消掉智能体咖啡的调用去codex resume 他是可以resume 且还可以和我交互的！！
> 智能体咖啡重启之后那个session的砚砚能调度了。之前智能体咖啡没重启的时候那个砚砚怎么at都at不出来

- 来源：thread_mnn6uo92lgz3xdtj（2026-04-06 实时调试）
- **请对照上面的摘录判断：修复后是否能消除"@不出来，重启才恢复"的现象**

## Tradeoff

只修了去重路径的放大器（P0），没有追查首次 invocation 挂起的根因（P1）。首次挂起可能是 codex CLI 首帧卡住、approval 阻塞等——这些是独立问题，不影响本次修复的正确性。

## Open Questions

1. **stale 条目是否应该被主动清理？** 当前只是"忽略"，不从 Map 中删除。是否需要定时 GC？
2. **cancel 路径的清理完整性**：砚砚 review 时请关注 `cancel_invocation` → `InvocationTracker.complete()` → `QueueProcessor.onInvocationComplete()` 这条链路，是否有分支漏了 `InvocationQueue.remove()` 或 `processingSlots.delete()`？这可能是产生僵尸条目的直接原因。

## Next Action

请 @codex / @gpt52 review 代码正确性 + 上述 Open Questions。

## 自检证据

### Spec 合规
- 用户需求：@猫名不再因僵尸队列条目永久失联 ✅
- 重启不再是唯一恢复手段 ✅
- 与 hasActiveOrQueuedAgentForCat 行为对称 ✅

### 测试结果
- invocation-queue.test.js → 58/58 pass, 0 failed ✅
- callback-a2a-trigger tests → 34/34 pass ✅
- queue-processor + invocation-tracker → 99/99 pass ✅
- biome check (changed files) → 0 errors ✅
- tsc errors → 全部 pre-existing（GeminiAcpAdapter/ws），InvocationQueue 0 errors ✅

### 相关文档
- 无独立 Feature/ADR（bug fix from live debugging）
