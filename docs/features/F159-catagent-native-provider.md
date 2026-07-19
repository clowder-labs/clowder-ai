---
feature_ids: [F159]
related_features: [F143, F149, F153, F050, F070]
topics: [provider, agent-runtime, api-path, architecture, security, community]
doc_kind: spec
created: 2026-04-11
community_issue: "zts212653/clowder-ai#434"
---

# F159: CatAgent Native Provider — Opt-in API Path

> **Status**: in-review（Phase A-E 已合入；Phase F F1/F2/F3-min 已实现，等待跨 family review + dogfood；Phase G G1 protocol adapter seam 已合入；Phase G G2 `in-design`：OpenAI Chat Adapter + 协议选择位） | **Owner**: 社区 (bouillipx) + Ragdoll + Maine Coon | **Priority**: P1

## Why

社区在 `clowder-ai#397` 中提交了一个 CatAgent 薄运行时 spike，试图用 Anthropic API 直连方式提供一条 opt-in agent path。maintainer review 已经确认这条 PR 不能直接合入：原实现同时混杂了架构层级漂移、account-binding 绕过、workspace 边界不严、以及 ADR-001 未闭环等问题。

但 `clowder-ai#434` RFC 也证明了另一个事实：如果把这件事重新表述为 **F143 宿主抽象下的 native provider**，而不是“平台再造一套独立 runtime”，那么它就不再是错误方向，而是一个值得单独立项、逐步收敛的产品能力。

因此 F159 的目标不是“重启 #397”，而是把这条社区方向收敛成一个**受约束的 first-party provider feature**：CLI 仍是默认主路径，CatAgent 只作为 opt-in API path 存在，并且必须先满足宿主层安全边界和治理约束。

## User Journey

Scope unit: one CatAgent-backed cat configured by a maintainer for a single Cat Café workspace.

Flow:

1. Maintainer enables the CatAgent protocol for a cat and binds it to an approved provider account.
2. Operator or another cat invokes that cat through the normal thread routing surface.
3. The runtime builds the same identity, workspace, callback, and audit context used by CLI providers.
4. CatAgent executes through the constrained native provider path and returns messages, tool events, and usage metadata through the existing invocation stream.
5. Maintainer verifies that account binding, workspace boundary, and tool tier policy were preserved before enabling broader dogfood.

## What

### Phase A: RFC 收敛 + ADR 边界

把 `clowder-ai#434` 从“讨论概念”收敛成可以进入实现的正式提案：

1. 明确定位：CatAgent 是 **F143 下的 native provider**，不是独立 runtime
2. 明确与 F143 / F149 / F050 的边界
3. 修订 ADR-001，定义 opt-in API path 的允许边界、成本模型、权限约束
4. 在真相源中分配正式 feature 编号并与社区 issue 双向链接

### Phase B: Host Integration + Security Baseline

先把宿主层必须兜住的硬边界补齐，再谈 provider 能力：

1. **Account-binding fail-closed**：凭据解析必须走现有绑定链路，不允许扫描任意 API key
2. **Symlink-safe workspace boundary**：文件边界复用共享 helper，不允许 provider 各写一套词法校验
3. **Injection prevention**：工具参数和命令拼接必须在 host/provider integration layer 做强约束
4. **Audit terminal state**：provider 的 `done/error/usage` 信号必须稳定进入现有审计链

### Phase C: Minimal Native Provider

在 Phase B 全绿后，才允许交付最小可用的 CatAgent provider：

1. 以 opt-in 方式注册到 provider registry，不改变默认路由
2. 支持单轮文本任务、session 标识、abort、done metadata
3. 不开放 write/exec/跨线程副作用工具
4. 保持 northbound 接口不变，仍通过宿主层 façade 对上提供能力

### Phase D: Read-Only Tools + Compaction Follow-up

只有当最小 provider 稳定后，才考虑扩展 provider 内部能力：

1. read-only tool surface（前提是宿主层权限边界已复用）
2. context compaction / microcompact 是否保留，由实测结果决定
3. provider 内部 loop/tools/compact 只作为实现细节存在，不得反向污染 Cat Cafe 控制面

### Phase E: SSE Streaming + Fail-Closed Turn Handling

在 Phase D 的 agentic loop 基础上，把 CatAgent 的 API 调用从整轮 JSON 响应升级为逐事件 SSE streaming：

1. 文本 token 按 chunk 实时产出到上游 `type: 'text'` 事件
2. `tool_use` block 按 block index 收集、重建完整 assistant content，再进入下一轮工具执行
3. usage 从 `message_start` / `message_delta` 提取，done 事件携带累计 token usage
4. stream EOF / missing `message_stop` / unclosed content block / orphan `tool_use` 全部走 **strict streaming fail-closed**
5. 不引入 `@anthropic-ai/sdk`，继续保持 raw `fetch` + 本地 parser 的 provider-owned 实现边界

### Phase F: Write/Exec Tool Surface

在 Phase A-E 的只读基座之上，把 CatAgent 扩展为 **轻量、内置、可干活的 native provider**，但仍保持：

1. **不替代 CLI 默认主路径**：CLI 仍负责重度编码、完整 agent 能力和订阅额度利用
2. **不引入新的北向 API**：继续复用现有 `AgentService.invoke()` 门面
3. **不下沉宿主安全边界**：account-binding / workspace-security / governance preflight 仍由宿主层兜底

Phase F 采用分级工具面和分 slice 推进，而不是一次性开放所有副作用能力：

#### Slice F1: Tiered Tool Surface + Write Tools

1. **CatConfig 扩展**：新增 `nativeToolLevel?: 'L0' | 'L1' | 'L2'`
2. **分级工具面**：
   - `L0`：`read_file` / `list_files` / `search_content`（F159 已有）
   - `L1`：`write_file` / `patch_file`
   - `L2`：`run_command`
   - 未声明时默认 `L0`，保持向下兼容
3. **create-safe path resolver**：
   - 现有 `resolveSecurePath()` 对 `ENOENT` 放过，不能直接用于新建文件
   - 新增 `resolveCreatePath(root, userPath)`：找到最近存在的祖先目录 → `realpath()` 校验 → 重跑 denylist → 阻止 symlink 父目录逃逸
4. **write_file**：
   - 参数：`path`、`content`
   - 路径：走 `resolveCreatePath()`
   - 写入：tmp + rename 原子写
   - 限额：单次 256 KiB
5. **patch_file**：
   - 参数：`path`、`old_text`、`new_text`、`expected_hash`
   - 语义：compare-and-swap 精确替换
   - 守卫：`expected_hash` 校验文件未被并发修改；`old_text` 必须唯一匹配
6. **结构化审计**：
   - 写操作独立记录 `tool/path/bytes/hashBefore/hashAfter/timestamp`
   - 不依赖 transcript 中 500 字符 `tool_result` 截断

#### Slice F2: run_command + Command Policy Matrix

1. **commandPolicy**（替代 `argv[0]` 粗粒度白名单）：
   - `commandPolicy?: CommandPolicyEntry[]`
   - 每条 entry 必须是 allowlist-first：`binary` + `allowedSubcommands` + `allowedFlags` / `allowedArgPatterns`
   - `deniedFlags` 只能作为 defense-in-depth，不能作为授权依据
   - 无 entry = 不可执行（fail-closed）
2. **run_command**：
   - 输入为结构化 `{ binary: string, args: string[] }`
   - 不接受字符串命令，避免 shell 解析歧义
3. **校验顺序**：
   - `binary` 命中策略项
   - `args[0]` 若作为 subcommand，必须在 `allowedSubcommands` 内
   - flags / args 必须匹配该命令的 allowlist policy；未声明即拒绝
   - `node`、`pnpm install/publish`、`git push/fetch/config` 等高风险形态默认不进入 MVP policy
4. **执行约束**：
   - `execFile`，不经 shell
   - `cwd` 锁定 workspace
   - `timeout = 30s`
   - `maxBuffer = 512 KiB`
   - env 仅透传 `PATH` + `NODE_ENV`，不透传 `HOME`
5. **失败策略**：
   - 非零退出码：作为 `tool_result` 返回，按 `turn-transient` 处理
   - 超时：`SIGTERM` + 3s grace + `SIGKILL`
   - 有副作用命令禁止盲重试
6. **结构化审计**：
   - 记录 `binary/args/exitCode/duration/stdoutBytes/stderrBytes/policyEntry`
   - 拒绝执行同样产出 `rejectReason`

#### Slice F3-min: Host-Native Scoped Callback Tool

1. **mandatory core 只交付 `update_current_task_status`**：
   - 这是 host-native scoped callback tool，不是 `update_task` 的 alias
   - 只在宿主能绑定 current invocation / current task 时注册；无 current task 时不注册或拒绝
   - 只允许更新 `status` / `progress` / `summary`
   - 明确禁止传入或修改 `owner` / `assignee` / `kind` / `targetCats` / `threadId` / `taskId`
   - 审计记录必须包含 `invocationId` / `currentTaskId` / `changedFields`
2. **optional / non-blocker: `post_current_thread_status`**：
   - 若本轮实现，必须是 no-route / no-mention / no-targetCats / no-cross-thread
   - host 负责拒绝或转义行首 `@`，避免触发 A2A 路由
3. **deferred callback surface**：
   - `create_task` / raw `post_message` / `cross_post_message` / 任意 A2A routing 全部后置
   - 不走 MCP bridge；未来若 F143 `toolBridge` / `permission policy` seam 落地，再评估是否抽象上提

### Phase G: Protocol Abstraction（in-design）

把 CatAgent 从“写死 Anthropic Messages 协议”重构成多协议可扩展的 native provider，对齐 “cat-as-an-agent” 的通用定位。当前 `CatAgentService` 直接调 Anthropic 专用函数（`buildAnthropicMessagesUrl` / `ANTHROPIC_API_VERSION` / `parseAnthropicSSE`），事实上把厂商绑定暴露成了通用入口；Phase G 在 service 层抽出中性 protocol adapter seam，再把现有 Anthropic 实现搬进 `AnthropicMessagesAdapter`——protocol 特定命名留在 adapter 内（truthful）。

Phase G 不开放新厂商支持，只完成抽象 seam；新协议 adapter（OpenAI Chat / Gemini）作为 G2 / G3 deferred slice。

#### Slice G1: Protocol Adapter Seam（refactor-only, behavior-preserving）

> **Review iteration** (2026-06-24, @gpt555 P1 finding)：G1 seam 必须扩到 **transcript codec + protocol-neutral block/event contract** 两层，不能只抽 HTTP/stream 一层。当前真实耦合不仅在 `buildAnthropicMessagesUrl` / headers / parser：`CatAgentService.ts:229-233` 直接把 `result.contentBlocks` 塞回 `{ role: 'assistant', content: ... }`、用 Anthropic `tool_result` 形状继续下一轮；`consumeTurn` (L253/L293) 的 turn state 建在 `AnthropicContentBlock`；连"共享事件契约"`CatAgentStreamEvent` 也漏 Anthropic 类型 (`catagent-stream-parser.ts:9, 15-20` —— `AnthropicContentBlock` + `AnthropicUsage`)。若 G1 只抽 HTTP/stream 半边，G2 上 OpenAI Chat 时 service 还要再拆一次 transcript codec + event 类型。

G1 分两层：

##### Layer 1: Protocol-neutral block & event contract

把 `CatAgentStreamEvent` / turn state 从 Anthropic-specific 类型解耦，改用中性类型：

- `CatAgentTextBlock { type: 'text'; text: string }`
- `CatAgentToolCallBlock { type: 'tool_call'; id: string; name: string; input: unknown }`
- `CatAgentNeutralBlock = CatAgentTextBlock | CatAgentToolCallBlock`（service-side turn state）
- `CatAgentUsageDelta { inputTokens?: number; outputTokens?: number }`（取代 `AnthropicUsage` 在事件契约里的位置）
- `CatAgentStreamEvent` 重新定义，**只引用 neutral 类型**：
  - `text_delta` 不变
  - `content_block_complete` 携带 `CatAgentNeutralBlock`（不是 `AnthropicContentBlock`）
  - `usage_update` 携带 `CatAgentUsageDelta`
  - `stop` / `stream_error` 不变

`CatAgentService.consumeTurn` 的 `blocksByIndex` / `contentBlocks` / `TurnResult` 全部从 `AnthropicContentBlock` 切到 `CatAgentNeutralBlock`；service 层不再 import 任何 `Anthropic*` 类型。

##### Layer 2: Adapter interface（HTTP + stream + transcript codec）

`CatAgentProtocolAdapter` 必须覆盖**整条 wire 边界**（HTTP / stream / transcript 三层），不能只抽 HTTP/stream：

1. **HTTP / stream**：
   - `buildRequestUrl(baseURL?: string): string`
   - `buildRequestHeaders(credentials: { apiKey: string }): Record<string, string>`
   - `buildRequestBody(input: AdapterRequestInput): unknown`
   - `parseStreamEvents(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncIterable<CatAgentStreamEvent>`（产出 neutral events；Anthropic-specific 解析+映射全部封闭在 adapter 内）
2. **Transcript codec**（P1 修复关键面）：
   - `encodeAssistantTurn(blocks: CatAgentNeutralBlock[]): AdapterMessage`
   - `encodeToolResults(results: ReadonlyArray<{ id: string; content: string; status: 'ok' | 'error' }>): AdapterMessage`
   - `AdapterMessage` 是 adapter 内部知道形状的不透明类型；service 不解构、不读 keys，只 push 到 `messages: AdapterMessage[]` 数组
3. **Family / id**：
   - `readonly clientFamily: string`（account resolver 选 profile family）
   - `readonly protocolId: string`（如 `anthropic-messages-v1`，用于审计 / Hub UI）

把 `CatAgentService.ts:229-233` 直接拼 `{ role: 'assistant', content: contentBlocks }` 和 `{ role: 'user', content: tool_result[] }` 的 Anthropic-specific 形状**全部上提到 adapter**；service 只持有 `AdapterMessage[]`，**不知道 protocol 怎么编**。

##### 实施细节（共用于 Layer 1 + Layer 2）

3. **抽 `AnthropicMessagesAdapter` 第一实现**：搬 `buildAnthropicMessagesUrl`、Anthropic header（`x-api-key + anthropic-version: 2023-06-01`）、`parseAnthropicSSE`（内部产出 neutral events，外部不暴露 Anthropic 类型）、Anthropic 请求 body 拼接、以及 `encodeAssistantTurn` 产出 `{ role: 'assistant', content: AnthropicContentBlock[] }`、`encodeToolResults` 产出 `{ role: 'user', content: { type: 'tool_result', tool_use_id, content }[] }`。命名保持 `Anthropic*` / `anthropic-*`（truthful 协议绑定）。
4. **AdapterFactory（最小实现）**：`createCatAgentProtocolAdapter(catConfig: CatConfig)` 当前唯一返回 `new AnthropicMessagesAdapter()`；留扩展点 `if (catConfig.catAgentProtocol === 'openai-chat') return new OpenAIChatAdapter()`。
5. **`resolveApiCredentials` 调整**：改为接受 `clientFamily` 参数（由 adapter 提供），代替写死的 `resolveForClient(projectRoot, 'anthropic', boundRef)`；单 adapter 下行为等价（`clientFamily='anthropic'`）。

##### Merge gate 强化（@gpt555 P2 finding）

G1 是 refactor-only，但"行为保持"必须在**两个层级**都可验证，避免 broad suite 绿但 wire contract 漂：

1. **既有测试 100% 不变化通过**：Phase A-F 全套 + Phase E SSE 流式回归（`catagent-phase-e.test.js`）+ Phase F write/exec 端到端（`catagent-phase-f.test.js`）
2. **新增 `AnthropicMessagesAdapter` golden-wire contract test**（AC-G10）：锁住 byte-stable 协议细节
   - request URL 字面值（含 `/v1/messages` 后缀拼接的所有 base URL 形态）
   - request headers 字面值（`anthropic-version: 2023-06-01`、`x-api-key`、`Content-Type: application/json`）
   - request body JSON 序列化形状（`model/max_tokens/messages/stream/tools/system` 全部 keys + value shape）
   - 每种 Anthropic SSE event → neutral event 映射（含 boundary case：unclosed block、orphan tool_use、missing message_stop）
   - `encodeAssistantTurn(blocks)` 产出 `{ role: 'assistant', content: AnthropicContentBlock[] }` 形状不变
   - `encodeToolResults(results)` 产出 `{ role: 'user', content: { type: 'tool_result', tool_use_id, content }[] }` 形状不变

Broad suite 绿了只能证明高层结果一致；wire-contract test 才能证明 G2 实施前**协议细节没漂**。

#### Slice G2: Second Adapter + 协议选择位（in-design）

> **触发**：co-creator dogfood 实证（2026-06-24）撞到 `403 permission_error: "This group does not allow /v1/messages dispatch"`——`blackaicoding.com` 这类 OpenAI-only 兼容代理不允许 Anthropic Messages endpoint。G1 vendor-neutral seam 已就位，但 catagent 当前协议写死 Anthropic Messages，OpenAI-only 代理用不了。
>
> **范围扩展（@gpt555 G2 pre-design push back）**：G2 不能只写"`OpenAIChatAdapter` + `api_key.clientFamily` schema 扩展"，必须先把"协议选择位"加到真相源——否则会被迫回到"按 account / model / baseUrl 猜协议"的老路。

G2 覆盖**四个真相源轴**（任何一个缺，G2 就是局部解，G3 上线时还要再补）：

##### Axis 1: 协议选择位写入真相源链路

1. **`CatConfig` schema**：新增 `catAgentProtocol?: 'anthropic-messages' | 'openai-chat'`
   - 仅在 `clientId === 'catagent'` 时合法
   - 缺省值：`'anthropic-messages'`（向下兼容 G1 既有 catagent member）
   - 持久化到 `cat-catalog.json` variant（与 `nativeToolLevel` / `commandPolicy` 同处）
2. **`runtime-cat-catalog.ts`**：
   - `RuntimeCatInput` / `RuntimeCatUpdate` 加 `catAgentProtocol` field
   - `createBreedFromInput` / `updateRuntimeCat` 落盘逻辑：仅 `clientId === 'catagent'` 时保留；切走 catagent 时与 `nativeToolLevel` / `commandPolicy` 同步清空
3. **`packages/api/src/routes/cats.ts`**：
   - `createCatSchema` + `updateCatSchema` zod schema 加 `catAgentProtocol`
   - POST / PATCH 写盘路径透传到 `runtime-cat-catalog`
   - GET response（`toCatResponse`）暴露给 Hub UI
4. **Hub UI**（`hub-cat-editor-advanced.tsx` + `hub-cat-editor.model.ts` + `hub-cat-editor.payload.ts`）：
   - `clientId === 'catagent'` 时显示"协议"下拉（`anthropic-messages` / `openai-chat`），与 `nativeToolLevel` 同行
   - 切走 catagent 时与 `nativeToolLevel` / `commandPolicy` 同步清空
   - 切换协议时给 hint：协议变化可能让现有 accountRef 不再兼容
5. **Hub UX 配合**：协议选择 + 账号 family 给可配的边界提示（OpenAI 协议需要 `clientFamily='openai'` 的 account；Anthropic 协议需要 `clientFamily='anthropic'`）

##### Axis 2: Adapter 选择策略 — fail-closed，禁止猜协议

1. **`catagent-protocol-factory.ts`**：
   - 当前 `return new AnthropicMessagesAdapter()` 无条件 → 改为基于 `catConfig.catAgentProtocol` dispatch
   - `'anthropic-messages'` → `AnthropicMessagesAdapter`
   - `'openai-chat'` → `OpenAIChatAdapter`（G2 新建）
   - **未识别值 → fail closed（throw）**：禁止 fallback 猜 baseUrl / model 形态
2. **不接受 runtime 探测路径**：spec 选项 B（探测 baseUrl 形态）显式拒绝——脆弱、不可审计、增加表面积
3. **不在 adapter 内部隐式 family**：adapter 自带 `clientFamily` 仍是只读属性（KD-15 truthful naming），factory 负责选择，service 层仍只持有 `CatAgentProtocolAdapter` interface

##### Axis 3: Shared routing contract 重审

> **设计决定 (KD-24, design gate iteration 收砚砚 P2)**：保留现有 `protocolForClient` / `builtinAccountFamilyForClient` 作为**纯 `clientId → default family/protocol` 映射**（client-level default），不接受 member-level `catConfig` 参数；新增 catagent-specific `effectiveProtocolForCat(catConfig)` 承担 protocol-aware 解析。
>
> 理由：现有 helper 被 `packages/shared/src/types/client-routing.ts:16`、`packages/api/src/routes/first-run-quest.ts:435`、`packages/web/src/components/hub-cat-editor.model.ts:368` 等通用流程直接消费，把它们改成依赖 member-level `catConfig` 会污染 shared routing 语义 + 强制全面扩参——这不是实现细节，是 shared contract 决策。

1. **保留 `protocolForClient('catagent') === 'anthropic'`** 作为 catagent client 的 default protocol——这仍然是 sensible default（缺省 `catAgentProtocol`'anthropic-messages'）；shared helper 的"通用 client-level mapping"语义不变
2. **新增 `effectiveProtocolForCat(catConfig: CatConfig): 'anthropic' | 'openai' | ...`**（in `@cat-cafe/shared`）：
   - 接收 member-level `catConfig`
   - 对 `catConfig.clientId === 'catagent'`：返回 `catConfig.catAgentProtocol === 'openai-chat' ? 'openai' : 'anthropic'`（基于 G2 选择位）
   - 对其他 `clientId`：fall through 到 `protocolForClient(clientId)` 保持现有行为
3. **`builtinAccountFamilyForClient('catagent')`**：同样保留为 client-level default `'anthropic'`；新增 `effectiveClientFamilyForCat(catConfig)` 承担 member-level family 解析（与 protocolForClient 同模式）
4. **`packages/shared/test/client-routing.test.js:10`** assertion 保留（保护 client-level default 语义不漂移）；G2 加新测试覆盖 `effectiveProtocolForCat` / `effectiveClientFamilyForCat` 行为
5. **下游消费方迁移 audit**：G2 必须列出所有 `protocolForClient('catagent')` / `builtinAccountFamilyForClient('catagent')` 调用点，**逐个判断**：
   - 走 client-level default（OK，不动）
   - 需要 member-level protocol-aware（迁移到 `effective*` 变体）
   - 当前已知调用点（按砚砚证据）：`client-routing.ts:16`、`first-run-quest.ts:435`、`hub-cat-editor.model.ts:368`、`account-resolver.ts` 内部 + `catagent-protocol-factory.ts`

##### Axis 4: AccountConfig schema 加 explicit `clientFamily` on api_key accounts

> 收掉 G1 P2 (`a3c775dc`) 留下的另一半——OAuth builtin family guard 已在 G1 收，api_key 账号没有 schema-level family 还是 G2 题。

1. **`AccountConfig` schema**（在 `@cat-cafe/shared`）：api_key 账号加 `clientFamily?: 'anthropic' | 'openai' | 'google' | ...`
2. **`accountToRuntimeProfile`**（`account-resolver.ts:234`）：
   - 对 api_key 账号，从 `account.clientFamily` 读 family 设到 `profile.client`
   - 缺省（向下兼容现有 api_key 账号未声明 family 的）：fall through，保留 G1 的 best-effort 路径
3. **Migration 策略**：现有 `account.json` 文件不强制写 `clientFamily`；Hub UI 在创建 api_key 账号时引导 user 选 family；CLI 初始化时（若有）也补
4. **完整 `clientFamily` fail-closed**：当 api_key 账号声明了 `clientFamily` + adapter 请求的 family 不匹配 → fail closed（同 G1 OAuth builtin 路径）

##### Axis 5: OpenAIChatAdapter 实现

1. `buildRequestUrl` → `${baseURL}/v1/chat/completions`（同样做 base URL 末尾 `/v1` 归一化，复用 G1 pattern）
2. `buildRequestHeaders` → `Authorization: Bearer ${apiKey}` + `Content-Type: application/json`
3. `buildRequestBody` → OpenAI 风格 `{ model, messages, tools, stream, max_tokens }`
   - `tools`：function-calling schema `{ type: 'function', function: { name, description, parameters } }`
   - `tool_choice`：先不支持，按 OpenAI 默认（model autonomy）
4. `parseStreamEvents` → OpenAI SSE delta → neutral `CatAgentStreamEvent`：
   - `choices[0].delta.content` → `text_delta`
   - `choices[0].delta.tool_calls[i]` → 累计成 `CatAgentToolCallBlock` → `content_block_complete`（id 字段映射 `tool_calls[i].id`，name 映射 `tool_calls[i].function.name`，input 映射 `JSON.parse(tool_calls[i].function.arguments)`）
   - `choices[0].finish_reason` → `stop` 事件
   - `usage`（chunk 内或末尾）→ `CatAgentUsageDelta`（`prompt_tokens → inputTokens`，`completion_tokens → outputTokens`，无 cache 字段时省略）
5. `encodeUserPrompt` → `{ role: 'user', content: prompt }`
6. `encodeAssistantTurn`（neutral blocks → OpenAI assistant message）：
   - text blocks → `content` 字符串（拼接）或 `content: null`（若仅 tool_calls）
   - tool_call blocks → `tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(input) } }]`
7. `encodeToolResults`（neutral results → OpenAI tool messages）：
   - 每个 result → 一条 `{ role: 'tool', tool_call_id: r.id, content: r.content }`（OpenAI 用多条 message 而不是 Anthropic 的 single user-with-content-array 形状——`encodeToolResults` 返回 `AdapterMessage` 仍是 opaque，内部可以是数组或合并消息）
8. `mapError` → `OpenAI API error (<status>): <msg>`（truthful 命名）
9. `isTerminalStopReason` → OpenAI 终态白名单 `'stop' | 'length' | 'content_filter' | 'tool_calls' (非 terminal)`
10. `clientFamily = 'openai' as const`，`protocolId = 'openai-chat-v1' as const`

##### Slice G3 (deferred): Third Adapter — Gemini

在 G2 验证 seam 之后加 Gemini，证明 seam 不是 Anthropic↔OpenAI 二元抽象，而是真的可扩展。Slice G3 详细方案在 G2 完成后另起 design——其时若 Axis 1-4 都已落地，G3 只剩 adapter 实现 + 协议白名单扩展。

## Acceptance Criteria

### Phase A（RFC 收敛 + ADR 边界）
- [x] AC-A1: `clowder-ai#434` 标题/正文完成定位修正，统一使用 “native provider / opt-in API path” 口径
- [x] AC-A2: ADR-001 修订草案落盘，明确 CLI 仍是默认主路径，API path 仅为 opt-in
- [x] AC-A3: F143 / F149 / F050 边界写入 spec/RFC，不再混成“另一套 runtime”
- [x] AC-A4: 正式 feature 编号分配完成，cat-cafe 真相源与社区 issue 双向链接

### Phase B（Host Integration + Security Baseline）
- [x] AC-B1: CatAgent 凭据解析复用现有 account-binding 链路（`resolveBoundAccountRefForCat -> resolveForClient`），不存在任意 key 扫描 fallback
- [x] AC-B2: workspace 边界复用共享安全 helper，symlink 场景有回归测试
- [x] AC-B3: 工具参数注入防护在 host/provider integration layer 落地，有针对性测试
- [x] AC-B4: provider 的 `done/error/usage` 终态审计在现有链路中可验证

### Phase C（Minimal Native Provider）
- [x] AC-C1: provider 以 opt-in 方式注册，不改变现有默认 provider 选择语义
- [x] AC-C2: 单轮文本任务可端到端执行，并正确产出 `session_init/text/error/done`
- [x] AC-C3: abort / timeout / error 情况下无悬挂 session 或缺失终态
- [x] AC-C4: v1 不开放 write/exec/跨线程副作用工具

### Phase D（Read-Only Tools + Compaction Follow-up）
- [x] AC-D1: read-only tools 只有在宿主层权限边界复用完成后才开放
- [x] AC-D2: compact/microcompact 未进入已交付路径；provider path 不依赖 compact，未破坏身份约束和审计链

### Phase E（SSE Streaming + Fail-Closed Turn Handling）
- [x] AC-E1: text tokens 按 chunk 产出到上游（每个 `text_delta` → 一个 `type: 'text'` AgentMessage）
- [x] AC-E2: `tool_use` blocks 按 index 收集后执行；完整 assistant content（text + tool_use）按顺序写回消息历史
- [x] AC-E3: usage 从 stream events 提取（input 来自 `message_start`，output 来自 `message_delta` 快照），最终 `done` 携带累计 usage
- [x] AC-E4: stream error / disconnect / missing `message_stop` / unclosed block → `error + done`；第一轮错误保留 zero-usage 契约；orphan `tool_use` 发 failed `tool_result`
- [x] AC-E5: strict streaming fail-closed —— 不做 non-streaming fallback；任意 stream error 直接终止并产出终态

### Phase F（Write/Exec Tool Surface）
- [x] AC-F1: `CatConfig` 支持 `nativeToolLevel`，默认 `L0`
- [x] AC-F2: `buildToolRegistry` 根据 `nativeToolLevel` 注册 `L0/L1/L2` 工具面
- [x] AC-F3: `resolveCreatePath()` 实现：最近存在祖先 `realpath` 校验 + denylist 重跑，阻止 symlink 父目录逃逸
- [x] AC-F4: `write_file` 实现原子写（tmp + rename），写入上限 256 KiB
- [x] AC-F5: `patch_file` 实现 compare-and-swap：`expected_hash` 校验 + `old_text` 唯一匹配
- [x] AC-F6: write/patch 产出独立结构化审计，不依赖 transcript 截断
- [x] AC-F7: `CatConfig` 支持 `commandPolicy`，默认空（fail-closed）
- [x] AC-F8: `run_command` 只接受结构化 `{ binary, args }` 输入，不接受字符串命令
- [x] AC-F9: 命令策略矩阵按 allowlist-first 的 `binary -> subcommand -> flags/arg patterns` 校验，任一未声明立即拒绝
- [x] AC-F10: `run_command` 通过 `execFile` 执行，`cwd` 锁定 workspace，超时 30s，`maxBuffer` 512 KiB
- [x] AC-F11: env 仅透传 `PATH` + `NODE_ENV`，不透传 `HOME`
- [x] AC-F12: run_command 的执行/拒绝均产出结构化审计，并遵循 F149 failure taxonomy
- [x] AC-F13a: mandatory host-native scoped callback tool 仅为 `update_current_task_status`，且只能作用于 current invocation / current task
- [x] AC-F13b: `update_current_task_status` 无 current task 时不注册或拒绝；只允许 `status` / `progress` / `summary`，禁止 `owner` / `assignee` / `kind` / `targetCats` / `threadId` / `taskId`
- [x] AC-F13c: optional `post_current_thread_status` 若实现，必须 no-route / no-mention / no-targetCats / no-cross-thread；`create_task` / raw `post_message` / `cross_post_message` / 任意 A2A routing 明确 deferred
- [x] AC-F13d: callback tools 产出独立结构化审计，并遵循 F149 failure taxonomy
- [x] AC-F14: 行为测试覆盖写入越权、symlink 祖先逃逸、大小超限、hash 不匹配、策略矩阵拒绝、超时杀进程、env 不泄露、callback scoping 拒绝
- [x] AC-F15: ADR-001 修订完成，明确 F159 Phase F 在分级授权下有条件开放 write/exec；这是 Phase F merge gate

### Phase G（Protocol Abstraction）

#### Slice G1（Adapter Seam — refactor-only）
- [ ] AC-G1: 新增 `CatAgentProtocolAdapter` 接口，定义 `buildRequestUrl/Headers/Body` + `parseStreamEvents` + `clientFamily` + `protocolId`
- [ ] AC-G2: 抽出 `AnthropicMessagesAdapter` 实现，把现有 `buildAnthropicMessagesUrl` / Anthropic header / `parseAnthropicSSE` / 请求 body 拼接全部搬进 adapter；命名保持 `Anthropic*`（truthful）
- [ ] AC-G3: `CatAgentService` 全部走 adapter；service 层不再直接出现 `Anthropic*` 标识符
- [ ] AC-G4: `createCatAgentProtocolAdapter(catConfig)` factory 落地，当前唯一返回 `AnthropicMessagesAdapter`
- [ ] AC-G5: `resolveApiCredentials` 接受 `clientFamily` 参数（由 adapter 提供）；当前等价于 `'anthropic'`
- [ ] AC-G6: Phase A-F 全部既有测试 100% 不变化通过（refactor-only 行为保持）
- [ ] AC-G7: Phase E SSE 流式回归（`catagent-phase-e.test.js`）100% 不变化通过
- [ ] AC-G8: Phase F write/exec 端到端测试 100% 不变化通过
- [ ] AC-G9: 跨 family review 通过
- [ ] AC-G10: 新增 `AnthropicMessagesAdapter` golden-wire contract test（byte-stable）：request URL / headers / body 序列化、stream event → neutral event 映射（含 unclosed block / orphan tool_use / missing message_stop 边界）、`encodeAssistantTurn` / `encodeToolResults` 产出的 transcript 形状不变
- [ ] AC-G11: `CatAgentStreamEvent` 重新定义为只引用 neutral 类型（`CatAgentNeutralBlock` / `CatAgentUsageDelta`），`catagent-stream-parser.ts` 不再 export Anthropic-specific 类型给 service 层
- [ ] AC-G12: `CatAgentService` 持有的 `messages: AdapterMessage[]` 是 adapter-opaque 类型；service 层全文搜索不到 `Anthropic*` 标识符（含 import 和类型引用）

#### Slice G2（OpenAIChatAdapter + 协议选择位 — in-design）

##### Axis 1: 协议选择位写入真相源
- [ ] AC-G13: `CatConfig` schema 新增 `catAgentProtocol?: 'anthropic-messages' | 'openai-chat'`，仅 `clientId === 'catagent'` 时合法；缺省 `'anthropic-messages'`（向下兼容 G1 既有 catagent member）
- [ ] AC-G14: `runtime-cat-catalog.ts` 持久化 `catAgentProtocol` 与 `nativeToolLevel` / `commandPolicy` 同处；切走 catagent 时同步清空
- [ ] AC-G15: `routes/cats.ts` create/update schema + POST/PATCH 写盘路径 + GET response 全部透传 `catAgentProtocol`
- [ ] AC-G16: Hub UI 在 `clientId === 'catagent'` 时显示协议下拉，切走 catagent 时同步清空，协议变化时 hint 协议-账号兼容边界

##### Axis 2: Adapter 选择策略 — fail-closed
- [ ] AC-G17: `catagent-protocol-factory.ts` 基于 `catConfig.catAgentProtocol` dispatch；未识别值 fail closed（throw），禁止 fallback 猜协议（spec 选项 B 显式拒绝）

##### Axis 3: Shared routing contract
- [ ] AC-G18: 保留 `protocolForClient` / `builtinAccountFamilyForClient` 作为纯 client-level default mapping（不变），新增 `effectiveProtocolForCat(catConfig)` + `effectiveClientFamilyForCat(catConfig)` 在 `@cat-cafe/shared` 承担 catagent-specific protocol-aware 解析 (KD-24)
- [ ] AC-G19: 保留 `client-routing.test.js:10` 旧 assertion 不变（保护 client-level default 语义）；G2 加新测试覆盖 `effectiveProtocolForCat` / `effectiveClientFamilyForCat` 含 `anthropic-messages` + `openai-chat` 两种 + 非 catagent fallthrough；audit 所有 `protocolForClient('catagent')` / `builtinAccountFamilyForClient('catagent')` 调用点，逐个判断走 default 还是迁移到 effective* 变体

##### Axis 4: AccountConfig api_key clientFamily
- [x] AC-G20: `AccountConfig` (@cat-cafe/shared) 在 api_key 账号 schema 加 optional `clientFamily?: 'anthropic' | 'openai' | 'google' | 'kimi' | 'dare' | 'opencode'`（coexists with F171 freeform `clientId`；rename 被否决，原因是 `accounts.json` in the wild 已有 `clientId` set，silent data loss > naming duplication；TODO G3+ Hub UI 迁移后 sunset `clientId`）
- [x] AC-G21: `accountToRuntimeProfile` 对 api_key 账号从 `account.clientFamily` 读 family 设到 `profile.client`；缺省 fall through（向下兼容现有 api_key 账号未声明 family）；严格 NEVER 从 legacy `clientId` 读，避免改动 F171 行为
- [x] AC-G22: `catagent-credentials.ts` 的 G1 narrow guard 在 api_key + 声明 family 路径上也生效（完整 family fail-closed）；现有 guard `profile.client !== undefined && profile.client !== clientFamily` 行为不变，AC-G21 让 api_key 路径自动落入

##### Axis 5: OpenAIChatAdapter 实现
- [x] AC-G23: `OpenAIChatAdapter` 实现 `CatAgentProtocolAdapter` 全部七个方法 + `clientFamily='openai'` + `protocolId='openai-chat-v1'`
- [x] AC-G24: tool calling 在 OpenAI 协议下 lossless 映射：`tool_calls[i].id` ↔ neutral `id`，`tool_calls[i].function.name` ↔ neutral `name`，`JSON.parse(tool_calls[i].function.arguments)` ↔ neutral `input`
- [x] AC-G25: 新增 `openai-chat-adapter-golden.test.js` golden-wire byte-stable lock（与 G1 Anthropic golden-wire 同形式）：URL / headers / body / SSE event 映射 / transcript codec / mapError / isTerminalStopReason
- [x] AC-G26: 新增 e2e 行为测试：建一只 `clientId='catagent'` + `catAgentProtocol='openai-chat'` 的猫，绑一个 mock OpenAI Chat 账号，跑 single-turn 文本 + 含 tool_call 的多轮路径，断言行为对齐 G1 Anthropic 路径

##### Cross-cutting
- [x] AC-G27: AC-G12 grep verifier 扩展：service 层也不允许 `Openai*` / `openai*` 代码标识符（保持 vendor-neutral）；扩多协议后 verifier 仍 pass
- [ ] AC-G28: 跨 family review 通过；Hub UI 跨 protocol switch UX 走暹罗猫审美 review

##### Regression hard gate (G2 merge 必经，收砚砚 P1 finding)
- [x] AC-G29: G1 既有的 Anthropic broad suite (catagent-phase-e/f/d/provider/security-baseline/stream-parser/phase-b-completion = 130+ tests) 在 G2 之后 **100% 不变化通过**；任何 regression 视为 G2 blocker，不允许"新路径全绿就 merge"
- [x] AC-G30: G1 `AnthropicMessagesAdapter` golden-wire contract test (`anthropic-messages-adapter-golden.test.js`, 35 tests) 在 G2 之后 **byte-stable 100% pass**——共享 routing / catalog / routes / credentials 改动不能让 Anthropic wire shape 漂移哪怕 1 byte
- [x] AC-G31: AC-G12 verifier 不仅 service neutrality PASS，还必须验证现有 catagent member 在 `catAgentProtocol` 缺省时**继续走 Anthropic adapter**（factory 默认分支行为不变）

> Implementation note (2026-06-16): `update_current_task_status` 只从 thread metadata 中显式选中的 current task 注入；callback 执行时会重新校验 `threadId` 和 `ownerCatId`。未选中 task、跨 thread、跨 owner 时不注册该工具。`post_current_thread_status` / raw `post_message` / `create_task` / cross-thread / A2A routing 仍未进入 Phase F 工具面。

## 需求点 Checklist

| ID | 需求点（社区原话/转述） | AC 编号 | 验证方式 | 状态 |
|----|-------------------------|---------|----------|------|
| R1 | “继续探索 CatAgent，但不要回到 #397 的实现形态” | AC-A1, AC-A3 | RFC/Spec 对照检查 | [x] |
| R2 | “给这个方向一个正式 feature 编号” | AC-A4 | spec + BACKLOG + issue 链接 | [x] |
| R3 | “API path 只作为 opt-in，不改变默认主路径” | AC-A2, AC-C1 | ADR + 配置验证 | [x] |
| R4 | “安全三项是硬 gate，不是 backlog” | AC-B1, AC-B2, AC-B3 | 测试 + review 记录 | [x] |
| R5 | “如果要做，就按 provider 能力逐步推进” | AC-C2, AC-C4, AC-D1, AC-E1, AC-E4 | phased implementation review | [x] |
| R6 | “轻量级、与 Cat Cafe 强耦合、内置可干活的 agent” | AC-F1, AC-F4, AC-F8, AC-F13a | spec + design review | [x] |
| R7 | “权限模型走分级工具，不默认全开” | AC-F1, AC-F2, AC-F7, AC-F9 | spec + tests | [x] |

### 覆盖检查
- [x] 每个需求点都能映射到至少一个 AC
- [x] 每个 AC 都有验证方式
- [x] 前端需求已准备需求→证据映射表（若适用）

## Dependencies

- **Evolved from**: F143（native provider 的宿主契约来自 F143）
- **Related**: F149（runtime ops 经验输入，但 CatAgent 不复用 ACP carrier 模型）
- **Related**: F153（provider usage / audit / observability 能力复用）
- **Related**: F050（External Agent Contract——Phase F 的 capability / safety 边界输入）
- **Related**: F070（Portable Governance——Phase F 仍需 governance fail-closed）

## Risk

| 风险 | 缓解 |
|------|------|
| 再次把 provider 做成“平台内第二套 runtime” | Phase A 先收敛定位，title/body/spec 全部统一口径；Phase F 继续复用宿主 façade |
| provider 自己重写安全边界，导致宿主层失血 | 安全三项全部上提到 host/provider integration layer；新增 `resolveCreatePath` 也走共享边界 |
| API path 模糊化后冲击 CLI 默认路线 | ADR-001 明确 opt-in only，默认路径不变；Phase F 仍不替代 CLI |
| 一次性把 loop/tools/compact 全塞进首版实现 | 强制分 Phase，先最小 provider，再扩 read-only tools，再做 write/exec |
| 新建文件穿过 symlink 父目录逃逸 workspace | `resolveCreatePath` 找最近存在祖先 `realpath` 校验，拒绝 symlink 父目录创建 |
| `run_command` 的粗粒度白名单退化为任意执行 | 用 `commandPolicy` 策略矩阵替代 `argv[0]` 级白名单；不接受字符串命令 |
| side-effect 审计依赖 transcript 截断导致证据不足 | write/exec 工具独立产出结构化审计记录 |
| callback tool 触发 A2A / cross-thread / task lifecycle 连锁副作用 | Phase F Core 只交付 `update_current_task_status`；raw message/task/cross-thread/A2A routing deferred |
| F159 原 ADR 边界与 Phase F write/exec 冲突 | ADR-001 修订作为 Phase F merge gate，不把契约修订后置到 launch gate |
| Phase G 抽 adapter 后退化成 cosmetic 抽象，不实施第二 adapter | Slice G2（OpenAI Chat）列入 spec roadmap，G1 仅作为 seam；G2 之前不对外宣称多协议 |
| G1 seam 只抽 HTTP/stream 半边，transcript / 事件类型仍绑 Anthropic | KD-17：G1 seam 必须覆盖 HTTP + stream + transcript codec + 中性 block/event 类型四层；AC-G11/G12 验证 service 层全文搜索不到 `Anthropic*` | 
| G1 refactor "行为保持"靠 broad suite 兜底，wire contract 漂移未被覆盖 | KD-18 + AC-G10：新增 `AnthropicMessagesAdapter` golden-wire contract test，锁住 request URL / headers / body / stream event 映射 / transcript 形状 byte-stable |
| G2 只实现 adapter 不加真相源选择位 → 被迫"按 account/model/baseUrl 猜协议" | KD-19 + AC-G13~G19：先扩 CatConfig / catalog / routes / Hub / shared routing 协议选择位，factory fail-closed；G2 不写 protocol detection 代码 |
| Hub UI 切换协议后 accountRef 跟新 protocol 不兼容（如 anthropic→openai 但 accountRef 仍是 anthropic builtin） | AC-G16 hint + AC-G22 完整 fail-closed credentials guard；Hub UX 协议切换时给账号兼容性 warning |
| OpenAI Chat 协议下 tool calling 映射 lossless 难度高（function call arguments stream chunked, id 跨 chunk 累计） | AC-G24 显式 acceptance；golden-wire test 覆盖累计 tool_call 边界 case |
| `protocolForClient('catagent')` 改 protocol-aware 影响下游 audit / OTel / metrics 路由 | AC-G18 + AC-G19 audit 所有 hardcoded routing 假设；shared routing contract 重审作为 G2 merge gate 一部分 |
| api_key 账号现有未声明 family 的，AC-G20/G21 backward-compat fall through 可能让 G1 narrow guard 继续半空 | KD-22 + AC-G22：现有账号 best-effort 不阻塞，新建账号 Hub 引导；G3 时若仍残留可再设迁移 deadline |
| G2 merge gate 只看新路径全绿，共享 routing/catalog/routes/credentials 改坏默认 Anthropic 路径也能 merge | KD-25 + AC-G29/G30/G31：显式双门，G1 broad suite + Anthropic golden-wire byte-stable + factory 默认分支不变 |
| 把 `protocolForClient` 改成接 catConfig 参数 → 通用调用点全面扩参 + shared routing 语义被污染 | KD-24：保留现有 helper 作 client-level default，新增 `effectiveProtocolForCat` / `effectiveClientFamilyForCat` 承担 member-level protocol-aware 解析 |
| Phase G refactor 破坏 Phase F write/exec 行为 | G1 限定 refactor-only，merge gate = Phase A-F 既有测试 100% 不变化通过 |
| Adapter 选择策略未定，G2 实施时陷入 design 反复 | Slice G2 单独走 design gate，G1 不预判选择策略 |
| `resolveApiCredentials` 改参数化 `clientFamily` 后破坏现有 catagent 凭据解析 | G1 在 Anthropic 单 adapter 下行为等价；现有回归测试 100% 覆盖 |

## Key Decisions

| # | 决策 | 理由 | 日期 |
|---|------|------|------|
| KD-1 | 以 “CatAgent Native Provider” 立项，不再使用 “Thin Runtime” 作为正式 feature 名称 | 避免架构层级误导 | 2026-04-11 |
| KD-2 | API path 为 opt-in only，CLI 仍是默认主路径 | 维持 ADR-001 主决策稳定性 | 2026-04-11 |
| KD-3 | account-binding / workspace boundary / injection prevention 全部视为 host/provider integration layer 的硬边界 | 安全边界不能下沉成 provider 自行约定 | 2026-04-11 |
| KD-4 | `feat/catagent` 分支只作为 spike 参考，不作为可直接 merge 的实现分支 | #397 已被定性为 architecture-blocked spike | 2026-04-11 |
| KD-5 | 为该方向分配正式 feature 编号 F159 | 这是独立、用户可感知的新 provider 能力，不是 F143/F149/F050 的纯子任务 | 2026-04-11 |
| KD-6 | Phase E 采用 strict streaming fail-closed，不保留 conditional non-streaming fallback | 当前 provider path 更需要清晰审计边界与确定性终态，而不是条件重试复杂度 | 2026-04-24 |
| KD-7 | Write/Exec 继续作为 F159 Phase F 推进，不再使用本地误开的 F188 作为独立 feature 真相源 | Feature 编号一号一真相源；不碰现有 canonical F188（Library Stewardship） | 2026-06-16 |
| KD-8 | Phase F 采用分级工具面（`L0/L1/L2`） | 平衡能力与安全，默认 `L0` 向下兼容 F159 已交付行为 | 2026-06-16 |
| KD-9 | 新增 `resolveCreatePath`，不直接复用 `resolveSecurePath` 处理新建文件 | `resolveSecurePath` 对 `ENOENT` 放过，无法覆盖 symlink 父目录逃逸 | 2026-06-16 |
| KD-10 | `patch_file` 采用 compare-and-swap（`expected_hash` + 精确文本替换） | 防止基于陈旧读取的盲替换 | 2026-06-16 |
| KD-11 | `run_command` 采用结构化 `{ binary, args }` + `commandPolicy`，不接受字符串命令 | 消除 shell 解析歧义，并把命令授权粒度收紧到 `binary/subcommand/flag` | 2026-06-16 |
| KD-12 | Cat Cafe 深度集成先收 `F3-min`：mandatory 仅 `update_current_task_status`，raw message/task/cross-thread/A2A routing 后置 | 保留“强耦合”产品目标，同时避免 callback surface 触发 A2A / task lifecycle 级联副作用 | 2026-06-16 |
| KD-13 | write/exec side-effect 工具必须独立产出结构化审计 | 现有 transcript 中 500 字符 `tool_result` 截断不足以承担 side-effect audit | 2026-06-16 |
| KD-14 | Phase G 走「先抽 seam (G1)，再加第二 adapter (G2)」两步走，G1 限定 refactor-only | 避免一次性大重构同时引入新协议；先证明 seam 不破坏 Phase A-F 既有行为，再讨论协议选择策略 | 2026-06-24 |
| KD-15 | `AnthropicMessagesAdapter` 保留 `Anthropic*` 命名（不改成 `CatAgent*` 通用名） | adapter 是协议特定实现，命名 truthful；中性命名留给 service 层入口（`adapter.buildRequestUrl()`），区分"通用入口"与"协议特定实现"两层 | 2026-06-24 |
| KD-16 | G2 候选第二 adapter = OpenAI Chat Completions（非 Gemini） | OpenAI 兼容代理覆盖最广，且与 Anthropic Messages 在 tool calling / stream event / usage 字段三处差异最大，最能压力测试 seam 是否真的多协议 | 2026-06-24 |
| KD-17 | G1 seam 必须覆盖 **HTTP + stream + transcript codec + 中性 block/event 类型** 全部四层，不允许只抽 HTTP/stream 半边 | @gpt555 design gate P1：若 G1 只抽 HTTP/stream 半边，service 仍持有 `AnthropicContentBlock` turn state + 直接拼 `{ role, content }` 形状的 message 数组，G2 上 OpenAI Chat 时还要再拆一次；先抽一半 seam = 没抽 seam | 2026-06-24 |
| KD-18 | G1 merge gate 必须 broad suite 绿 + `AnthropicMessagesAdapter` golden-wire contract test 绿，二者缺一不可 | @gpt555 design gate P2：refactor-only 的"行为保持"在 broad suite 层级只能证明高层结果一致；wire-contract test 才能证明协议细节 byte-stable，避免 G2 前协议漂移 | 2026-06-24 |
| KD-19 | G2 不只 implement OpenAIChatAdapter，必须先在真相源（CatConfig + catalog + routes + Hub + shared routing）加协议选择位 | @gpt555 G2 pre-design push back：当前真相源里根本没有 catagent 协议选择位（`catagent-protocol-factory.ts:22` 注释占位但代码无条件返回 Anthropic；`runtime-cat-catalog` 只持久化 nativeToolLevel/commandPolicy；`routes/cats.ts` schema 无 protocol；`client-routing.test.js:10` 写死 `protocolForClient('catagent') === 'anthropic'`）。先 implement adapter 会被迫回到"按 account/model/baseUrl 猜协议"老路 | 2026-06-24 |
| KD-20 | adapter 选择策略 fail-closed，禁止 runtime 猜协议 | spec 选项 B（探测 baseUrl 形态）脆弱、不可审计、扩协议时表面积指数增长；显式 `catAgentProtocol` 字段是唯一受信入口；未识别值 throw，不 fallback | 2026-06-24 |
| KD-21 | adapter `clientFamily` 仍是只读属性（KD-15），factory 负责选择，service 仍只持 interface | 维持 G1 三层分离（service 中性 / factory 选择 / adapter truthful），protocol-aware 决策点单一可审计 | 2026-06-24 |
| KD-22 | G2 完成 G1 P2 留下的另一半：`AccountConfig` api_key 账号 schema 加 explicit `clientFamily` | G1 narrow guard 只 cover OAuth builtin；api_key 路径 best-effort 不算 fail-closed。G2 schema 扩展 + Hub UI 创建账号引导 + 向下兼容现有未声明 family 的 api_key 账号 | 2026-06-24 |
| KD-23 | G2 触发自 co-creator 真实 dogfood (2026-06-24 OpenAI-only 代理 403 permission_error)，从"过度工程"重定为"真实需求" | 实证驱动节奏决定 | 2026-06-24 |
| KD-24 | 保留现有 `protocolForClient` / `builtinAccountFamilyForClient` 作为纯 client-level default mapping，**不接受 member-level `catConfig` 参数**；新增 catagent-specific `effectiveProtocolForCat` / `effectiveClientFamilyForCat` 承担 protocol-aware 解析 | @gpt555 G2 design gate iteration P2：把 shared helper 改成依赖 member-level `catConfig` 会污染 shared routing 语义 + 强制通用调用点 (`client-routing.ts:16` / `first-run-quest.ts:435` / `hub-cat-editor.model.ts:368`) 全面扩参。两层 helper（client-level default + member-level effective）分离 — 这是 shared contract 决策，不是实现细节 | 2026-06-24 |
| KD-25 | G2 merge gate 不只要求新路径全绿，还要求 G1 Anthropic broad suite + golden-wire byte-stable 全绿（双门） | @gpt555 G2 design gate iteration P1：spec 把 `catAgentProtocol` 缺省承诺成回落 `anthropic-messages`，但若 merge gate 只看 OpenAI 新路径，共享 routing / catalog / routes / credentials 改动可能让默认 Anthropic 路径回归被 merge——AC-G29~G31 把 G1 byte-stable 锁成显式硬门 | 2026-06-24 |

## Review Gate

- Phase A: Ragdoll + Maine Coon架构 review → operator拍板
- Phase B-E: 跨 family review
- Phase F-F1/F2: 安全敏感，必须跨 family review
- Phase F-F3: 产品方向 + 宿主边界联合 review
- Phase F merge gate: AC-F15（ADR-001 边界修订）必须先完成
- Phase F exit / launch gate: 默认权限策略、dogfood、审计可见性、fail-closed 验证
- Phase G Slice G1: 跨 family review（必须）；merge gate = AC-G6 / AC-G7 / AC-G8 全过（refactor-only 行为保持）
- Phase G Slice G2: 独立 design gate（本 spec PR）；spec merge 后跨 family code review；merge gate = AC-G13~G28 全部 met + golden-wire OpenAIChatAdapter PASS + AC-G12 verifier 扩展后仍 PASS + **G1 Anthropic 回归硬门 AC-G29/G30/G31 全过**（双门，KD-25）
- Phase G Slice G3 (Gemini, deferred)：G2 完成后另起 design gate；若 Axis 1-4 已落地，G3 只剩 adapter 实现 + 协议白名单扩展

## Revision History

| 日期 | 变更 | 原因 |
|------|------|------|
| 2026-04-11 | F159 立项：Opt-in Native Provider 路径 | 把 #397 spike 收敛为 F143 下的 native provider 方向 |
| 2026-04-24 | Phase E：strict streaming fail-closed 定稿 | 明确 streaming 终态和审计边界 |
| 2026-06-16 | Phase F：Write/Exec Tool Surface 规划并回归 F159 真相源 | 本地误开的 F188 草案并回 F159；保持 feature 编号单一真相源 |
| 2026-06-16 | Phase F F1/F2/F3-min 实现完成，进入 review | 分级工具面、write/patch、run_command policy、current-task scoped callback 已落地 |
| 2026-06-24 | Phase G 立项：Protocol Abstraction（in-design） | 承接 co-creator 反馈："CatAgent 拼 endpoint URL 入口应改为通用命名，不绑定某厂商"；抽 `CatAgentProtocolAdapter` seam，区分通用入口（service 层）与协议特定实现（adapter 层） |
| 2026-06-24 | Phase G Slice G1 spec 修订（design gate iteration） | @gpt555 design gate review P1+P2：G1 seam 扩到 HTTP/stream/transcript codec/中性 block & event 四层；新增 AC-G10/G11/G12 + KD-17/18 + golden-wire contract test 强化 merge gate；service 层全文不再出现 `Anthropic*` 标识符 |
| 2026-06-24 | Phase G Slice G1 implementation merge (`b8bab800` PR #23) | refactor-only adapter seam + AnthropicMessagesAdapter 落地；166/166 tests pass + AC-G12 verifier PASS；P2 OAuth builtin family guard 收口 |
| 2026-06-24 | Phase G Slice G2 升级到 in-design：协议选择位 + OpenAIChatAdapter | 触发：co-creator dogfood 撞 OpenAI-only 代理 `403 permission_error: "This group does not allow /v1/messages dispatch"` 实证 (KD-23)；@gpt555 G2 pre-design push back 扩 scope 到真相源协议选择位 + shared routing contract + api_key clientFamily schema 4 axes (KD-19~22)；新增 AC-G13~G28 |
| 2026-06-24 | Phase G Slice G2 spec 修订（design gate iteration） | @gpt555 G2 design gate review P1+P2：P1 merge gate gap → AC-G29/G30/G31 + KD-25 把 G1 Anthropic broad suite + golden-wire + factory 默认分支锁成显式硬门；P2 shared helper contract 二选一 → KD-24 拍板保留现有 `protocolForClient` / `builtinAccountFamilyForClient` 作 client-level default，新增 `effectiveProtocolForCat` / `effectiveClientFamilyForCat` 承担 member-level protocol-aware，避免污染 shared routing 语义 |
| 2026-06-24 | Phase G Slice G2 Axis 4 impl ship (`2af8aad2` + biome chore `f8e6ff6c`) | AC-G20/G21/G22 全过：AccountConfig api_key `clientFamily` 字段 + `accountToRuntimeProfile` 设 `profile.client` + G1 narrow guard 自动 cover api_key 路径；KD-22 收口。106/106 定向回归 PASS (security-baseline 21 + account-resolver 18 + phase-e 8 + phase-f 16 + golden-wire 8 + factory 35) + AC-G12 verifier PASS。Rename `clientId` → `clientFamily` 被否决（数据兼容 > 命名一致），保留两字段共存 + TODO 标记 G3+ sunset |
| 2026-06-24 | Phase G Slice G2 Axis 5 impl ship | AC-G23/G24/G25/G26/G27 + regression hard gate AC-G29/G30/G31 全过：`OpenAIChatAdapter` 落地、factory dispatch 切到真实实现、OpenAI golden-wire + vendor-neutral verifier + OpenAI e2e 行为测试新增；Anthropic broad suite + golden-wire + default-branch verifier 继续全绿。194/194 定向回归 PASS |
