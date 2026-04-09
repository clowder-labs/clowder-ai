---
feature_ids: [F140]
related_features: [F059]
topics: [architecture, binary-core, identity, login-gateway, decoupling]
doc_kind: spec
created: 2026-04-09
---

# F140: Binary Core Phase 1 — Identity Boundary

> **Status**: in-progress | **Owner**: opus | **Priority**: P0

## Why

Phase 0 建立了 Edition 骨架和门禁，但 Core 仍然直接包含华为 IAM 登录、MaaS 凭据链、华为版本端点等私有逻辑。Identity Contract 和 Model Catalog Contract 共享同一个 `sessions` 对象（见凭据链拓扑 §3.1），意味着 Phase 0 的解耦是"接线骨架"而非真正的身份隔离。

Phase 1 是**第一刀真正切肉**：将登录系统搬出 Core，建立 IdentityResolver 三模式（no-auth / trusted-header / jwt），同时切断 MaaS 凭据链，让 Core 具备独立启动能力。

CVO 决策（2026-04-06）：Phase 1 同步切 MaaS 凭据链（6.5-7 周），不等 Phase 3。

## What

### Phase A: Core 身份解耦 + 凭据链切断

**切割点**（来自执行包 §3.3）：

| ID | 位置 | 操作 |
|----|------|------|
| C1 | `auth.ts` 整文件 | 迁出 Core → Edition Login Gateway |
| C2 | `request-identity.ts:40` | 删 `query.userId` fallback（安全漏洞） |
| C3 | `huawei-maas.ts` 整文件 | 迁出 Core → Edition ModelSource plugin |
| C4 | `version.ts:40` | `/api/lastversion` 走 Edition hook（Phase 0 已有 hook） |
| C5 | `auth.ts:66` 的 `Conf`/`secureConfig` | 明确为 Edition-owned state |

**Core 新增**：
- `IModelSource` 接口 + stub 实现
- `useCapabilities` 前端 hook（功能显隐）
- `branding-server.ts`（SSR branding，env var fallback）
- 首页从强制跳 login → identity mode 驱动

**Core 改造**：
- `invoke-single-cat.ts:803` 删 `huawei_maas` 分支 → `IModelSource.resolveRuntimeConfig()`
- `agent-teams-bundle.ts:108` 删华为 MaaS binding → IModelSource
- `DareAgentService.ts:260` 删 `huawei-modelarts` env 映射

### Phase B: Edition Login Gateway

- 华为 IAM 登录逻辑提取为独立的 Edition Login Gateway 服务
- Gateway 认证成功后注入 `X-Cat-Cafe-User` header → Core IdentityResolver 读取
- `CAT_CAFE_SKIP_AUTH` → `no-auth` mode 迁移
- 开源版 E2E 验收

## Acceptance Criteria

### Phase A（Core 身份解耦 + 凭据链切断）
- [x] AC-A1: Core 启动不依赖 `auth.ts`、`sessions`、`secure-config`（`no-auth` 模式可独立启动）
- [x] AC-A2: `query.userId` fallback 已删除（C2 切割点）
- [x] AC-A3: `huawei-maas.ts` 已迁出 Core，`invoke-single-cat` 走 `IModelSource`
- [x] AC-A4: `/api/lastversion` 走 Edition version checker hook（Phase 0 已有基础）
- [x] AC-A5: `IModelSource` 接口定义 + stub 实现可测
- [x] AC-A6: 前端 `useCapabilities` hook 实现，功能显隐由 capability manifest 驱动
- [x] AC-A7: 首页 identity mode 驱动（no-auth 直接进入，不跳 login）
- [ ] AC-A8: Public gate hard/soft 扫描通过（pre-existing failures in auth.ts — moves to Edition in Phase B）

### Phase B（Edition Login Gateway）
- [ ] AC-B1: Edition Login Gateway 独立服务可启动，完成华为 IAM 认证
- [ ] AC-B2: Gateway → Core 通过 `X-Cat-Cafe-User` header 传递身份
- [ ] AC-B3: `CAT_CAFE_SKIP_AUTH=1` 替换为 `IDENTITY_MODE=no-auth`
- [ ] AC-B4: 开源版 E2E：clone → install → 启动 → 无登录直接使用

## Dependencies

- **Evolved from**: Phase 0（edition-loader + EditionRegistry + public gate + identity 骨架）
- **Related**: F059（开源计划）
- **Blocked by**: 无（Phase 0 已交付所有前置）

## Risk

| 风险 | 缓解 |
|------|------|
| auth.ts 与多处 session/Conf 耦合深，迁移影响面大 | 凭据链拓扑已绘（执行包 §3），逐切割点推进 |
| MaaS 凭据链同步切断增加工作量 | 接受 6.5-7 周工期，换来真正独立启动 |
| playground 持续有新提交，rebase 冲突频繁 | 尽早开 worktree，小步提交，减少冲突面 |

## Key Decisions

| # | 决策 | 理由 | 日期 |
|---|------|------|------|
| KD-1 | MaaS 凭据链在 Phase 1 一起切（不等 Phase 3） | auth.ts → sessions → huawei-maas.ts 是同一条链，只切 auth 是假解耦 | 2026-04-06 |
| KD-2 | `no-auth` + `trusted-header` 优先，`jwt` Phase 1 末或 Phase 2 | jwt 需 JWKS 基础设施，可后补 | 2026-04-06 |

## Timeline

| 日期 | 事件 |
|------|------|
| 2026-04-09 | 立项 |

## Review Gate

- Phase A: gpt52 cross-family review
- Phase B: gpt52 + CVO 验收

## Links

| 类型 | 路径 | 说明 |
|------|------|------|
| **Decision** | `docs/decisions/binary-core-product-line-v3.md` | 架构总方案 |
| **Decision** | `docs/decisions/binary-core-phase0-phase1-execution-pack.md` | Phase 1 执行包（迁移清单 + 凭据链拓扑 + IdentityResolver 接口） |
| **Feature** | `docs/features/F059-open-source-plan.md` | 开源计划 |
