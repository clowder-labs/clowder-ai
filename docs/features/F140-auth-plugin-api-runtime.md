---
feature_ids: [F140]
related_features: [F032, F077]
topics: [auth, plugin-api, session, security, provider]
doc_kind: spec
created: 2026-04-08
---

# F140: Auth Plugin API & Provider Runtime

> **Status**: spec | **Owner**: Maine Coon (gpt52) | **Priority**: P1

## Why

team lead 明确要求把当前 Huawei 专用登录改造成**可插拔的 auth 插件体系**：默认 `no-auth`，第三方 provider 可独立开发并集成，主项目通过 `.env` 选择 active provider，业务层不感知 provider，统一由拦截器和 session 生命周期处理认证。

当前实现的问题是：登录协议、session、业务副作用和 `X-Cat-Cafe-User` 身份语义揉在一起，导致接入新 provider 时边界不清、流程不统一、身份来源不可信。F140 的目标是把 auth 做成“框架 + 插件”结构：平台负责统一生命周期和鉴权，provider 只负责凭证到身份的转换。

## What

### Phase A: Plugin API 契约层与 Provider Runtime 基座

建立统一 `plugin-api` 契约层，作为第三方 provider 的唯一对接面；不再采用“一能力一个 types 包”的碎片化方案。Auth 作为第一个 plugin extension point 落入 `plugin-api`，并同时提供 provider registry、active provider 选择和外部模块动态加载的运行时基座。

这一阶段的目标不是做完整 auth 流，而是把**边界**定死：provider ID 是运行时字符串；provider 契约与主业务解耦；主项目以 `plugin-api` + runtime loader 的方式接受第三方 auth 模块。

### Phase B: SessionAuthority + Middleware + 统一 AuthContext

建立平台统一的 `SessionAuthority`、`SessionStore` 和 `AuthMiddleware`。认证成功后，平台签发 opaque session credential；后续所有请求都通过统一 middleware 解析 `request.auth`，不再允许 `X-Cat-Cafe-User`、query `userId` 或 localStorage userId 直接承担认证语义。

这一阶段会把 `AuthContext` 定成最小四字段：`userId / sessionId / providerId / authenticated`。`providerState` 作为 opaque data 存在 session 内，由 provider 自己解释，但不能泄漏到 AuthContext 或业务层。

### Phase C: 同构登录流程、UI 与兼容迁移

前端登录入口改为由 provider `presentation` 驱动，支持 `auto / form / redirect` 三类模式。`no-auth` 与正常 auth 在接口层完全同构，只允许实现不同；Huawei MaaS 初始化改为 provider 声明、平台触发的 `postLoginInit`，失败不回滚认证成功。

这一阶段还负责兼容迁移：保留现有 `/api/islogin`、`/api/login`、`/api/logout` 的外壳兼容层，同时引入统一 `/api/auth/session` 等新入口，并逐步移除旧身份路径中的不可信语义。

## Acceptance Criteria

### Phase A（Plugin API 契约层与 Provider Runtime 基座）
- [ ] AC-A1: `plugin-api` 作为统一插件契约层落地，auth 成为其第一个 extension point，而不是单独的 `auth-types` 小包。
- [ ] AC-A2: active provider 通过 `.env` 选择，provider ID 为运行时字符串，平台侧无 union / switch / provider 名硬编码。
- [ ] AC-A3: 第三方 auth provider 可通过独立模块接入，并由 runtime loader 动态加载注册。
- [ ] AC-A4: 内建 `no-auth` 与 `huawei-iam` 都遵守同一 provider 契约。

### Phase B（SessionAuthority + Middleware + 统一 AuthContext）
- [ ] AC-B1: 平台统一签发 opaque session credential，`SessionAuthority` 成为唯一身份真相源。
- [ ] AC-B2: 全局 middleware 为所有受保护请求构建 `request.auth`，业务层不再从 header/query/localStorage 直接认身份。
- [ ] AC-B3: `AuthContext` 由平台构建，且仅包含 `userId / sessionId / providerId / authenticated` 四字段。
- [ ] AC-B4: `providerState` 仅存在于 session 内部，不泄漏到 AuthContext 或默认业务路径。
- [ ] AC-B5: session 过期判定在 store/middleware 内部统一处理，不依赖消费方各自自保。

### Phase C（同构登录流程、UI 与兼容迁移）
- [ ] AC-C1: `no-auth`、表单类 provider、跳转类 provider 走统一生命周期，只允许 provider 实现不同。
- [ ] AC-C2: provider `presentation` 驱动前端登录 UI，不再硬编码 Huawei 专用页面。
- [ ] AC-C3: Huawei MaaS 初始化通过 `postLoginInit` 机制挂入，遵守“provider 声明、平台触发、失败不回滚认证”的规则。
- [ ] AC-C4: 旧接口保留兼容外壳，新入口以 `/api/auth/session` 为统一查询面。
- [ ] AC-C5: `X-Cat-Cafe-User` 从认证路径退役为非凭证字段。

## 需求点 Checklist

| ID | 需求点（铲屎官原话/转述） | AC 编号 | 验证方式 | 状态 |
|----|---------------------------|---------|----------|------|
| R1 | “默认是 no-auth；不做登录直接进主页，但流程还是一致” | AC-A4, AC-C1 | manual + test | [ ] |
| R2 | “第三方实现自己的登录模块，集成后通过 .env 切换就能用” | AC-A1, AC-A2, AC-A3 | test + doc review | [ ] |
| R3 | “业务层不应该感知 provider；后端统一拦截器处理” | AC-B1, AC-B2, AC-B3 | test + code review | [ ] |
| R4 | “Huawei MaaS 这种应该是 Huawei 自己要做的事儿” | AC-C3 | test + code review | [ ] |
| R5 | “不要一个能力一个 types 包，直接按 plugin-api 做” | AC-A1 | doc review | [ ] |
| R6 | “X-Cat-Cafe-User 这个不能直接当登录凭证” | AC-B1, AC-C5 | test + code review | [ ] |

### 覆盖检查
- [ ] 每个需求点都能映射到至少一个 AC
- [ ] 每个 AC 都有验证方式
- [ ] 前端需求已准备需求→证据映射表（若适用）

## Dependencies

- **Evolved from**: —
- **Blocked by**: —
- **Related**: F032（插件/registry 架构心智） / F077（多用户安全身份与 session 真相源）

## Risk

| 风险 | 缓解 |
|------|------|
| 把 `shared` 和 `plugin-api` 边界混写，后续再次搬家 | 从 kickoff 起明确 `plugin-api` 是对外契约层，`shared` 只放内部共享类型 |
| Huawei 现有逻辑与统一生命周期耦太深，迁移中容易“边拆边穿透” | 先把 10 条硬约束写入 feature doc 和 plan，再按 phase 拆迁移 |
| 旧接口兼容期过长，导致双轨身份路径长期并存 | 在 Phase C 明确兼容只作为外壳，认证真相源一律迁到 SessionAuthority |
| 后续接入更多 provider 时又把 provider-specific 数据塞进业务层 | 把 `providerState` opaque + `AuthContext` 最小四字段写成硬约束并用 review gate 守住 |

## Open Questions

| # | 问题 | 状态 |
|---|------|------|
| OQ-1 | v1 是否只支持纯内存 session，重启恢复延后到后续 phase？ | ⬜ 未定 |

## Key Decisions

| # | 决策 | 理由 | 日期 |
|---|------|------|------|
| KD-1 | auth 契约直接走统一 `plugin-api`，不做 `auth-types` 单独小包 | 避免未来一个能力一个包的碎片化管理 | 2026-04-08 |
| KD-2 | active provider 通过 `.env` 选择，provider ID 是运行时字符串 | 第三方接入不需要平台改 union / 枚举 | 2026-04-08 |
| KD-3 | `X-Cat-Cafe-User` 退役为非凭证字段 | 明文 userId 不能承担认证语义 | 2026-04-08 |
| KD-4 | `AuthContext` 由平台构建且保持最小四字段 | 保证 provider 细节不泄漏到业务层 | 2026-04-08 |
| KD-5 | `postLoginInit` 采用“provider 声明、平台触发、失败不回滚认证” | 统一生命周期，同时保留 provider 专属初始化 | 2026-04-08 |

## Timeline

| 日期 | 事件 |
|------|------|
| 2026-04-08 | 立项，确认 `plugin-api + auth runtime` 方向 |

## Review Gate

- Phase A: 架构与契约边界由 Ragdoll / Maine Coon 交叉确认
- Phase B: 安全与身份真相源由 Maine Coon 守门
- Phase C: 前端流程与兼容迁移需要团队实测登录流

## Links

| 类型 | 路径 | 说明 |
|------|------|------|
| **Feature** | `docs/features/F140-auth-plugin-api-runtime.md` | 本 feature 真相源 |
| **Plan** | `docs/plans/2026-04-08-auth-provider-abstraction.md` | F140 的实施计划 |
| **Discussion** | `docs/discussions/2026-04-08-auth-plugin-api-runtime-convergence.md` | 多猫讨论后的定案收敛记录 |
