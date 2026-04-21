---
feature_ids: [F140]
topics: [provider-runtime, auth, decoupling, plugins, relayclaw, huawei-maas, handoff]
doc_kind: discussion
created: 2026-04-21
---

# Provider + Auth Decoupling Replay Summary

> Canonical branch: `codex/decoupling-main-replay-20260421`
> Final head: `08d28853`
> Status: provider runtime replay + auth provider replay both landed, pushed to remote, and review-approved

## 1. TL;DR

这份总结描述的是 **`decoupling` 分支两条主线一起 replay 到 main 基线后的最终状态**，不再是早期那个“只回放 provider runtime、auth 还没补”的中间态。

当前最终分支 `codex/decoupling-main-replay-20260421` 已经包含两部分：

1. **provider runtime decoupling**
   - 把 provider 选择、创建、binding 校验和 discovery 收口到 plugin contract + registry
   - 让 API 主流程不再直接 hardcode provider 分发逻辑
2. **auth provider decoupling**
   - 把登录认证抽成 `AuthProvider` contract + `packages/api/src/auth/` runtime
   - 把前端登录页改为 provider-driven
   - 把认证凭证从 `X-Office-Claw-User` 迁到 session-based `Authorization: Bearer`

因此，这条分支现在表达的不是“provider 先拆一半”，而是：

1. **provider runtime 和 auth provider 都已经 replay 完成**
2. **review 已通过**
3. **当前只保留一条最终分支名**

## 2. 最终分支与提交

当前最终交付分支：

1. `codex/decoupling-main-replay-20260421`

它包含以下 replay 提交，按时间顺序为：

1. `11b73a89` feat: replay decoupling plugin migration onto main
2. `b60cc0d8` fix: restore a2a provider bootstrap
3. `aed3dfc4` docs: summarize provider runtime decoupling replay
4. `1a300289` docs: clarify auth decoupling status
5. `4ec8a86f` docs: integrate auth rationale into decoupling summary
6. `ba38539c` test: add auth replay red tests
7. `08d28853` feat: replay auth provider runtime on main

历史上曾短暂存在单独的 auth superset 分支：

1. `codex/decoupling-main-replay-auth-20260421`

但在 replay 完整收口后，这条分支名已经被回收到最终 canonical 分支名中；当前不再保留独立 auth 分支名。

## 3. Provider Runtime Replay 实际完成了什么

### 3.1 把 provider contract 抽到稳定边界

provider runtime replay 的核心不是“把所有 provider 都拆成独立 npm 包”，而是先把主调用链的边界切干净：

1. `@clowder/core` 承载 provider plugin contract 和 registry
2. API 主流程改成“读取 provider → 通过 registry 找 plugin → 创建 service”
3. provider-specific 的 builtin client / expected protocol / binding validation 收口到 plugin 边界
4. `provider-a2a` / `provider-echo` 作为样板与 discovery 验证

这样后续如果继续拆 provider，不需要再回头重写 API 主启动链。

### 3.2 API 主流程不再自己维护 provider 分发表

这条线完成后，`packages/api/src/index.ts` 不再自己维护一大段 provider switch / startup wiring / binding 兼容判断，而是：

1. 初始化 plugin registry
2. 注册 builtin plugins
3. discovery 外部 provider modules
4. 按 cat config 的 `provider` 去 registry 里找 plugin
5. 通过 plugin 创建 runtime service

这让“新增 provider”从侵入主入口，变成扩展 contract。

### 3.3 builtin providers 先被内聚成内置 plugin

当前仍在 `packages/api` 内部维护的 provider，没有一次性全部外移，而是先统一被包装为 builtin plugin：

1. `anthropic`
2. `openai`
3. `google`
4. `dare`
5. `opencode`
6. `antigravity`
7. `relayclaw`
8. `acp`
9. `a2a`

这一步的意义是：

1. 主流程已经解耦
2. provider 物理外移可以后做
3. 默认运行链路不需要一次性重构

## 4. Auth Provider Replay 实际完成了什么

### 4.1 把 auth contract 抽成插件接口

auth 这一半最终补齐后，公共 contract 变成：

1. `@clowder/plugin-api/auth`

核心接口是 `AuthProvider`，职责边界很明确：

1. provider 负责把 `credentials -> identity`
2. platform 负责 session issuance / middleware / AuthContext
3. 前端只消费 provider 的 `presentation`

### 4.2 `packages/api/src/auth/` 成为新的认证 runtime

新增的 auth runtime 目录现在承载：

1. `module.ts` — active provider 选择、builtin + external provider 加载
2. `provider-registry.ts` — provider 注册与 module discovery
3. `session-store.ts` — by-sessionId / by-userId 双索引 session store
4. `middleware.ts` — 把 session credential 解析成 `request.auth`
5. `types.ts` — auth contract re-export + platform-only 类型
6. `providers/no-auth.ts`
7. `providers/huawei-iam.ts`

`routes/auth.ts` 也从旧 CAS 流的大而全实现，收缩成围绕 `AuthProvider + SessionStore` 的薄编排层。

### 4.3 登录凭证从 header userId 迁到 session auth

这次 replay 的一个关键变化是认证语义正式切换：

1. **旧路径**：`X-Office-Claw-User` / query `userId` / localStorage userId
2. **新路径**：opaque `sessionId` + `Authorization: Bearer <sessionId>`

配套变化包括：

1. `request.auth` 成为受保护路径的统一身份真相源
2. 前端 `api-client.ts` 改为默认发 Bearer session
3. `userId.ts` 增加 `sessionId` 的本地存取
4. `request-identity.ts` 改成 auth-first，并保留 `resolveUserIdHint()` 给尚未完全迁移的内部路径

### 4.4 登录页变成 provider-driven

前端登录流不再硬绑定旧 CAS 页面，而是由 provider 的 `presentation` 驱动：

1. `no-auth` 走 `mode=auto`，直接通过 `/api/islogin` 自动进入主页
2. `huawei-iam` 走 `mode=form`，前端根据 schema 动态渲染表单
3. `/login` 页面负责 provider-driven UI 与安全交互

与此同时，本地已有的登录页安全与交互要求也被保住了：

1. 密码显隐 toggle
2. 密码框防 copy / cut
3. userType 切换
4. promotion code 按条件渲染

### 4.5 Huawei IAM 被明确收口成 auth plugin

旧的 Huawei IAM / CAS / MaaS 登录链里最容易和平台边界缠住的部分，现在已经被拆清：

1. 认证 provider 负责 IAM 登录和订阅检查
2. provider-specific 状态落在 `providerState`
3. 平台通过 `postLoginInit` / `onPostLogin` 做认证后初始化
4. `huawei-maas.ts` 改为从新 session store 读取 `providerState.modelInfo`

## 5. 当前最终状态下，哪些事情仍然没有完成

这条分支现在已经是“provider + auth 一起 replay”的最终版，但它仍然不是“所有相关问题都已经产品化到终态”。

### 5.1 默认部署预设还没有完全去掉产品级耦合

即便 runtime 已经解耦，默认 seed / preset 仍然保留着当前产品的偏好：

1. 默认 provider 仍与 `relayclaw` / Huawei 相关预设存在产品级关联
2. `.env` 还没有做到“一键切 deployment preset + auth preset + provider preset”
3. `huawei-maas` 仍是特殊 model source，而不是和 `provider-a2a` 同级的普通插件包

### 5.2 这次 replay 没有顺手把所有旧 auth 行为都做一遍一比一复刻

review 明确确认过两个点属于当前可接受 tradeoff，而不是这次 replay 的阻塞缺口：

1. `lastPromotionCode` 目前是进程级 remembered value
   - 对当前单用户桌面模式可接受
   - 如果未来要求多用户隔离，应单独做 follow-up
2. 旧 CAS 流中的 `cross-keychain + Conf(AES-256-GCM)` 安全持久化没有被原样带入新模型
   - 当前 session auth 本身就是 in-memory model
   - 如果未来要求跨重启安全持久化，应作为独立 story 处理

这两个点在 replay review 中都被接受为“架构取舍变化”，不是阻塞项。

## 6. 验证与 Review 结论

### 6.1 Provider Runtime 侧

provider runtime replay 相关验证覆盖了：

1. `packages/core/test/plugin-registry.test.js`
2. `packages/api/test/builtin-providers.test.js`
3. `packages/api/test/provider-plugin-registry-bootstrap.test.js`

它们确认：

1. registry register / get / discovery 正常
2. builtin mapping 正常
3. API bootstrap 确实执行了 provider plugin discovery

### 6.2 Auth Provider 侧

auth replay 最终通过的验证包括：

1. `pnpm --dir packages/api run build`
2. `packages/api/test/auth-module.test.js`
3. `packages/api/test/auth-routes.test.js`
4. `packages/api/test/auth-external-provider-e2e.test.js`
5. `packages/web/src/app/login/__tests__/page.test.tsx`
6. `packages/web/src/utils/__tests__/auth-provider.test.ts`

这些覆盖了：

1. builtin / external auth provider loading
2. `/api/islogin` / `/api/login` / `/api/logout`
3. session issuance 与 middleware 解析
4. provider-driven login page
5. 前端登录交互与 auth schema 渲染

### 6.3 Review 结论

最终 review 结论已经收敛为：

1. provider runtime replay：PASS
2. auth provider replay：PASS
3. 两条线都已 push 到 remote
4. 最终只保留 `codex/decoupling-main-replay-20260421` 这一条 canonical 分支

所以当前状态不是“等继续补 auth”，而是：

1. **代码已完成**
2. **review 已完成**
3. **分支已收口**
4. **剩余工作主要是铲屎官的端到端验收**

## 7. 为什么最终只保留一条分支

收口前曾经有两条 replay 分支名：

1. `codex/decoupling-main-replay-20260421`
2. `codex/decoupling-main-replay-auth-20260421`

但它们不是两条长期并行产品线。

真实关系是：

1. auth 分支是建立在 provider runtime replay 分支之上的 superset
2. auth replay 完成并 review 通过后，最终交付应只有一个 canonical branch

所以当前处理方式是：

1. 把最终 superset 内容保留
2. 把 canonical 分支名统一收口为 `codex/decoupling-main-replay-20260421`
3. 删除多余的 auth 命名分支，避免后续 MR / 验收 / merge gate 再次分叉

## 8. 下一步建议

从工程状态上看，这条分支已经不再需要继续补 replay 范围内的代码。

更合理的下一步是：

1. 以 `codex/decoupling-main-replay-20260421` 做端到端验收
2. 重点验证：
   - `no-auth`
   - `huawei-iam`
   - 外部 auth provider
   - 外部 provider runtime
3. 验收通过后，直接基于这条 canonical branch 开 MR / 进 merge gate

## 9. Links

1. Feature: `docs/features/F140-auth-plugin-api-runtime.md`
2. Discussion: `docs/discussions/2026-04-08-auth-plugin-api-runtime-convergence.md`
3. Current canonical branch: `codex/decoupling-main-replay-20260421`
