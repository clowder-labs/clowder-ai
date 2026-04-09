---
feature_ids: [F139]
related_features: [F088, F132, F151]
topics: [gateway, connector, xiaoyi, huawei, a2a-huawei, websocket, phone-tools]
doc_kind: spec
created: 2026-03-27
updated: 2026-04-09
---

# F139: XiaoYi Smart Assistant Gateway — 华为小艺智慧助手对接

> **Status**: in-progress (Phase A ✅ Phase B-redesigned ✅ Phase C-inbound ✅) | **Owner**: 布偶猫 | **Priority**: P1

## Why

完善华为手机生态。华为小艺是鸿蒙系统原生 AI 助手，覆盖数亿华为/荣耀设备。通过华为 A2A（Agent-to-Agent）协议对接后，用户可以直接在手机端用语音或文字与猫猫对话，无需打开 Web UI 或第三方 IM。

**独特价值**：小艺不仅是消息通道——它能调用手机本地能力（GPS 定位、相机拍照、通讯录、日历、闹钟、短信等），意味着猫猫可以通过用户的手机感知和操作物理世界，这是飞书/钉钉/Telegram 无法提供的。

## Prerequisites（接入前置）

小艺开放平台：<https://developer.huawei.com/consumer/cn/hag/abilityportal/>

**接入步骤**（参考 jiuwenclaw 频道文档）：
1. 在小艺开放平台创建智能体
2. 新建凭证 → 获取 **ak**（Access Key）、**sk**（Secret Key）
3. 配置白名单分组 → 添加华为账号（真机调试用）
4. 填写开场白 → 上架智能体
5. 在 Cat Cafe 配置 ak、sk、agent_id → 开启频道

**最小配置**：
```yaml
XIAOYI_AK=<小艺平台凭证 ak>
XIAOYI_SK=<小艺平台凭证 sk>
XIAOYI_AGENT_ID=<创建的 agent ID>
```

## Reference Implementation

jiuwenclaw（`/Users/tianyiliang/Projects/jiuwenclaw`）已有完整 Python 实现：

| 文件 | 行数 | 内容 |
|------|------|------|
| `channel/xiaoyi_channel.py` | 1351 | 主 channel — 双 WS A2A、消息收发、超时管理 |
| `channel/xiaoyi_utils/formatter.py` | 662 | A2A JSON-RPC 2.0 消息构建器 |
| `channel/xiaoyi_utils/media.py` | 351 | 媒体下载/MIME 检测/文件处理 |
| `channel/xiaoyi_utils/push.py` | 132 | 推送通知服务（HAG webhook） |
| `agentserver/tools/xiaoyi_phone_tools/` | ~500 | 手机端工具（定位/拍照/短信/通讯录/日历/闹钟等） |
| `docs/频道.md` | 413 | 频道配置文档（含小艺接入步骤截图） |

## What

在 F088 IM HUB 三层架构上新增 `XiaoyiAdapter`，复用 ConnectorRouter / CommandLayer / BindingStore / OutboundDeliveryHook 公共层。

### 架构（F151 重写后）

```
┌─────────────────────────────────────────────────┐
│  IM HUB Public Layer (F088)                     │
│  ConnectorRouter → CommandLayer → OutboundHook  │
│           + notifyDeliveryBatchDone chain        │
└──────────────────────┬──────────────────────────┘
                       │
      ┌────────────────┼────────────────┐
      │                │                │
 xiaoyi-protocol.ts  xiaoyi-ws.ts  XiaoyiAdapter.ts
 (types/auth/SSRF)  (dual-WS HA)  (task queue/delivery)
      └────────────────┼────────────────┘
                       │
    ┌──────────────────┼──────────────────┐
    │                  │                  │
  WS conn-1        WS conn-2        ConnectorMediaService
  (domain)         (IP backup)       (inbound download)
    └──────────────────┴──────────────────┘
              华为小艺 A2A 服务端
```

**与现有 Adapter 的关键差异**：

| 维度 | 飞书/钉钉 | 小艺 |
|------|---------|------|
| 连接方向 | 平台→我们 (webhook/stream) | **我们→华为 (WS client)** |
| 冗余 | 单连接 | **双 WS**（domain + IP 备用） |
| 认证 | App Token/Key | **HMAC-SHA256→Base64 签名** |
| 回复格式 | 平台私有 API | **A2A JSON-RPC 2.0 artifact-update** |
| 交付模型 | 流式 delta | **非流式 append 累积**（见 Phase B 说明） |
| 独有能力 | — | **手机工具调用（GPS/相机/通讯录等）** |
| 推送 | 走原连接回复 | **独立 HAG webhook 端点** |
| 思考展示 | 无标准 | **reasoningText vs text 区分** |
| 任务关闭 | 无需 | **close frame via onDeliveryBatchDone** |

### Phase A: 基础连通 ✅ (2026-03-27 初版, 2026-04-09 F151 重写)

WebSocket 双通道 + 签名认证 + 纯文本收发。

**初版（F139，2026-03-27）**：单文件 XiaoyiAdapter，实现基础双 WS 连接和文本收发。

**F151 重写（2026-04-09 迁移）**：从 clowder-ai fork 迁移 3 文件拆分实现，主要增强：

| 增强 | 说明 |
|------|------|
| 3 文件拆分 | `xiaoyi-protocol.ts` (协议) + `xiaoyi-ws.ts` (WS管理) + `XiaoyiAdapter.ts` (业务) |
| 任务队列 | 同 session 多任务 FIFO 排队，避免并发写入冲突 |
| onDeliveryBatchDone | 通知链驱动 close frame — 猫猫全部回复完才关闭任务 |
| Keepalive | 活跃任务期间 20s 间隔发 status-update(working)，防 HAG 超时断连 |
| Task timeout | 120s 安全网，超时自动关闭 |
| SSRF guard | deny-list 方式验证媒体 URI（assertSafeXiaoyiUri），拒绝私网/非 https |
| append 累积 | 非流式模型：每只猫的完整回复一次性发送，多猫用 `---` 分隔 |

**A2A 协议要点**（一手源码验证 + 实测日志确认）：
- 主端点：`wss://hag.cloud.huawei.com/openclaw/v1/ws/link`
- 备端点：`wss://116.63.174.231/openclaw/v1/ws/link`（IP，需 SSL `rejectUnauthorized: false`）
- 初始化：连接后发 `clawd_bot_init` 消息（含 agentId）
- 认证 headers：`x-access-key` (ak), `x-sign` (HMAC-SHA256→Base64), `x-ts` (毫秒时间戳), `x-agent-id`
- 入站：`message/stream` → 解析 `parts[].kind=text` + `parts[].kind=file`
- 出站：`agent_response` envelope → `artifact-update` / `status-update`
- 心跳：**20 秒**应用层 heartbeat + WS ping/pong
- 断线重连：指数退避（1s → 30s 上限，最多 10 次）

**A2A 三层 ID 体系**（实测日志中确认，无官方文档）：

| ID | 生命周期 | 用途 |
|----|---------|------|
| `params.sessionId` (= conversationId) | 持久不变，同一用户-智能体对话 | **作为 externalChatId 的一部分** |
| 顶层 `msg.sessionId` | 每次小艺 app 打开时更换 | 仅日志参考，不可作为绑定键 |
| `params.id` (= taskId) | 单条消息（一问一答） | 用于出站回复的 artifact-update 定位 |

> **F151 变更**：`externalChatId` 从 `sessionId` 改为 `${agentId}:${sessionId}`，避免多 agent 共用同一 session 时冲突。迁移时需 flush Redis binding 数据。

### Phase B: 回复交付模型 ✅ (F151 redesign, 2026-04-09)

> **方案变更**：原 F139 计划实现 `IStreamableOutboundAdapter` 做真流式 delta。F151 实测发现 **HAG app 不支持 append:true 的 delta 更新**（会覆盖而非追加），因此改为非流式 append 累积模型。详见 ADR-014。

**实际实现（非流式 append 累积）**：
- `sendPlaceholder()` → `status-update(working)` + 空 `reasoningText` artifact（思考气泡）
- `sendReply()` → 完整文本一次性发送。第一只猫 `append=false`，后续猫 `append=true` + `---` 分隔
- `onDeliveryBatchDone(chainDone=true)` → `status-update(completed/failed)` close frame
- `editMessage()` / `deleteMessage()` → no-op（无流式 artifact 可编辑）
- Keepalive: 活跃任务期间 20s 间隔发 `status-update(working)`

**notifyDeliveryBatchDone 通知链**（6 处调用点）：
1. `StreamingOutboundHook.notifyDeliveryBatchDone()` — hub 方法，遍历 binding 通知各 adapter
2. `ConnectorInvokeTrigger` — finally 块，`invocationTracker.complete()` 之后
3. `QueueProcessor.executeEntry()` — finally 块，带 `excludeSlot` 避免自占位误判
4. `messages.ts` — web 出口，fire-and-forget
5-7. `ConnectorRouter` — 3 处 early-exit（群白名单拒绝、admin-only 拦截、命令响应）

### Phase C: 文件与媒体 (入站 ✅ / 出站 ⬜)

**入站 ✅ (F151 Phase B, 2026-04-09)**：

用户从小艺发送图片/文件/音频 → 猫猫接收处理。

- 解析 `parts[].kind=file` → `file.uri` + `file.mimeType` + `file.name`
- MIME 类型检测：`image/*` → image, `audio/*` → audio, 其他 → file
- SSRF guard (`assertSafeXiaoyiUri`): deny-list 验证，拒绝非 https / 私网 IP
- 通过 `ConnectorMediaService.setXiaoyiDownloadFn()` 注册下载函数
- `redirect: 'error'` 防止重定向到内网
- 下载限制：60s 超时

**出站 ⬜ (OSMS 三阶段上传，未实现)**：
1. Prepare: `POST /osms/v1/file/manager/prepare` → uploadUrl + uploadId
2. Upload: `PUT {uploadUrl}` → 上传文件
3. Complete: `POST /osms/v1/file/manager/complete` → objectId
4. 发送 `artifact-update` with `kind=file` + `fileId=objectId`

> 出站需要华为 OSMS 上传凭据，待申请。

### Phase D: 推送通知 ⬜

HAG webhook — 长任务完成后推送摘要到手机。

- 端点：`https://hag.cloud.huawei.com/open-ability-agent/v1/agent-webhook`
- 触发：任务超时（1 小时默认）或后台任务完成
- 推送内容：`pushText` 摘要 + `artifacts` 完整回复
- 认证：同 Phase A 签名
- 需要 `api_id` + `push_id` 配置

### Phase E: 手机工具调用 ⬜

通过 command artifact 调用华为手机本地能力。

**架构**：Agent → XiaoyiAdapter → command artifact → 手机执行 → DataEvent 回调

**工具类型**（jiuwenclaw 已实现）：
- 定位：GetCurrentLocation
- 相机：TakePhoto, OpenGallery
- 通讯录：SearchContact, GetContactList
- 短信：SendSMS, ReadSMS
- 日历：CreateCalendarEvent, GetSchedule
- 闹钟：SetAlarm, GetAlarms
- 文件/备忘录：FileOperation, CreateNote

**DataEvent 回调格式**（3 种解析路径）：
1. 直接格式：`events[].intentName` + `events[].outputs`
2. UploadExeResult：`header.name == "UploadExeResult"` → `payload.intentName`
3. GUI Response：`header.name == "InvokeJarvisGUIAgentResponse"`（跳过）

## Acceptance Criteria

### Phase A（基础连通）✅ 2026-03-27 初版 → 2026-04-09 F151 重写
- [x] AC-A1: XiaoyiAdapter 实现 IOutboundAdapter，注册到 ConnectorGateway
- [x] AC-A2: 双 WebSocket 连接建立，独立心跳保活（20s）
- [x] AC-A3: HMAC-SHA256 签名认证通过
- [x] AC-A4: 入站文本消息通过 ConnectorRouter 路由到 thread
- [x] AC-A5: 出站文本回复通过 artifact-update 发送到小艺
- [x] AC-A6: ConnectorDefinition 注册（环境变量配置）
- [x] AC-A7: 断线自动重连（指数退避）
- [x] AC-A8: /new /threads /use /where 命令复用公共层
- [x] AC-A9: 任务队列 FIFO（同 session 多消息串行处理）
- [x] AC-A10: onDeliveryBatchDone 通知链驱动 close frame
- [x] AC-A11: SSRF guard 验证媒体 URI

### Phase B（回复交付模型）✅ 2026-04-09
- [x] AC-B1: sendPlaceholder 发送 working 状态 + reasoningText 思考气泡
- [x] AC-B2: sendReply 发送完整回复（非流式 append 累积）
- [x] AC-B3: 多猫回复用 `---` 分隔，append=true 追加
- [x] AC-B4: 20s keepalive 防 HAG 超时断连
- [x] AC-B5: close frame 区分 completed（有 artifact）/ failed（无 artifact）
- [x] AC-B6: notifyDeliveryBatchDone 6 处调用点全部接入

### Phase C（文件与媒体）— 入站 ✅ / 出站 ⬜
- [x] AC-C1: 入站文件解析 `parts[].kind=file`，提取 uri/mimeType/name
- [x] AC-C2: MIME 分类：image/audio/file
- [x] AC-C3: SSRF guard + redirect:'error' 安全下载
- [x] AC-C4: ConnectorMediaService 集成
- [ ] AC-C5: OSMS 三阶段上传
- [ ] AC-C6: 出站 artifact-update with kind=file

### Phase D（推送通知）⬜
- [ ] AC-D1: 超时后推送摘要到手机
- [ ] AC-D2: 推送签名认证正确

### Phase E（手机工具调用）⬜
- [ ] AC-E1: Agent 可发送 command artifact
- [ ] AC-E2: DataEvent 回调正确路由到 Agent
- [ ] AC-E3: 至少支持 3 种工具（定位/拍照/通讯录）

## Dependencies

- **Evolved from**: F088（Multi-Platform Chat Gateway 三层架构）
- **Related**: F132（DingTalk Stream 模式参考）
- **Upstream**: F151（clowder-ai fork 中的实现，迁移到本 repo）
- **ADR**: ADR-014（xiaoyi-connector-gateway 架构决策）
- **注意**: 华为 A2A ≠ 我们的 A2A（F050）。华为 A2A 是 Agent-to-Agent 平台协议，我们的 A2A 是内部猫猫协作协议，同名不同物。

## F151 迁移记录（2026-04-09）

从 clowder-ai fork (`terrenceeLeung/clowder-ai`) 迁移 F151 Phase A+B 实现，替换 F139 初版单文件 XiaoyiAdapter。

**迁移内容**（14 files changed, +1266 -759）：

| 操作 | 文件 |
|------|------|
| NEW | `xiaoyi-protocol.ts` — 协议类型、常量、HMAC 签名、消息构建器、SSRF guard |
| NEW | `xiaoyi-ws.ts` — 双通道 WsManager (ping/pong + pong 超时) |
| REPLACE | `XiaoyiAdapter.ts` — 任务队列、keepalive、append 累积、onDeliveryBatchDone |
| PATCH | `OutboundDeliveryHook.ts` — IOutboundAdapter 加 onDeliveryBatchDone? |
| PATCH | `StreamingOutboundHook.ts` — notifyDeliveryBatchDone hub 方法 |
| PATCH | `ConnectorMediaService.ts` — xiaoyi 下载通道 |
| PATCH | `connector-gateway-bootstrap.ts` — xiaoyi 注册块重写 + redirect:'error' |
| PATCH | `ConnectorInvokeTrigger.ts` — finally 通知 |
| PATCH | `QueueProcessor.ts` — isThreadBusy + excludeSlot + finally 通知 |
| PATCH | `messages.ts` — web 出口通知 |
| PATCH | `ConnectorRouter.ts` — 3 处 early-exit 通知 |
| DELETE | `xiaoyi-adapter.test.js` — 旧测试 |
| NEW | `xiaoyi-protocol.test.js` — 40+ 测试用例 |
| PATCH | `package.json` — 加 @types/ws |

**Codex review 修复**（4 轮）：
1. R1: `notifyDeliveryBatchDone` 从 success path 移到 finally（在 invocationTracker.complete() 之后）
2. R2: QueueProcessor 加 `excludeSlot` 避免 processingSlots 自占位误判
3. R3: SSRF IPv6 bypass — strip brackets + `::ffff:` pattern
4. R4: SSRF regex false positive — `fc/fd/fe80` 加 IPv6 冒号后缀，`::1` 加 `$` 锚定

**部署注意**：迁移后需 flush Redis binding 数据（externalChatId 语义从 `sessionId` 变为 `${agentId}:${sessionId}`）。

## Phase A 实测修复记录（2026-03-27）

首次真机联调发现以下问题并在同日修复：

| # | 问题 | 根因 | 修复 |
|---|------|------|------|
| P1-0 | `Invalid URL: undefined` 无限重连 | JS spread `{default, ...opts}` 被 `opts.wsUrl1=undefined` 覆盖 | 改为 `opts.wsUrl1 \|\| DEFAULT_WS_URL` 置后 |
| P1-0b | 缺失备用 IP 端点 | 只声明了 `DEFAULT_WS_URL`，无 backup | 新增 `DEFAULT_BACKUP_WS_URL` 常量 |
| P1-1 | sessionId 绑定漂移，app 重启后丢 thread | 用了不稳定的 `msg.sessionId` 作 externalChatId | 优先级改为 `params.sessionId > msg.conversationId > msg.sessionId` |
| P1-2a | `tasks/cancel` 未清理 sessionMap | cancel 消息的 taskId 在 `msg.id` 而非 `params.id` | 读取链增加 `msg.id` |
| P1-2b | 回复发到已取消的旧 task | `resolveTaskId` 返回 Map 中第一个（最旧）匹配 | 改为返回最后一个（最新）匹配 |
| P1-3 | thread URL 显示 localhost:3003 | `frontendBaseUrl` 未传入 gateway bootstrap deps | 在 `index.ts` 补传 `frontendBaseUrl` |
| P1-4 | WebSocket connect→close 1000 循环 | VPN tun 模式将华为国内流量路由至海外出口 | 关闭 VPN tun / 添加直连规则（运维层面） |

## Risk

| 风险 | 缓解 |
|------|------|
| 华为 A2A 协议版本更新 | 协议层封装在 xiaoyi-protocol.ts |
| 双 WS 消息重复 | 复用 InboundMessageDedup + 应用层 dedup (sessionId:taskId) |
| OSMS 上传失败 | 降级为纯文本回复 |
| IP 备端点证书校验 | SSL 区分 domain vs IP |
| 开发者账号审批周期 | Phase A 前确认账号就绪 |
| 华为国内端点 + 海外 VPN 冲突 | 实测已验证：需直连规则或关闭 tun 模式 |
| A2A 协议无官方文档 | 三层 ID 体系已通过日志逆向确认，记录在本 spec |
| HAG app 不支持真流式 delta | 改用非流式 append 累积（ADR-014 决策） |
| SSRF via 媒体 URI | assertSafeXiaoyiUri deny-list + redirect:'error' |

## Open Questions

| # | 问题 | 状态 |
|---|------|------|
| OQ-1 | 华为开发者账号是否已注册？ | ✅ 已注册（2026-03-27） |
| OQ-2 | 使用 AK/SK 还是 UID/API_KEY？ | ✅ AK/SK 模式（2026-03-27） |
| OQ-3 | reasoningText 是否转发到前端展示？ | ✅ 需要转发（2026-03-27） |
| OQ-4 | 手机工具调用 Agent 侧 API 如何暴露？ | ⬜ 讨论中 |
| OQ-5 | 小艺用户身份如何映射到 Cat Cafe 用户？ | ✅ A2A 不传用户身份，使用 DEFAULT_OWNER_USER_ID 绑定（2026-03-27） |
| OQ-6 | `conversationId` 是否跨 app 重启持久？ | ✅ 实测确认持久（2026-03-27） |
| OQ-7 | HAG 是否支持同 agentId 双 WS 并发？ | ⚠️ 疑似互踢（2026-04-09 office-claw 测试观察到循环重连），待确认 |

## Key Decisions

| # | 决策 | 理由 | 日期 |
|---|------|------|------|
| KD-1 | 独立立项 F139 | 手机工具调用是全新能力维度 | 2026-03-27 |
| KD-2 | 复用 IM HUB 公共层 | F088 三层架构原则 | 2026-03-27 |
| KD-3 | 参考 jiuwenclaw TypeScript 重写 | 适配 Node.js + IM HUB 架构 | 2026-03-27 |
| KD-4 | 使用 AK/SK 认证模式 | 铲屎官确认 | 2026-03-27 |
| KD-5 | 用 `params.sessionId` 而非 `msg.sessionId` 作绑定键 | 实测发现顶层 sessionId 不稳定 | 2026-03-27 |
| KD-6 | `DEFAULT_OWNER_USER_ID` 控制 thread 归属 | 与飞书/钉钉/Telegram 共用机制 | 2026-03-27 |
| KD-7 | **非流式 append 累积**取代真流式 delta | HAG app 不支持 append:true delta（ADR-014 实测结论） | 2026-04-06 |
| KD-8 | **3 文件拆分** | protocol/ws/adapter 分离，控制文件大小 | 2026-04-06 |
| KD-9 | **onDeliveryBatchDone 通知链**驱动 close frame | 确保所有猫回复完才关闭任务 | 2026-04-06 |
| KD-10 | **SSRF deny-list** 而非 allowlist | HAG 使用多 CDN 域名，URI 来自认证 WS | 2026-04-06 |
| KD-11 | `externalChatId` = `${agentId}:${sessionId}` | 避免多 agent 共 session 冲突 | 2026-04-06 |

## Timeline

| 日期 | 事件 |
|------|------|
| 2026-03-27 | F139 立项，完成 jiuwenclaw 源码分析 |
| 2026-03-27 | Phase A 初版：XiaoyiAdapter + bootstrap 集成 |
| 2026-03-27 | Phase A 实测：发现并修复 7 个 bug |
| 2026-04-02 | ADR-014 决策：OpenClaw 模式 + 非流式交付 |
| 2026-04-06 | F151 Phase A+B 在 clowder-ai fork 完成并合入 |
| 2026-04-09 | F151 迁移到 office-claw，替换 F139 初版实现 |
| 2026-04-09 | Codex 4 轮 review，修复 notify timing + SSRF 问题 |
| 2026-04-09 | 真机验证通过 |

## Links

| 类型 | 路径 | 说明 |
|------|------|------|
| **Parent** | `docs/features/F088-multi-platform-chat-gateway.md` | IM HUB 三层架构 |
| **Related** | `docs/features/F132-dingtalk-wecom-gateway.md` | DingTalk Stream 模式参考 |
| **Upstream** | F151 (terrenceeLeung/clowder-ai) | Fork 中的原始实现 |
| **ADR** | `docs/decisions/014-xiaoyi-connector-gateway.md` | 架构决策记录 |
| **Reference** | jiuwenclaw `channel/xiaoyi_channel.py` | Python 参考实现 |
| **Platform** | https://developer.huawei.com/consumer/cn/hag/abilityportal/ | 小艺开放平台 |
| **PR** | `feat/F151-xiaoyi-phase-ab-migration` branch | 迁移分支 |
