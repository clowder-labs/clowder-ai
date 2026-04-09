---
feature_ids: [F140]
related_features: [F032, F077]
topics: [auth, plugin-api, session, security, provider]
doc_kind: spec
created: 2026-04-08
---

# F140: Auth Plugin API & Provider Runtime

> **Status**: in-progress | **Owner**: Maine Coon (gpt52) | **Priority**: P1

## Why

team lead 明确要求把当前 Huawei 专用登录改造成**可插拔的 auth 插件体系**：默认 `no-auth`，第三方 provider 可独立开发并集成，主项目通过 `.env` 选择 active provider，业务层不感知 provider，统一由拦截器和 session 生命周期处理认证。

当前实现的问题是：登录协议、session、业务副作用和 `X-Cat-Cafe-User` 身份语义揉在一起，导致接入新 provider 时边界不清、流程不统一、身份来源不可信。F140 的目标是把 auth 做成”框架 + 插件”结构：平台负责统一生命周期和鉴权，provider 只负责凭证到身份的转换。

**铲屎官最终验收标准（2026-04-08 19:42 明确，2026-04-09 设计收敛后修订）**：
1. `no-auth` 和 `huawei-iam` 是**独立可管理**的 provider module（内建，在主仓维护）
2. 主项目通过 `.env` 启用某个 auth module，重启后自动生效
3. 启用哪个 module 就自动得到对应的**前后端完整效果**（no-auth=无登录页，huawei-iam=当前登录体验）
4. `@cat-cafe/plugin-api/auth` 作为对外唯一稳定入口（内部 contract 层，不单独发 npm）
5. 有完整的**插件开发文档**，第三方在独立仓库开发 → 打包发布 → 主项目安装+配 env+重启 → 可用

## What

### Phase A: Plugin API 契约层与 Provider Runtime 基座 ✅

建立统一 `plugin-api` 契约层，作为第三方 provider 的唯一对接面；不再采用”一能力一个 types 包”的碎片化方案。Auth 作为第一个 plugin extension point 落入 `plugin-api`，并同时提供 provider registry、active provider 选择和外部模块动态加载的运行时基座。

这一阶段的目标不是做完整 auth 流，而是把**边界**定死：provider ID 是运行时字符串；provider 契约与主业务解耦；主项目以 `plugin-api` + runtime loader 的方式接受第三方 auth 模块。

### Phase B: SessionAuthority + Middleware + 统一 AuthContext ✅

建立平台统一的 `SessionAuthority`、`SessionStore` 和 `AuthMiddleware`。认证成功后，平台签发 opaque session credential；后续所有请求都通过统一 middleware 解析 `request.auth`，不再允许 `X-Cat-Cafe-User`、query `userId` 或 localStorage userId 直接承担认证语义。

这一阶段会把 `AuthContext` 定成最小四字段：`userId / sessionId / providerId / authenticated`。`providerState` 作为 opaque data 存在 session 内，由 provider 自己解释，但不能泄漏到 AuthContext 或业务层。

### Phase C: 同构登录流程、UI 与兼容迁移 ✅

前端登录入口改为由 provider `presentation` 驱动，支持 `auto / form / redirect` 三类模式。`no-auth` 与正常 auth 在接口层完全同构，只允许实现不同；Huawei MaaS 初始化改为 provider 声明、平台触发的 `postLoginInit`，失败不回滚认证成功。

这一阶段还负责兼容迁移：保留现有 `/api/islogin`、`/api/login`、`/api/logout` 的外壳兼容层，同时引入统一 `/api/auth/session` 等新入口，并逐步移除旧身份路径中的不可信语义。

### Phase D: 外部 Provider 接入机制与架构文档

将已有的 provider 运行时基座（registry + module loader + config select）正式化为**对外开放的扩展模型**。核心设计收敛于 2026-04-08 讨论（见 `docs/architecture/auth-provider-extension-model.md`）：

- `@cat-cafe/plugin-api` 继续作为内部 contract 层，**不单独发布** npm 包
- 对外暴露**一个稳定的公共入口**（`@cat-cafe/plugin-api/auth` subpath export），外部 provider 只依赖这个
- 内建 `no-auth` 和 `huawei-iam` 继续在主仓库维护，**不拆为独立包**
- 外部 provider 用新 `providerId`（A-scheme），通过 `CAT_CAFE_AUTH_PROVIDER_MODULES` 注册

这一阶段的产出是架构文档 + 公共入口的稳定性保障。

### Phase E: Provider 前端 Surface 扩展

建立 provider 前端 surface 的扩展机制。当前 Phase C 已实现 `presentation` 驱动的 schema-form 模式，Phase E 扩展为更丰富的前端集成：

1. **presentation.mode 扩展**：在现有 `auto / form / redirect` 基础上，未来可选支持 `static` 模式
2. **静态资源路径映射**（参考 Java classpath resource mapping）：provider 包可选声明 web manifest，host 用 `@fastify/static` 按 manifest 挂载静态资源
3. **端到端效果**：切换 `CAT_CAFE_AUTH_PROVIDER` + 重启 → 前端登录体验自动随 provider 变化

### Phase F: 插件开发文档与端到端验证

产出两类文档，让不了解主仓库实现的开发者只看文档就能接入：

**机制文档**（`docs/architecture/auth-provider-extension-model.md` ✅ 已完成）：
- 边界、注册模型、配置语义、包边界、身份规则、反模式

**开发指南**（`docs/guides/build-auth-provider.md`）：
1. 在独立仓库创建 provider 项目
2. 依赖主项目的 `@cat-cafe/plugin-api/auth` 实现 `AuthProvider` 接口
3. 编写 provider 逻辑（authenticate、presentation、可选 hooks）
4. 打包发布到 npm
5. 在主项目中 `pnpm add` → 配置 `.env` → 重启 → 可用

端到端验证：用一个 demo provider 走完整个流程。

## Acceptance Criteria

### Phase A（Plugin API 契约层与 Provider Runtime 基座）✅
- [x] AC-A1: `plugin-api` 作为统一插件契约层落地，auth 成为其第一个 extension point，而不是单独的 `auth-types` 小包。
- [x] AC-A2: active provider 通过 `.env` 选择，provider ID 为运行时字符串，平台侧无 union / switch / provider 名硬编码。
- [x] AC-A3: 第三方 auth provider 可通过独立模块接入，并由 runtime loader 动态加载注册。
- [x] AC-A4: 内建 `no-auth` 与 `huawei-iam` 都遵守同一 provider 契约。

### Phase B（SessionAuthority + Middleware + 统一 AuthContext）✅
- [x] AC-B1: 平台统一签发 opaque session credential，`SessionAuthority` 成为唯一身份真相源。
- [x] AC-B2: 全局 middleware 为所有受保护请求构建 `request.auth`，业务层不再从 header/query/localStorage 直接认身份。
- [x] AC-B3: `AuthContext` 由平台构建，且仅包含 `userId / sessionId / providerId / authenticated` 四字段。
- [x] AC-B4: `providerState` 仅存在于 session 内部，不泄漏到 AuthContext 或默认业务路径。
- [ ] AC-B5: session 过期判定在 store/middleware 内部统一处理，不依赖消费方各自自保。（deferred）

### Phase C（同构登录流程、UI 与兼容迁移）✅
- [x] AC-C1: `no-auth`、表单类 provider、跳转类 provider 走统一生命周期，只允许 provider 实现不同。
- [x] AC-C2: provider `presentation` 驱动前端登录 UI，不再硬编码 Huawei 专用页面。
- [x] AC-C3: Huawei MaaS 初始化通过 `postLoginInit` 机制挂入，遵守”provider 声明、平台触发、失败不回滚认证”的规则。
- [ ] AC-C4: 旧接口保留兼容外壳，新入口以 `/api/auth/session` 为统一查询面。（deferred）
- [x] AC-C5: `X-Cat-Cafe-User` 从认证路径退役为非凭证字段。

### Phase D（外部 Provider 接入机制与架构文档）📋
- [x] AC-D1: 架构文档 `auth-provider-extension-model.md` 完成，覆盖边界、注册模型、配置语义、反模式。
- [ ] AC-D2: `@cat-cafe/plugin-api/auth` subpath export 作为唯一稳定公共入口，外部 provider 只依赖这个。
- [ ] AC-D3: 外部 provider 通过 `CAT_CAFE_AUTH_PROVIDER_MODULES` + `CAT_CAFE_AUTH_PROVIDER` 接入，无需修改主仓源码。
- [ ] AC-D4: 内建 `no-auth` 和 `huawei-iam` 继续在主仓维护，不拆为独立包。
- [ ] AC-D5: 外部 provider 必须使用新 `providerId`（A-scheme），禁止复用内建 ID。

### Phase E（Provider 前端 Surface 扩展）📋
- [ ] AC-E1: 现有 schema-form 模式（`presentation.mode=form`）端到端可用。
- [ ] AC-E2: `no-auth` 的 `mode=auto` 正确跳过登录页。
- [ ] AC-E3: 切换 `CAT_CAFE_AUTH_PROVIDER` + 重启 → 前端登录体验自动随 provider 变化。
- [ ] AC-E4: （远期）Provider 可选声明 web manifest，host 通过 `@fastify/static` 挂载静态资源。

### Phase F（插件开发文档与端到端验证）📋
- [ ] AC-F1: 机制文档完成（边界、注册模型、配置语义、包边界）。
- [ ] AC-F2: 开发指南完成（从创建项目到发布到集成的完整 walkthrough）。
- [ ] AC-F3: 文档包含 demo provider 示例代码。
- [ ] AC-F4: 一个不了解主仓库的开发者，只看文档就能在独立仓库开发新 provider。

## 需求点 Checklist

| ID | 需求点（铲屎官原话/转述） | AC 编号 | 验证方式 | 状态 |
|----|---------------------------|---------|----------|------|
| R1 | “默认是 no-auth；不做登录直接进主页，但流程还是一致” | AC-A4, AC-C1, AC-E3 | manual + test | [x] backend / [ ] standalone pkg |
| R2 | “第三方实现自己的登录模块，集成后通过 .env 切换就能用” | AC-A3, AC-D4, AC-E5 | test + doc review | [x] runtime loader / [ ] pkg install flow |
| R3 | “业务层不应该感知 provider；后端统一拦截器处理” | AC-B1, AC-B2, AC-B3 | test + code review | [x] |
| R4 | “Huawei MaaS 这种应该是 Huawei 自己要做的事儿” | AC-C3 | test + code review | [x] |
| R5 | “不要一个能力一个 types 包，直接按 plugin-api 做” | AC-A1, AC-D3 | doc review | [x] structure / [ ] publish |
| R6 | “X-Cat-Cafe-User 这个不能直接当登录凭证” | AC-B1, AC-C5 | test + code review | [x] |
| R7 | “no-auth+huawei-iam 作为独立可管理的 provider module” | AC-D4 | code review | [x] 内建 provider 各自独立实现，共享契约 |
| R8 | “启用哪个 module 就自动得到对应前后端完整效果” | AC-E1, AC-E2, AC-E3 | e2e test | [ ] |
| R9 | “plugin-api 作为第三方唯一依赖入口” | AC-D2, AC-D3 | code review + doc | [ ] |
| R10 | “插件开发文档：新仓库开发→打包→集成→配 env→重启可用” | AC-F1, AC-F2, AC-F3 | doc walkthrough | [ ] |

### 覆盖检查
- [x] 每个需求点都能映射到至少一个 AC
- [x] 每个 AC 都有验证方式
- [ ] 前端需求已准备需求→证据映射表（若适用）

## Dependencies

- **Evolved from**: —
- **Blocked by**: —
- **Related**: F032（插件/registry 架构心智） / F077（多用户安全身份与 session 真相源）

## Risk

| 风险 | 缓解 |
|------|------|
| 把 `shared` 和 `plugin-api` 边界混写，后续再次搬家 | 从 kickoff 起明确 `plugin-api` 是对外契约层，`shared` 只放内部共享类型 |
| Huawei 现有逻辑与统一生命周期耦太深，迁移中容易”边拆边穿透” | 先把 10 条硬约束写入 feature doc 和 plan，再按 phase 拆迁移 |
| 旧接口兼容期过长，导致双轨身份路径长期并存 | 在 Phase C 明确兼容只作为外壳，认证真相源一律迁到 SessionAuthority |
| 后续接入更多 provider 时又把 provider-specific 数据塞进业务层 | 把 `providerState` opaque + `AuthContext` 最小四字段写成硬约束并用 review gate 守住 |
| Provider 自带前端与 Next.js 构建耦合 | 走静态资源路径映射（`@fastify/static`），不要求 provider 嵌入 Next.js 构建流 |
| 公共入口 subpath 变更影响已接入的外部 provider | `@cat-cafe/plugin-api/auth` 作为唯一对外稳定面，变更需 review gate；扩展走 optional fields |

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
| KD-5 | `postLoginInit` 采用”provider 声明、平台触发、失败不回滚认证” | 统一生命周期，同时保留 provider 专属初始化 | 2026-04-08 |
| KD-6 | Provider 前端走静态资源路径映射，不做运行时 React 组件加载 | 铲屎官指出类比 Java classpath 的方式更稳，且不耦合 Next.js 构建 | 2026-04-08 |
| KD-7 | Provider package = server module + optional web manifest + static assets | 一个包同时覆盖前后端，安装即完整可用 | 2026-04-08 |
| KD-8 | `plugin-api` 保持内部 contract 层，不单独发布 npm；内建 provider 不拆包 | 设计收敛：多包是内部实现细节，对外只需一个稳定公共入口 | 2026-04-09 |
| KD-9 | 外部 provider 用新 providerId（A-scheme），禁止同名覆盖内建 | 日志/排障更清晰，无优先级歧义，additive-only 模型 | 2026-04-09 |

## Timeline

| 日期 | 事件 |
|------|------|
| 2026-04-08 | 立项，确认 `plugin-api + auth runtime` 方向 |
| 2026-04-08 | Phase A/B/C 实现完成，gpt52 review 通过（3 轮，all P1/P2 closed） |
| 2026-04-08 | PR #249 opened (feat/f140-auth-plugin-api → playground)，等云端 review |
| 2026-04-08 | 铲屎官明确最终验收标准：独立发包 + provider 自带前端 + 开发文档 |
| 2026-04-08 | Feature doc 重整：新增 Phase D/E/F，覆盖完整产品化目标 |
| 2026-04-09 | 设计收敛：plugin-api 保持内部、A-scheme providerId、内建不拆包（gpt52 + CVO 确认） |
| 2026-04-09 | 架构文档 `auth-provider-extension-model.md` 落仓 |

## Review Gate

- Phase A: 架构与契约边界由 Ragdoll / Maine Coon 交叉确认 ✅
- Phase B: 安全与身份真相源由 Maine Coon 守门 ✅
- Phase C: 前端流程与兼容迁移需要团队实测登录流 ✅
- Phase D: Provider 包结构与发布流程由 Maine Coon review
- Phase E: Web manifest + 静态资源路由需要端到端实测
- Phase F: 文档需要由"不了解主仓"的开发者 walkthrough 验证

## Links

| 类型 | 路径 | 说明 |
|------|------|------|
| **Feature** | `docs/features/F140-auth-plugin-api-runtime.md` | 本 feature 真相源 |
| **Plan** | `docs/plans/2026-04-08-auth-provider-abstraction.md` | F140 的实施计划 |
| **Architecture** | `docs/architecture/auth-provider-extension-model.md` | Auth 扩展模型架构文档（对外开放机制的真相源） |
| **Discussion** | `docs/discussions/2026-04-08-auth-plugin-api-runtime-convergence.md` | 多猫讨论后的定案收敛记录 |
