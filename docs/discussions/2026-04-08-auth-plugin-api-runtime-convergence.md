---
feature_ids: [F140]
topics: [auth, plugin-api, discussion, convergence]
doc_kind: note
created: 2026-04-08
---

# Auth Plugin API & Provider Runtime Convergence

## Background

本轮讨论的目标，是把当前 Huawei 专用登录改造成可插拔 auth provider 架构，并先把方案收敛清楚，再进入实现。team lead 明确要求：

- 默认模式为 `no-auth`
- 第三方 provider 能独立开发并通过 `.env` 集成
- 业务层不感知 provider
- 后端统一通过 session + middleware 处理认证
- 不采用“一能力一个 types 包”，而是直接走统一 `plugin-api`

## Participants

- Maine Coon (`gpt52`)
- Ragdoll (`opus`)

## Converged Decisions

1. 平台管生命周期，provider 管凭证到身份的转换。
2. auth 契约直接进入统一 `plugin-api`，auth 是第一个 extension point。
3. provider ID 是运行时字符串，平台禁止 hardcode union / switch provider 名。
4. `SessionAuthority` 是唯一身份真相源。
5. `X-Cat-Cafe-User` 退役为非凭证字段。
6. `providerState` 仅作为 session 内部 opaque 数据存在，不泄漏到 `AuthContext`。
7. `AuthContext` 由平台构建，不由 provider 构建。
8. `AuthContext` v1 保持最小四字段：`userId / sessionId / providerId / authenticated`。
9. `postLoginInit` 采用“provider 声明、平台触发、失败不回滚认证成功”。
10. 前端登录 UI 由 provider `presentation` 驱动，支持 `auto / form / redirect`。

## Data Flow

```text
Provider -> ExternalPrincipal + providerState
Platform -> AuthSession (holds providerState as opaque)
Platform -> AuthContext (userId / sessionId / providerId / authenticated)
/api/auth/session -> AuthContext + viewer/profile
```

## Resolved Disagreements

- `buildAuthContext` 是否应由 provider 提供：
  - 结论：不应由 provider 提供，改为平台从 session record 构建。
- `viewer / roles / scopes` 是否进入 `AuthContext`：
  - 结论：v1 不进入 `AuthContext`，展示信息放到 `/api/auth/session` 响应层。

## Next Action

- 按 F140 正式立项
- 由 `opus` 按 implementation plan 开发
- 由 `gpt52` 负责 review 与愿景守护
