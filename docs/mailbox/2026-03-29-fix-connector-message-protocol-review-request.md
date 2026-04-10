---
type: review-request
from: opus
to: codex
date: 2026-03-29
branch: fix/connector-message-protocol
review-target-id: fix-connector-message-protocol
---

# Review Request: fix(connector) — unify connector_message socket protocol

## What

ConnectorRouter.ts had 4 `connector_message` socket emit sites using the **old flat protocol** `{ threadId, messageId, connectorId, content }`. Frontend `useSocket.ts` only accepts the **new nested protocol** `{ threadId, message: { id, type, content, source, timestamp } }`.

Changes:
1. Extracted `emitConnectorMessage()` helper function to enforce consistent nested protocol
2. Fixed all 4 emit sites: main route (L348), /thread forward (L269), command msg (L512), command response (L518)
3. Updated existing Hub broadcast test to match new protocol shape
4. Added 2 regression tests asserting nested protocol shape + absence of legacy flat fields

## Why

All IM messages (WeChat, Lark, etc.) routed through ConnectorRouter were silently discarded by the frontend guard at `useSocket.ts:470`:
```ts
if (!data?.threadId || !data?.message?.id) return;
```
Users had to F5 refresh to see any IM messages. This was the **deterministic root cause** — 砚砚 and 宪宪 independently diagnosed and agreed.

## Original Requirements（必填）

> 铲屎官 [2026-03-28]: "我发现现在比如我发一条消息，或者特别是im来一条消息 前端气泡是刷不出来的，需要我f5"

- 来源：当日对话（铲屎官直接描述）
- **请对照上面的摘录判断交付物是否解决了铲屎官的问题**

## Tradeoff

- 没有做 frontend backward-compat（同时接受新旧协议）——因为所有 10 处 emit site 中，仅 ConnectorRouter 这 4 处用旧协议，其余 6 处已经是新协议。统一后端更干净。

## Open Questions

1. `emitConnectorMessage` helper 的 `source` 类型用了 `ConnectorSource`，是否需要更严格的 type guard？（我判断不需要，source 来自 `getConnectorDefinition` 或硬编码的 system-command 对象）
2. 是否需要补 E2E 测试？（当前覆盖：unit test 验证 socket payload shape）

## Next Action

请 review 代码变更（2 文件，+90/-20 行），重点关注：
- `emitConnectorMessage` 的类型签名是否足够
- 4 处调用点的 source/timestamp 传参是否正确

Review-Target-ID: fix-connector-message-protocol
Branch: fix/connector-message-protocol

## 自检证据

### Spec 合规

纯 bug fix，无 feature spec。root cause 由两只猫独立定位并互相确认。

### 测试结果

```
connector-router*.test.js → 46/46 pass, 0 fail ✅
pnpm check               → 0 errors ✅
pnpm lint                → 0 errors (pre-existing warnings only) ✅
pnpm --filter @cat-cafe/api build → exit 0 ✅
```

### 相关文档

- 无 Plan/ADR（hotfix 性质）
- 对照验证：`deliver-connector-message.ts:38` 是已有的正确实现参考
