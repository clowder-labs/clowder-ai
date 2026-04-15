# Review Request: relayclaw system/user prompt split

Review-Target-ID: fix-jiuwenclaw-prompt-split
Branch: fix/jiuwenclaw-prompt-split

## What

修正 relayclaw/jiuwenclaw 调用前的 prompt 分流：

- `params.query` / normal prompt 承载本轮动态编排上下文、dispatch mission、对话历史和用户任务。
- `params.system_prompt` 只承载静态身份 prompt。
- relayclaw resume 时仍传静态 `systemPrompt`，因为 jiuwen 每次请求都会重建 system messages，不会像 CLI session 那样自然保留上轮 append 的 system prompt。
- 新增 debug 日志 `RelayClaw prompt split prepared`，只输出长度和状态，不输出 prompt 原文。

变更文件：
- `packages/api/src/domains/cats/services/agents/invocation/invoke-single-cat.ts`
- `packages/api/test/invoke-single-cat.test.js`

## Why

当前实现把 `promptWithMission` 无条件拼进 relayclaw 的 `options.systemPrompt`，导致动态编排上下文、对话历史，甚至当前用户消息副本进入 jiuwen 的 system channel。

这和预期不一致：system prompt 应该基本稳定，除非成员/身份/治理配置变化；本轮任务和历史上下文应属于普通 prompt/query。

## Original Requirements

来源：当前调试 thread（2026-04-15 铲屎官实时要求）

> 这里的用户提示词和系统提示词的逻辑不对吧；这个基于main分支新建一个分支；然后改改吧；这里可以参考其他的client 比如claude的逻辑
> 另外改完加一个debug基本的日志吧；期望我通过源码启动然后通过。LOG_LEVEL=debug pnpm start:direct就能看到的
> 改完找布偶猫来review下的

请 reviewer 对照判断：system/user prompt 分界是否恢复正确，debug 日志是否足够排查且不泄露 prompt 原文。

## Tradeoff

放弃了旧行为里“relayclaw query 只放干净用户任务”的取舍。这个旧取舍会把动态上下文转移到 system channel，边界更差。

新的取舍是：query 可能较长，但语义正确；system_prompt 稳定且只承载身份/治理类静态内容。

## Open Questions

1. relayclaw 的 `params.userPrompt` 当前在 provider split 后不再用于 `query`。是否还需要保留这个字段给后续日志/审计，还是可以进一步收窄调用参数？
2. jiuwen 是否应新增独立 `request_context` 字段，长期替代把动态上下文放入 `query` 的做法？本次没有改协议，只修当前错误边界。

## Next Action

请 @opus review：
- prompt 分流逻辑是否和 Claude/Codex 类客户端一致。
- relayclaw resume 时持续传静态 `systemPrompt` 是否符合 jiuwen 的 system message 重建机制。
- debug 日志字段是否够用、是否存在敏感内容风险。

## 自检证据

### Targeted tests

```text
pnpm --filter @office-claw/api run build &&
CAT_CAFE_DISABLE_SHARED_STATE_PREFLIGHT=1 node --test --test-name-pattern "keeps relayclaw orchestration|keeps relayclaw static" packages/api/test/invoke-single-cat.test.js

tests 2
pass 2
fail 0
```

```text
CAT_CAFE_DISABLE_SHARED_STATE_PREFLIGHT=1 node --test --test-name-pattern "reuses provided cliSessionId|derives a stable relayclaw sessionId|extracts token usage" packages/api/test/relayclaw-agent-service.test.js

tests 3
pass 3
fail 0
```

### Build / hygiene

```text
pnpm --filter @office-claw/api run build
exit 0
```

```text
git diff --check
exit 0
```

```text
Root media/design artifacts:
git status --short | rg '^.. [^/]+\.(png|jpe?g|webp|gif|webm|mp4|mov|wav|pdf|pen)$' || true
git diff --name-only origin/main...HEAD | rg '^[^/]+\.(png|jpe?g|webp|gif|webm|mp4|mov|wav|pdf|pen)$' || true
no output
```

### Known non-blocking check note

`pnpm exec biome check` on the two touched files reports pre-existing complexity/import findings in `invoke-single-cat.ts` and `invoke-single-cat.test.js`; no auto-fix was applied to avoid unrelated churn.
