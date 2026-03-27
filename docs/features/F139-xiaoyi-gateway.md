---
feature_ids: [F139]
related_features: [F088, F132]
topics: [gateway, connector, xiaoyi, huawei, a2a-huawei, websocket, phone-tools]
doc_kind: spec
created: 2026-03-27
---

# F139: XiaoYi Smart Assistant Gateway — 华为小艺智慧助手对接

> **Status**: spec | **Owner**: 布偶猫 | **Priority**: P1

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
# 对应我们的 env vars
XIAOYI_AK=<小艺平台凭证 ak>
XIAOYI_SK=<小艺平台凭证 sk>
XIAOYI_AGENT_ID=<创建的 agent ID>
XIAOYI_ENABLE_STREAMING=true
```

## Reference Implementation

jiuwenclaw（`/Users/xxx/workspace/AI/jiuwen/jiuwenclaw`）已有完整 Python 实现：

| 文件 | 行数 | 内容 |
|------|------|------|
| `channel/xiaoyi_channel.py` | 1351 | 主 channel — 双 WS A2A、消息收发、超时管理 |
| `channel/xiaoyi_utils/formatter.py` | 662 | A2A JSON-RPC 消息构建器 |
| `channel/xiaoyi_utils/media.py` | 351 | 媒体下载/MIME 检测/文件处理 |
| `channel/xiaoyi_utils/push.py` | 132 | 推送通知服务（HAG webhook） |
| `agentserver/tools/xiaoyi_phone_tools/` | ~500 | 手机端工具（定位/拍照/短信/通讯录/日历/闹钟等） |
| `docs/频道.md` | 413 | 频道配置文档（含小艺接入步骤截图） |

## What

在 F088 IM HUB 三层架构上新增 `XiaoyiAdapter`，复用 ConnectorRouter / CommandLayer / BindingStore / OutboundDeliveryHook 公共层。

```
┌─────────────────────────────────────────────────┐
│  IM HUB Public Layer (F088)                     │
│  ConnectorRouter → CommandLayer → OutboundHook  │
└──────────────────────┬──────────────────────────┘
                       │
              ┌────────┴────────┐
              │ XiaoyiAdapter   │  ← F139
              │ (WebSocket A2A) │
              └────────┬────────┘
                       │
    ┌──────────────────┼──────────────────┐
    │                  │                  │
  WS conn-1        WS conn-2        OSMS Upload
  (domain)         (IP backup)       (files)
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
| 独有能力 | — | **手机工具调用（GPS/相机/通讯录等）** |
| 推送 | 走原连接回复 | **独立 HAG webhook 端点** |
| 思考展示 | 无标准 | **reasoningText vs text 区分** |

### Phase A: 基础连通

WebSocket 双通道 + 签名认证 + 纯文本收发。

**A2A 协议要点**（一手源码验证）：
- 主端点：`wss://hag.cloud.huawei.com/openclaw/v1/ws/link`
- 备端点：`wss://116.63.174.231/openclaw/v1/ws/link`（IP，需 SSL 特殊处理）
- 初始化：连接后发 `clawd_bot_init` 消息（含 agentId）
- 认证 headers（xiaoyi_channel 模式）：
  - `x-access-key`: ak
  - `x-sign`: HMAC-SHA256(sk, timestamp) → **Base64 编码**
  - `x-ts`: 毫秒时间戳
  - `x-agent-id`: agentId
- 备用认证（xiaoyi_claw 模式）：`x-uid` + `x-api-key`
- 入站：`message/stream` → 解析 `parts[].kind=text`
- 出站：`agent_response` envelope → `artifact-update`
- 心跳：**20 秒**应用层 heartbeat
- 断线重连：指数退避

**需实现**：
- `XiaoyiAdapter`（implements IOutboundAdapter）
- `DualWebSocketManager` — 双连接 + 消息去重 + 独立心跳
- HMAC-SHA256 签名生成（Base64）
- Gateway bootstrap 集成 + ConnectorDefinition 注册

### Phase B: 流式回复

实现 `IStreamableOutboundAdapter`，支持 artifact-update 的 append/lastChunk delta。

- `sendPlaceholder()` → `status-update` (state: "working")
- `editMessage()` → `artifact-update` (append=true, lastChunk=false, kind="text")
- 最终消息 → `artifact-update` (append=false, lastChunk=true, final=true)
- `reasoningText` kind — 思考过程展示
- **5 秒**响应心跳（活跃任务期间防断连）
- 文本累积缓冲区（`_accumulated_texts`）用于推送摘要

### Phase C: 文件与媒体

入站附件下载 + OSMS 三阶段出站文件上传。

**入站**：
- 解析 `parts[].kind=file` → `file.uri` + `file.mimeType` + `file.name`
- 下载限制：30MB / 60s 超时
- 文本类 MIME（txt/json/xml）自动提取内容
- 图片类入站支持 Base64 传递
- 通过 `ConnectorMediaService.setXiaoyiDownloadFn()` 注册

**出站（OSMS 三阶段）**：
1. Prepare: `POST /osms/v1/file/manager/prepare` → uploadUrl + uploadId
2. Upload: `PUT {uploadUrl}` → 上传文件
3. Complete: `POST /osms/v1/file/manager/complete` → objectId
4. 发送 `artifact-update` with `kind=file` + `fileId=objectId`

### Phase D: 推送通知

HAG webhook — 长任务完成后推送摘要到手机。

- 端点：`https://hag.cloud.huawei.com/open-ability-agent/v1/agent-webhook`
- 触发：任务超时（1 小时默认）或后台任务完成
- 推送内容：`pushText` 摘要 + `artifacts` 完整回复
- 认证：同 Phase A 签名
- 需要 `api_id` + `push_id` 配置

### Phase E: 手机工具调用

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

### Phase A（基础连通）
- [ ] AC-A1: XiaoyiAdapter 实现 IOutboundAdapter，注册到 ConnectorGateway
- [ ] AC-A2: 双 WebSocket 连接建立，独立心跳保活（20s）
- [ ] AC-A3: HMAC-SHA256 签名认证通过（xiaoyi_channel 模式）
- [ ] AC-A4: 入站文本消息通过 ConnectorRouter 路由到 thread
- [ ] AC-A5: 出站文本回复通过 artifact-update 发送到小艺
- [ ] AC-A6: ConnectorDefinition 注册，前端显示小艺图标
- [ ] AC-A7: 断线自动重连（指数退避）
- [ ] AC-A8: /new /threads /use /where 命令复用公共层

### Phase B（流式回复）
- [ ] AC-B1: 实现 IStreamableOutboundAdapter
- [ ] AC-B2: delta 通过 append=true artifact-update 发送
- [ ] AC-B3: 5 秒响应心跳防断连
- [ ] AC-B4: StreamingOutboundHook 集成正常

### Phase C（文件与媒体）
- [ ] AC-C1: 入站文件下载并存储到 ConnectorMediaService
- [ ] AC-C2: OSMS 三阶段上传成功
- [ ] AC-C3: 文本类 MIME 自动提取内容

### Phase D（推送通知）
- [ ] AC-D1: 超时后推送摘要到手机
- [ ] AC-D2: 推送签名认证正确

### Phase E（手机工具调用）
- [ ] AC-E1: Agent 可发送 command artifact
- [ ] AC-E2: DataEvent 回调正确路由到 Agent
- [ ] AC-E3: 至少支持 3 种工具（定位/拍照/通讯录）

## Dependencies

- **Evolved from**: F088（Multi-Platform Chat Gateway 三层架构）
- **Related**: F132（DingTalk Stream 模式参考）
- **注意**: 华为 A2A ≠ 我们的 A2A（F050）。华为 A2A 是 Agent-to-Agent 平台协议，我们的 A2A 是内部猫猫协作协议，同名不同物。

## Risk

| 风险 | 缓解 |
|------|------|
| 华为 A2A 协议版本更新 | 协议层封装在 formatter 模块 |
| 双 WS 消息重复 | 复用 InboundMessageDedup |
| OSMS 上传失败 | 降级为纯文本回复 |
| IP 备端点证书校验 | SSL 区分 domain vs IP |
| 开发者账号审批周期 | Phase A 前确认账号就绪 |

## Open Questions

| # | 问题 | 状态 |
|---|------|------|
| OQ-1 | 华为开发者账号是否已注册？能否在小艺开放平台创建智能体？ | ✅ 已注册（2026-03-27 铲屎官确认） |
| OQ-2 | 使用 xiaoyi_channel（AK/SK）还是 xiaoyi_claw（UID/API_KEY）？ | ✅ 用 AK/SK 模式（2026-03-27 铲屎官确认） |
| OQ-3 | reasoningText 是否转发到前端展示？ | ✅ 需要转发（2026-03-27 铲屎官确认） |
| OQ-4 | 手机工具调用 Agent 侧 API 如何暴露？ | ⬜ 讨论中（见下方分析） |

## Key Decisions

| # | 决策 | 理由 | 日期 |
|---|------|------|------|
| KD-1 | 独立立项 F139 | 手机工具调用是全新能力维度，非简单 IM adapter | 2026-03-27 |
| KD-2 | 复用 IM HUB 公共层 | F088 三层架构原则，Adapter 只做协议 | 2026-03-27 |
| KD-3 | 参考 jiuwenclaw 用 TypeScript 重写 | 适配 Node.js + IM HUB 架构 | 2026-03-27 |
| KD-4 | Scope 限定为小艺对接 | 铲屎官指示不扩散到其他频道 | 2026-03-27 |
| KD-5 | 使用 AK/SK 认证模式 | 铲屎官确认，xiaoyi_claw 模式不需要实现 | 2026-03-27 |
| KD-6 | reasoningText 转发到前端 | 铲屎官确认需要展示思考过程 | 2026-03-27 |

## Timeline

| 日期 | 事件 |
|------|------|
| 2026-03-27 | 立项，完成 jiuwenclaw 源码分析 + 频道文档分析 |

## Links

| 类型 | 路径 | 说明 |
|------|------|------|
| **Parent** | `docs/features/F088-multi-platform-chat-gateway.md` | IM HUB 三层架构 |
| **Related** | `docs/features/F132-dingtalk-wecom-gateway.md` | DingTalk Stream 模式参考 |
| **Reference** | jiuwenclaw `channel/xiaoyi_channel.py` | Python 参考实现 |
| **Reference** | jiuwenclaw `docs/频道.md` | 小艺接入步骤文档 |
| **Platform** | https://developer.huawei.com/consumer/cn/hag/abilityportal/ | 小艺开放平台 |
