---
feature_ids: [F159]
related_features: [F143, F149, F153, F050, F070]
topics: [provider, agent-runtime, api-path, architecture, security, community]
doc_kind: spec
created: 2026-04-11
community_issue: "zts212653/clowder-ai#434"
---

# F159: CatAgent Native Provider — Opt-in API Path

> **Status**: in-review（Phase A-E 已合入；Phase F F1/F2/F3-min 已实现，等待跨 family review + dogfood；Phase G `in-design`：Protocol Abstraction） | **Owner**: 社区 (bouillipx) + Ragdoll + Maine Coon | **Priority**: P1

## Why

社区在 `clowder-ai#397` 中提交了一个 CatAgent 薄运行时 spike，试图用 Anthropic API 直连方式提供一条 opt-in agent path。maintainer review 已经确认这条 PR 不能直接合入：原实现同时混杂了架构层级漂移、account-binding 绕过、workspace 边界不严、以及 ADR-001 未闭环等问题。

但 `clowder-ai#434` RFC 也证明了另一个事实：如果把这件事重新表述为 **F143 宿主抽象下的 native provider**，而不是“平台再造一套独立 runtime”，那么它就不再是错误方向，而是一个值得单独立项、逐步收敛的产品能力。

因此 F159 的目标不是“重启 #397”，而是把这条社区方向收敛成一个**受约束的 first-party provider feature**：CLI 仍是默认主路径，CatAgent 只作为 opt-in API path 存在，并且必须先满足宿主层安全边界和治理约束。

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

#### Slice G2 (deferred): Second Adapter — OpenAI Chat Completions

在 G1 seam 上加第二个 protocol adapter（候选 OpenAI Chat Completions），证明 seam 是真的多协议而不是 cosmetic 抽象：

1. `OpenAIChatAdapter` 实现：
   - `buildRequestUrl` → `${baseURL}/v1/chat/completions`
   - `buildRequestHeaders` → `Authorization: Bearer ${apiKey}`
   - `buildRequestBody` → OpenAI 风格 messages + tools（function calling）
   - `parseStreamEvents` → 把 OpenAI SSE delta 翻译为 `CatAgentStreamEvent`（共享下游事件契约）

2. Adapter 选择策略（design gate 议题，G2 决定）：
   - 选项 A：`CatConfig.catAgentProtocol?: 'anthropic-messages' | 'openai-chat'`，默认 `anthropic-messages`
   - 选项 B：探测 baseUrl 路径形态（脆，不推荐）
   - 选项 C：account 声明 `clientFamily` + adapter 自带 family 匹配

3. Hub UI 加 protocol 字段（如选 A），与 `clientId='catagent'` 联动；Account resolver 按 adapter `clientFamily` 解析

G2 详细设计、tool calling 在 OpenAI 协议下的 lossless 映射、stream event / usage 映射边界，待 G1 落地后另起 design gate。

#### Slice G3 (deferred): Third Adapter — Gemini

在 G2 验证 seam 之后加 Gemini，证明 seam 不是 Anthropic↔OpenAI 二元抽象，而是真的可扩展。Slice G3 详细方案在 G2 完成后另起 design。

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

#### Slice G2 / G3（deferred）
- AC 在 G1 merge 后另起 design gate 定义

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

## Review Gate

- Phase A: Ragdoll + Maine Coon架构 review → operator拍板
- Phase B-E: 跨 family review
- Phase F-F1/F2: 安全敏感，必须跨 family review
- Phase F-F3: 产品方向 + 宿主边界联合 review
- Phase F merge gate: AC-F15（ADR-001 边界修订）必须先完成
- Phase F exit / launch gate: 默认权限策略、dogfood、审计可见性、fail-closed 验证
- Phase G Slice G1: 跨 family review（必须）；merge gate = AC-G6 / AC-G7 / AC-G8 全过（refactor-only 行为保持）
- Phase G Slice G2: 独立 design gate，需 co-creator approve 协议选择策略后才开 slice

## Revision History

| 日期 | 变更 | 原因 |
|------|------|------|
| 2026-04-11 | F159 立项：Opt-in Native Provider 路径 | 把 #397 spike 收敛为 F143 下的 native provider 方向 |
| 2026-04-24 | Phase E：strict streaming fail-closed 定稿 | 明确 streaming 终态和审计边界 |
| 2026-06-16 | Phase F：Write/Exec Tool Surface 规划并回归 F159 真相源 | 本地误开的 F188 草案并回 F159；保持 feature 编号单一真相源 |
| 2026-06-16 | Phase F F1/F2/F3-min 实现完成，进入 review | 分级工具面、write/patch、run_command policy、current-task scoped callback 已落地 |
| 2026-06-24 | Phase G 立项：Protocol Abstraction（in-design） | 承接 co-creator 反馈："CatAgent 拼 endpoint URL 入口应改为通用命名，不绑定某厂商"；抽 `CatAgentProtocolAdapter` seam，区分通用入口（service 层）与协议特定实现（adapter 层） |
| 2026-06-24 | Phase G Slice G1 spec 修订（design gate iteration） | @gpt555 design gate review P1+P2：G1 seam 扩到 HTTP/stream/transcript codec/中性 block & event 四层；新增 AC-G10/G11/G12 + KD-17/18 + golden-wire contract test 强化 merge gate；service 层全文不再出现 `Anthropic*` 标识符 |
