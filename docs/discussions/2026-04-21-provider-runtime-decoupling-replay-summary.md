---
feature_ids: []
topics: [provider-runtime, decoupling, plugins, relayclaw, huawei-maas, handoff]
doc_kind: discussion
created: 2026-04-21
---

# Provider Runtime Decoupling Replay Summary

> Branch: `codex/decoupling-main-replay-20260421`
> Commits:
> - `11b73a89` feat: replay decoupling plugin migration onto main
> - `b60cc0d8` fix: restore a2a provider bootstrap
> Status: code review passed, ready for follow-up work and end-to-end validation

## 1. TL;DR

这条分支做的不是“把所有 provider 都拆成独立 package”。

它完成的是第一阶段的**运行时解耦骨架**：

1. 在 `@clowder/core` 里定义 provider plugin contract 和 registry。
2. 在 `packages/api` 里把原先集中在 `index.ts` / binding 兼容层里的 provider 选择逻辑改成“先问 registry，再创建 service”。
3. 提供两个外部 package 作为样板和验证：
   - `@clowder/provider-a2a`
   - `@clowder/provider-echo`
4. 保留旧 provider 实现仍在 `packages/api` 内部运行，通过 builtin plugin 方式接上新 contract。

所以这条分支的价值是：

1. **先把边界切出来**，让后续继续拆 provider 时不需要再改一次主调用链。
2. **把“provider 是什么”从 API 主流程里抽掉**，API 只关心“有没有 plugin、怎么创建 service、怎么校验 binding”。
3. **保留兼容路径**，避免一次性大迁移把默认运行方式打爆。
4. **明确当前只拆了 provider runtime，没有把 auth 本身一起拆掉**。

## 2. 为什么要拆

拆之前，provider runtime 有几个结构性问题：

1. `packages/api/src/index.ts` 是启动时的集中分发点，新增或修改 provider 必须改主入口。
2. provider 的几个维度混在一起：
   - AgentService 创建
   - account/client 绑定规则
   - protocol 期望值
   - MCP config 写入
   - startup wiring
3. 这让“新增 provider”和“修改已有 provider”都变成对 API 主流程的侵入式修改。
4. 对默认链路之外的场景不友好：
   - 第三方 provider
   - 按部署裁剪 provider
   - 非默认 auth/runtime 组合
5. 无法做渐进式外部化。要拆一个 provider，必须先动一圈主流程。

从团队协作角度，问题更直接：

1. 代码审查难度高，因为 provider 逻辑散在 API 启动、binding 校验、路由保存校验和 runtime env 注入之间。
2. 后续想做“插件化”时，没有稳定 contract 可以接。
3. 部署侧想裁掉 `relayclaw` 或 `huawei-maas`，没有正交开关，只能硬改默认模板和调用链。

## 3. 为什么可以这么拆

这次拆分成立，不是因为“想插件化”，而是因为代码里已经天然有一层可抽象的边界。

这个边界就是：

1. **provider-specific** 的部分，本质上只需要回答几个问题：
   - 这个 provider 叫什么、支持哪些 provider id
   - 如何创建 `AgentService`
   - 它对应哪个 builtin client
   - 它期望什么 protocol
   - 它如何校验 runtime binding
   - 它是否需要写自己的 MCP config
2. **provider-agnostic** 的部分，API 主流程只关心：
   - 从 cat config 里读到 `provider`
   - 找到对应 plugin
   - 调用 `createAgentService`
   - 在 invocation 阶段按绑定结果注入 env

换句话说，原来的系统已经是“逻辑上可分”，只是“物理上没分开”。

因此这条分支采用的是：

1. **先抽 contract**
2. **再把主流程改成依赖 contract**
3. **最后再逐个 provider 外移**

这比“先大搬家再补 contract”稳，因为：

1. 可以保留 builtin provider 的默认运行方式。
2. 可以用兼容层兜住旧调用方。
3. 可以先通过 `provider-echo` 证明 registry/discovery 链路是活的。

## 4. 这条分支实际拆了什么

### 4.1 新增公共 contract 与 registry

新增 package：

1. `packages/core`
2. `packages/plugin-api`
3. `packages/provider-a2a`
4. `packages/provider-echo`

其中真正形成运行时骨架的是 `packages/core`：

1. `ClowderProviderPlugin`
2. `ProviderPluginRegistry`
3. provider binding / account spec 相关类型

`ProviderPluginRegistry` 支持两种注册方式：

1. 显式注册 builtin plugins
2. `discoverFromNodeModules()` 自动发现 `@clowder/provider-*`

### 4.2 API 主启动链改为走 plugin registry

`packages/api/src/index.ts` 不再自己维护一大段 provider 分发逻辑，而是：

1. 初始化 plugin registry
2. 注册 builtin plugins
3. 发现 workspace / node_modules provider plugins
4. `syncAgentRegistry()` 按 cat 的 `provider` 去 registry 里找 plugin
5. 通过 plugin 的 `createAgentService()` 构造 runtime service

这一步的意义是：以后新增 provider，不需要再进 `index.ts` 写一段新的主流程 switch。

### 4.3 builtin providers 被改造成“内置 plugin”

当前还在 `packages/api` 里的 provider 实现，没有被直接删走，而是先统一包了一层 builtin plugin：

1. `anthropic`
2. `openai`
3. `google`
4. `dare`
5. `opencode`
6. `antigravity`
7. `relayclaw`
8. `acp`
9. `a2a`（follow-up `b60cc0d8` 补回）

这一步非常关键，因为它把“provider 逻辑仍在 api 内部”和“主流程已解耦”这两件事分开了。

后续继续拆 provider 时，可以一个一个外移，而不是再碰主调用链。

### 4.4 兼容层继续保留

`packages/api/src/config/provider-binding-compat.ts` 现在是：

1. 先尝试从 plugin registry 读 mapping / validation
2. registry 未初始化时，再走 legacy fallback

这意味着：

1. 新逻辑已生效
2. 旧调用方暂时不用一起重写

这是一个明确的渐进式迁移设计，不是临时补丁。

### 4.5 A2A bootstrap 缺口已补

`11b73a89` 之后原本还留了一个 P1：

1. `@clowder/provider-a2a` 已经抽出来了
2. 但 API startup 没有真的把它接进来

`b60cc0d8` 修复后，当前状态是：

1. `a2a` 被补进 builtin plugins，保证可靠性
2. startup 会执行 discovery，保证扩展性

这个组合是正确的：

1. builtin 保证默认 provider 不掉线
2. discovery 允许外部 plugin 真正生效

### 4.6 测试补齐到“骨架级”

当前和这次解耦直接相关的测试覆盖点：

1. `packages/core/test/plugin-registry.test.js`
   - registry register/get/reset
   - 多 provider plugin
   - discovery `@clowder/provider-echo`
2. `packages/api/test/builtin-providers.test.js`
   - builtin mapping
   - `a2a` 已在 builtin 集合内
3. `packages/api/test/provider-plugin-registry-bootstrap.test.js`
   - API bootstrap 确实执行了 discovery

## 5. 这条分支没有拆掉什么

这部分非常重要。后续推进必须建立在“哪些只是接上了 contract，哪些真的外移了”这个事实之上。

### 5.1 默认部署预设没有解耦

当前默认模板还是把种子猫写死成：

1. `provider: relayclaw`
2. `accountRef: huawei-maas`

这意味着默认运行方式仍然强绑定：

1. `relayclaw`
2. `Huawei MaaS`
3. 华为 CAS 登录链

也就是说：

1. **runtime 主链路解耦了**
2. **默认产品预设还没有解耦**

### 5.2 auth 本身还没有被抽成独立层

这里要明确区分两种 auth：

1. **平台登录 auth**
   - 入口在 `packages/api/src/routes/auth.ts`
   - 当前核心模式是 `CAS` 或 `CAT_CAFE_SKIP_AUTH`
2. **模型调用 auth**
   - builtin OAuth account
   - api_key provider profile
   - `authType: none`（主要用于 ACP）
   - 保留模型源 `huawei-maas`

这条分支解耦的是 provider runtime，不是 auth framework。

当前 auth 仍然散在三层：

1. 登录认证在 `routes/auth.ts`
2. provider binding / account compatibility 在 provider plugin + compat layer
3. `huawei-maas` 作为特殊 model source 走 invocation 特判

所以当前系统的真实状态是：

1. **provider 入口已经插件化**
2. **auth 入口还没有正交化**
3. **`relayclaw` 与 `huawei-maas` 的默认组合，仍然是产品预设，不是 auth plugin**

这也是为什么“是不是 jiuwenclaw”和“用哪种 auth”现在还不能只靠一层开关描述清楚。

### 5.3 `.env` 还不能一键切换“是不是 jiuwenclaw / 用什么 auth”

现在 `.env` 能控制的主要是：

1. `CAT_CAFE_SKIP_AUTH` / 登录跳过
2. `OFFICE_CLAW_BUILTIN_CLIENTS_ENABLED`
3. `OFFICE_CLAW_CLIENT_LABELS`
4. builtin client 的可见性

现在 `.env` 还不能直接控制的，是下面这些真实运行时决策：

1. 默认猫是不是 `relayclaw`
2. 默认猫是不是绑定 `huawei-maas`
3. 默认 deployment preset 是“skip auth + non-relayclaw”还是“CAS + relayclaw”

这些目前仍然在：

1. seed template
2. runtime catalog
3. model config source / provider profile 绑定

### 5.4 `huawei-maas` 仍然是特殊模型源，不是普通 plugin

`huawei-maas` 当前是 reserved model config source，不是一个和 `provider-a2a` 同级的普通 provider plugin。

这带来两个后果：

1. 它仍然在 invocation/runtime 注入路径里有特殊判断。
2. “provider 解耦”不等于“auth/model source 解耦”。

如果后续目标是完全正交化，这一层还要继续拆。

### 5.5 多数 provider 实现仍在 `packages/api`

当前真正外部化成独立 package 的 provider，主要是：

1. `provider-a2a`
2. `provider-echo`

`relayclaw`、`anthropic`、`openai`、`google`、`dare`、`opencode`、`acp`、`antigravity` 目前仍是 API 内部实现，只是通过 builtin plugin 挂到新 contract 上。

所以这条分支是“把主干换成插件接口”，不是“provider 全部拆完”。

## 6. 为什么这个阶段值得停在这里

因为这是一个合适的阶段性终点：

1. 主干已经抽象化
2. 兼容层还在
3. 默认运行方式没被破坏
4. 后续每一刀都可以缩成局部改动

如果这一步没做完，就直接去拆：

1. deployment preset
2. Huawei auth
3. relayclaw sidecar
4. 各 provider package

后面的每一步都会继续把 `index.ts`、binding compat、startup wiring 改来改去，重复返工。

## 7. 下一步建议继续拆什么

建议按下面顺序继续，而不是并行乱拆。

### 7.1 先拆“auth + 部署预设”

这是当前最大的结构混叠点，因为现在至少有三件事还绑在一起：

1. 平台登录 auth（CAS / skip auth）
2. 模型调用 auth（builtin / api_key / huawei-maas）
3. 默认 provider preset（relayclaw / non-relayclaw）

建议引入一层明确的 preset / bootstrap 开关，例如：

1. `OFFICE_CLAW_APP_AUTH_MODE=cas|skip`
2. `OFFICE_CLAW_RUNTIME_AUTH_MODE=builtin|api_key|model_source`
3. `OFFICE_CLAW_DEFAULT_PROVIDER=relayclaw|openai|anthropic|google|opencode|dare`
4. `OFFICE_CLAW_DEFAULT_MODEL_SOURCE=huawei-maas|builtin|profile:<id>`
5. `OFFICE_CLAW_ENABLE_RELAYCLAW=0|1`

目标不是让 `.env` 直接改一切，而是让“默认模板如何生成 / 启动时如何 bootstrap”变成显式策略。

### 7.2 再拆 `relayclaw` / `huawei-maas` 的耦合

当前最大的真实业务耦合在这里：

1. `relayclaw` 是 provider
2. `huawei-maas` 是 model source
3. 默认种子猫同时绑定两者

建议后续明确三层：

1. provider plugin
2. auth / model source
3. deployment preset

这样才能回答“去掉 jiuwenclaw 时哪些代码是真冗余，哪些只是另一种 preset 不再启用”。

### 7.3 逐个外移剩余 builtin providers

下一批最值得外移的 provider 建议是：

1. `relayclaw`
2. `dare`
3. `opencode`

理由：

1. 这几个 provider 的定制 wiring 最多
2. 继续留在 api 内部，主干虽然解耦了，但业务复杂度还在 API 包里

### 7.4 最后再决定是否继续抽象 `model config source`

如果未来想支持更多像 `huawei-maas` 这样的模型源，就要考虑：

1. model source 是否也需要 plugin 化
2. 还是保留为独立于 provider plugin 的另一套 registry

这一步不要太早做。先把 provider 和 preset 理顺，再做这一刀。

## 8. 建议的验证方式

验证分三层：代码级验证 + 平台登录 auth 验证 + provider/runtime 验证。

### 8.1 代码级验证

已经在这条分支上跑过：

```bash
cd packages/api
pnpm run build
CAT_CAFE_DISABLE_SHARED_STATE_PREFLIGHT=1 node --test test/builtin-providers.test.js test/provider-plugin-registry-bootstrap.test.js
CAT_CAFE_DISABLE_SHARED_STATE_PREFLIGHT=1 node --test test/server-entrypoint.test.js
```

验证目标：

1. builtin plugins 里包含 `a2a`
2. API bootstrap 会执行 discovery
3. 入口装载不报错

### 8.2 运行级验证：默认场景

目标：验证“平台登录 auth 与默认 runtime preset 还保持当前行为”

1. 不改默认 seed cats
2. 正常走华为 CAS 登录
3. 不在 console 里手工重配 provider
4. 直接访问默认猫

成功标准：

1. `CAS` 登录链路仍可用
2. 默认猫仍可用
3. 不需要额外 console 配置
4. `relayclaw + huawei-maas` 默认链路保持可用

### 8.3 运行级验证：非默认场景

目标：验证“平台登录 auth 可以跳过，且主链路已能支持非 jiuwenclaw provider”

1. `CAT_CAFE_SKIP_AUTH=1`
2. 如需简化 UI，可设置：
   - `OFFICE_CLAW_BUILTIN_CLIENTS_ENABLED=false`
   - `OFFICE_CLAW_CLIENT_LABELS=openai:Codex,anthropic:Claude,google:Gemini,opencode:OpenCode,dare:Dare`
3. 在 console 的 Provider Profiles 创建或选择非华为 profile
4. 在 Cat Editor 里把某只猫改成非 `relayclaw` client，并绑定匹配的 accountRef
5. 发消息验证

成功标准：

1. `skip auth` 生效，不再进入 CAS 登录
2. 不再依赖 `relayclaw sidecar`
3. 配置可以通过 console 正常保存
4. 非默认 client 仍可工作

注意：

1. 这一步现在还不是纯 `.env` 切换
2. 因为默认 seed cats 仍是 `relayclaw + huawei-maas`

## 9. 后续接球的人应该先看哪些文件

如果是继续做 provider/plugin 拆分，先看：

1. `packages/core/src/plugin/types.ts`
2. `packages/core/src/plugin/registry.ts`
3. `packages/api/src/config/plugins/builtin-providers.ts`
4. `packages/api/src/index.ts`
5. `packages/api/src/config/provider-binding-compat.ts`

如果是继续做“默认预设 / auth / jiuwenclaw 正交化”，先看：

1. `office-claw-template.json`
2. `packages/api/src/routes/auth.ts`
3. `packages/api/src/routes/cats.ts`
4. `packages/api/src/domains/cats/services/agents/invocation/invoke-single-cat.ts`
5. `packages/api/src/config/model-config-profiles.ts`
6. `packages/api/src/utils/client-visibility.ts`

## 10. 结论

这条分支完成的是**解耦的第一性工作**：

1. 把 provider runtime 的主干改成 plugin contract 驱动
2. 保留默认行为不变
3. 给后续继续拆 provider、拆 preset、拆 `relayclaw/huawei-maas` 耦合提供稳定落脚点

它的边界很清楚：

1. **已解耦**：API 主调用链与 provider 的耦合
2. **未解耦**：默认部署预设、`relayclaw` 与 `huawei-maas` 的产品级绑定、`.env` 一键切换能力

后续工作不应该回头再重做“plugin registry / contract / startup wiring”这一层，而应该直接站在这条分支上，继续拆默认预设和剩余 provider。
