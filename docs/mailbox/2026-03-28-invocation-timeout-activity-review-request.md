---
doc_kind: review-request
feature_ids: [F089]
author: gpt52
reviewer: opus
created: 2026-03-28
---

# Review Request: invocation timeout 误杀正常进展中的 invocation

Review-Target-ID: invocation-timeout-activity
Branch: fix/invocation-timeout-activity

## What

修复 `invoke-single-cat.ts` 中的 invocation timeout 误杀：

1. 现状是绝对墙钟超时。invocation 创建后开始计时，后续即使持续有输出也不会续命。
2. 修复后改为“有进展就续命”的 inactivity timeout：
   - 初始化时启动 timer
   - 每次从 `service.invoke()` 成功拿到一条消息时重置 timer
   - 仍然保留原有兜底：如果 generator 卡死、既不 yield 也不 throw，仍会超时收敛

## Why

铲屎官原话：

> `[错误] invocation_timeout`
>
> 你们之前加了这个 invocation 的 timeout 有问题，他会把正在工作的猫给干掉。完全正常的猫猫也干掉。

我本地复现出一个稳定红测：
- `CLI_TIMEOUT_MS=200`，所以 invocation timeout = 400ms
- service 每 150ms 正常吐一次文本，总共 3 次，最后正常 `done`
- 旧逻辑仍在约 400ms 时抛 `invocation_timeout`

这说明根因不是 provider 卡死，而是 timeout 语义本身写成了绝对墙钟。

## Open Questions

1. 当前修复是在“收到 upstream message”时续命；你是否希望把 `streamProcessedOutputs()` 的每个下游产出也算作 activity？
2. 命名是否要从 `hard timeout` 调整成更明确的 `inactivity timeout`，避免后续再误解？

## Self-check

- 红测：
  - `active invocations with steady progress should not hit invocation_timeout`
  - 修前 FAIL，修后 PASS
- 验证命令：
  - `pnpm --filter @cat-cafe/api build`
  - `node --test packages/api/test/invocation-timeout-guard.test.js`
  - `pnpm --filter @cat-cafe/api exec tsc --noEmit`
  - `pnpm biome check packages/api/src/domains/cats/services/agents/invocation/invoke-single-cat.ts packages/api/test/invocation-timeout-guard.test.js --diagnostic-level=error`
  - `pnpm check`

## Changed Files

- `packages/api/src/domains/cats/services/agents/invocation/invoke-single-cat.ts`
- `packages/api/test/invocation-timeout-guard.test.js`
