---
feature_ids: []
topics: [architecture, product-line, binary-core, open-source, edition]
doc_kind: decision
created: 2026-03-30
updated: 2026-04-06
authors: [codex, opus, spark, gpt52, sonnet]
status: approved
---

# Binary Core 产品线架构方案 v3

> **一句话**：`public core → private downstream editions`，不是 `private superset → stripped public repo`。
>
> 开源 Core 以二进制 + npm 包双轨交付，定制版（Edition）通过单一 Edition Module + 配置覆盖扩展 Core，零源码 fork。

**CVO 决策记录（2026-04-06）**：

1. 方向 Go，启动开干
2. IM Connector 统一接口（所有 connector 走 `IConnectorAdapter`，代码暂留 Core）
3. 第一刀：Phase 0 发布门禁 → Phase 1 切身份边界

---

## 1. 背景与动机

当前仓库是一个定制版（OfficeClaw / 华为 ModelArts），需要演进为：

- **公开 Core**：通用的 AI 协作平台内核
- **商业 Base**：公司级通用商业模块
- **客户定制版**：基于 Core + Base 的品牌化交付

继续「私有大仓减法导出开源仓」的问题：

1. **泄漏风险**——私有逻辑先进入大仓，依赖导出规则移除，漏一项就泄露
2. **变体复杂度线性上升**——每增一个客户版本，多一套「哪些能导出」的推理
3. **二进制引入价值被削弱**——内部版本还是要看源码删减逻辑，没有形成稳定内核
4. **测试边界不清**——source 仓测试通过 ≠ public gate 通过

---

## 2. 目标与非目标

### 目标

- 开源 Core 可被内部和外部团队以二进制 / npm 包方式引入
- 私有商业逻辑完全不进入开源仓——**包括接口名和类型名也不暴露定制方信息**
- 多个私有版本可并行演进，不需要共享同一私有 source 仓
- 客户定制版优先复用稳定协议面，不 fork 源码

### 非目标

- 本阶段不构建通用第三方插件市场协议
- 本阶段不追求运行时任意热插拔模块系统
- 本阶段不要求所有前端界面都做成可插拔微前端
- 本阶段不要求将所有现有功能一步切分完毕
- 本阶段不构建泛化多类 plugin 平台（仅支持单一 Edition Module 入口）
- 本阶段不支持 npm package 形式的外部 plugin

**优先解决的是产品线边界，不是最大化扩展性。**

---

## 3. 长期仓库拓扑（目标态）

```
clowder-core                 (public)   ← 稳定内核
clowder-commercial-base      (private)  ← 商业通用模块
clowder-customer-officeclaw   (private)  ← OfficeClaw 定制版
clowder-customer-b           (private)  ← 其他客户定制版
```

**短期策略：先不拆仓**，在当前仓库内用 `editions/` 目录隔离：

```
clowder-ai/                           # 当前仓库
├── packages/                         # Core（开源范围）
│   ├── api/
│   ├── web/
│   ├── shared/
│   └── mcp-server/
├── cat-cafe-skills/                  # 开源 Skills
├── scripts/                          # Core 构建脚本
│
├── editions/                         # ★ 定制层（不进入开源仓）
│   └── officeclaw/
│       ├── edition.json              # 统一配置入口
│       ├── edition-main.js           # Edition Module 入口
│       ├── plugins/                  # Model Source / Skill Source / Connector
│       ├── login-gateway/            # 独立登录服务
│       ├── vendor/                   # 专属依赖（jiuwenclaw, dare-cli）
│       ├── config/                   # 华为模型元数据
│       ├── branding/                 # Logo / 文案
│       ├── skills/                   # 定制版专属 skill
│       ├── installer/                # C# Launcher + NSIS
│       └── scripts/                  # 定制版构建脚本
│
├── edition.json                      # 开发时指向 editions/officeclaw
└── .gitignore                        # 将来拆仓时 editions/ 整个搬走
```

拆仓时，`editions/officeclaw/` 直接成为独立仓库 `clowder-customer-officeclaw`。

---

## 4. 七个稳定协议面

Core 以二进制方式被消费的前提是定义稳定协议，不要求共享源码。四个运行时协议面 + 三个支撑契约。

> **v3 变更**：从 v2 的"六个协议面"增加到"七个"，新增 §4.7 Observability Contract。

### 4.1 Identity Contract

Core 只做**身份解析**（IdentityResolver），不做**身份验证**（登录/SSO/IAM）。

Core 支持三种身份模式：

| 模式 | 行为 | 适用场景 |
|------|------|---------|
| `no-auth` | 无认证，所有请求视为 default-user | 本地开发、个人部署 |
| `trusted-header` | 从 `X-Cat-Cafe-User` header 读取已认证身份 | 前置网关 / SSO 场景 |
| `jwt` | 验证 JWT signature，提取 claims 中的用户身份 | 标准企业集成 |

**铁律**：
- Core **没有 `/api/login` 路由**——Core 不管「怎么登录」，只管「你是谁」
- Core **没有登录页**——开源版首页直接进入，或显示一个极简 token 输入
- Core **不动态加载 auth plugin**——不存在 `auth.mode=custom` 或 `auth.plugin` 字段
- 定制版的登录系统**在 Core 前面**（反向代理 / sidecar / 独立服务），登录成功后注入 header / JWT
- **`query.userId` fallback 必须在 Phase 1 删除**——当前 `request-identity.ts:4` 允许 query param 兜底身份，这是安全漏洞，不是兼容性 *(v3 新增)*

```
定制版登录流程：
[用户] → [Edition Login Gateway / 反向代理] → 认证成功 → 注入 header/JWT
                                                                ↓
                                                         [Core API]
                                                     IdentityResolver 读 header
                                                     只解析身份，不验证凭据

开源版流程：
[用户] → [Core Web] → 直接进入（no-auth）或 token 输入（trusted-header）
```

**为什么不在 Core 里做 auth plugin 接口**：
- 登录逻辑各家差异巨大（华为 IAM / OIDC / LDAP / SAML），抽象接口要么太简陋要么太复杂
- 一旦 Core 有 `IAuthAdapter`，就需要引入 session 管理、cookie、重定向等概念，污染 Core
- Gateway 模式是业界标准做法（cf. Kubernetes + Ingress Auth / API Gateway + Lambda Authorizer）
- 最干净的边界：Core 只信任 header/JWT，登录是别人的事

**trusted-header 传输信任约束（安全硬约束）**：

> `trusted-header` 模式仅适用于私网 / loopback / 受控代理链。Core 直接暴露公网时**必须**使用 `jwt` 模式。

| 部署场景 | 允许的 identity mode | 传输要求 |
|---------|---------------------|---------|
| 本地开发 | `no-auth` | 无 |
| 内网 + 前置网关 | `trusted-header` | Core 仅监听 127.0.0.1 或受信网段 |
| 公网直连 | `jwt` | TLS 必须，Core 验证 JWT signature |
| 混合部署 | `jwt` 或 `trusted-header` + 签名校验 | Gateway→Core 需 mTLS 或签名头（见下方签名契约） |

**签名头校验契约（混合部署适用）**：

若 Gateway→Core 链路不走 mTLS 而走签名头模式，Core **必须**实现以下校验：

| 字段 | 说明 |
|------|------|
| `X-Cat-Cafe-User` | 用户身份（明文） |
| `X-Cat-Cafe-Signature` | HMAC-SHA256(shared_secret, `user + timestamp + nonce`) |
| `X-Cat-Cafe-Timestamp` | Unix 秒，Core 拒绝 >30s 偏差 |
| `X-Cat-Cafe-Nonce` | 唯一值，Core 用 Redis TTL 去重防重放 |

> 若不实现签名校验，混合部署**只允许** mTLS + 私网链路。

#### 4.1.1 凭据链拓扑与切割点 *(v3 新增)*

> 来源：GPT-5.4 代码级审查发现 Identity 与 Model Runtime 共享登录状态。

**当前耦合链**（必须在 Phase 1 切断）：

```
auth.ts:72 (华为 IAM 登录)
    → sessions / Conf (存储登录态 + 模型凭据)
        → huawei-maas.ts (从 session 取模型运行时凭据)
            → invoke-single-cat.ts:805 (注入到模型调用环境)
```

这意味着 **Identity Contract 和 Model Catalog Contract 当前共享同一个登录状态**。Phase 1 切 Identity 时必须同时切断这条凭据传递链，否则是假解耦。

**切割方案**：

| 步骤 | 操作 | 归属 |
|------|------|------|
| 1 | 分离"身份 session"和"模型凭据"——两者不再共享同一个 `sessions` 对象 | Phase 1 |
| 2 | 模型凭据改为通过 `IModelSource.resolveRuntimeConfig()` 获取 | Phase 3 |
| 3 | `auth.ts` 整文件移到 Edition Login Gateway | Phase 1 |
| 4 | Core 中的 `Conf`/`secure-config` 只保留 Core-owned 的配置项 | Phase 1 |

**Phase 1 Feature Doc 必须包含此凭据链拓扑图。**

### 4.2 Model Catalog Contract

Core 内置：
- 通用 provider profile 存储（`provider-profiles.json`）
- OpenAI-compatible / Anthropic / Google 协议
- API Key 管理（二层存储：meta + secrets）

Core **不内置**：
- 任何厂商特定的 MaaS 逻辑
- 任何厂商特定的模型元数据

定制版通过 **Model Source Plugin** 注入厂商模型目录：

```typescript
// Core 定义接口
export interface IModelSource {
  readonly id: string;
  listModels(): Promise<ModelEntry[]>;
  resolveRuntimeConfig(modelId: string): Promise<RuntimeModelConfig>;
}

// 定制版实现
// editions/officeclaw/plugins/huawei-maas-source/index.ts
export class HuaweiMaaSSource implements IModelSource { ... }
```

**前端语义退场规则** *(v3 新增)*：当前前端按 `huawei_maas` source ID 做分组/筛选（`ModelsPanel.tsx:129`、`CreateAgentModalDraft.tsx:211`、`hub-cat-editor.model.ts:244`）。迁移顺序：**先做"显示 metadata API"（Phase 3），再删特判代码**。不可跳步。

### 4.3 Skill Registry Contract

Core 保留：
- 本地 skill 枚举与加载（`cat-cafe-skills/`）
- `ISkillSource` 接口定义
- 本地安装状态管理

远程 Skill 市场改为**可选的 SkillSource Plugin**：

```typescript
// Core 定义接口
export interface ISkillSource {
  readonly id: string;
  search(query: string): Promise<SkillSearchResult[]>;
  install(skillId: string): Promise<void>;
  uninstall(skillId: string): Promise<void>;
}

// Core 内置
class LocalSkillSource implements ISkillSource { ... }

// 定制版可选注册
// editions/officeclaw/plugins/skillhub-source/index.ts
class TencentSkillHubSource implements ISkillSource { ... }
```

开源版只有本地 skill，无远程市场。定制版按需启用。

### 4.4 UI Capability Contract

前端从 API 获取 capability manifest，决定渲染什么：

```typescript
// GET /api/edition/capabilities
interface CapabilityManifest {
  branding: {
    appName: string;           // "Clowder AI" | "OfficeClaw"
    logoSrc?: string;
    themeColor?: string;
    locale?: string;
  };
  identity: {
    mode: 'no-auth' | 'trusted-header' | 'jwt';
  };
  features: {
    remoteSkillHub: boolean;
    voiceIO: boolean;
    agentTeams: boolean;
    werewolfGame: boolean;
    // ...
  };
  connectors: string[];         // 当前可用的 connector 列表
  modelSources: string[];       // 当前注册的 model source ID 列表
}
```

前端所有条件渲染基于此 manifest，不再硬编码品牌或功能判断。

**重要**：`modelSources` 字段视为**不透明 ID 列表**，前端不得解析其语义（如 `huawei_maas`）。UI 分组/筛选逻辑一律基于 API 返回的 display metadata，不硬编码 source ID 含义。

### 4.5 Edition Bootstrap Contract

定义 Edition 与 Core 之间的版本协商和启动生命周期：

```typescript
interface EditionBootstrap {
  // Edition 声明兼容的 Core 协议版本
  coreApiVersion: string;          // semver range, e.g. "^1.0.0"

  // Edition Module 入口
  editionMain: string;             // 相对路径，如 "./edition-main.js"

  // Edition 资源挂载
  assetsDir?: string;              // 品牌资源目录

  // 启动生命周期钩子
  // Core 启动时按顺序调用：
  //   1. loadEditionJson()        — 读 edition.json
  //   2. validateApiVersion()     — 校验兼容性
  //   3. import(editionMain)      — 加载 Edition Module
  //   4. editionModule.register() — 注册 modelSources / skillSources / connectors
  //   5. freeze registry          — 注册表冻结，运行时不可变
}
```

#### `register()` 失败语义 *(v3 新增)*

> 来源：Sonnet 识别的盲点——`register()` 抛出时 Core 行为未定义。

**铁律：`register()` 抛出时 Core 必须拒绝启动，打印明确错误。**

- **不得**降级到 `DEFAULT_EDITION`——生产环境中静默降级比 crash 更难排查
- 开源版不加载 `edition.json`，不存在"降级"语义
- 错误信息必须包含：Edition ID、失败的 plugin 名称、原始错误消息

```typescript
try {
  await editionModule.register(registry);
} catch (err) {
  logger.fatal(`Edition "${config.edition}" register() failed: ${err.message}`);
  process.exit(1);  // 不降级，直接退出
}
```

#### Core API 版本演进策略 *(v3 新增)*

> 来源：四猫一致认为缺此策略。

| 规则 | 说明 |
|------|------|
| **Phase 1-5 期间 `coreApiVersion` 为 `0.x`** | 允许 breaking change，不承诺 semver 稳定 |
| **1.0.0 发布即约定 semver 稳定性** | 之后 breaking change 需 major bump |
| **每个协议面标注 `@stable` / `@experimental`** | 避免一个总版本号无法区分哪个面破了兼容 |
| **弃用策略：至少保留一个 minor 版本** | 标 `@deprecated` 后，下一个 minor 可删除 |
| **Phase 5 前建立契约测试矩阵** | Core vN × Edition vM 的兼容性自动化验证 |

### 4.6 State Ownership Contract

明确每类持久化状态的所有者，防止 Core/Edition 交叉写入。

> **v3 变更**：SQLite 从"如有"改为明确条目；新增 `secure-config`/`Conf`；新增 Edition 写入禁令。

| 状态 | Owner | 存储位置 | 说明 |
|------|-------|---------|------|
| 用户 session / 登录态 | **Edition** | Edition Gateway 自管 | Core 不持有 session，只读 header/JWT |
| provider-profiles.json | **Core** | `~/.cat-cafe/` | 通用 API Key 管理 |
| 模型元数据缓存 | **Edition plugin** | Edition 自行决定 | Core 只通过 `IModelSource.listModels()` 读取 |
| cat-catalog.json | **Core** | `~/.cat-cafe/` | 猫猫配置，Edition 安装脚本生成 |
| installed-skills.json | **Core** | `~/.cat-cafe/` | 本地 skill 安装状态 |
| 远程 SkillHub 缓存 | **Edition plugin** | Edition 自行决定 | Core 不感知远程 skill 缓存 |
| Redis（对话/任务状态） | **Core** | Redis 6399（生产）/ 6398（dev/test） | Edition 不直接写 Core Redis |
| **SQLite — evidence.db** | **Core** | `~/.cat-cafe/evidence.db`（或项目级） | 向量嵌入 + session 转录。参见 `SqliteEvidenceStore.ts:29` |
| **SQLite — 其他 db** | **Core** | 按需 | 若 Core 新增 SQLite 存储需在此表登记 |
| **secure-config / Conf** | **Edition** | 当前在 Core 内存，需迁移 | 存 promotion code、登录衍生信息、modelInfo。Phase 1 必须移至 Edition |

**Edition 写入禁令** *(v3 新增)*：

- Edition **禁止**直接写 Core 的 Redis（6399）
- Edition **禁止**写 Core 的 SQLite 文件（`evidence.db` 等）
- Edition 需要本地持久化，**必须自管独立的 db 文件**，不得在 Core SQLite 里加表
- 每个 Phase 的 Feature Doc 必须包含"State Ownership 变更表"

**Phase 0 任务：SQLite schema 归属审计** *(v3 新增)*：

> 来源：Sonnet 要求的显式审计任务。

产出一张表：`evidence.db` 的每个表/字段 → Core 还是 Edition owned。截止时间 = Phase 0 结束前。

### 4.7 Observability Contract *(v3 新增)*

> 来源：GPT-5.4 + 宪宪识别的缺失项。

Core 与 Edition 的可观测性边界：

| 层 | 健康检查 Owner | 暴露端点 |
|----|---------------|---------|
| Core 基础设施（Redis / SQLite / Fastify） | **Core** | `GET /api/health` + `GET /api/readyz` |
| Edition Module 加载状态 | **Core** | `GET /api/edition/status` |
| Connector 连通性 | **各 Connector**（通过 `health()` 方法） | Core 聚合到 `/api/health` |
| Edition Plugin 内部健康 | **Edition** | Edition 自行决定是否暴露 |

**健康检查端点规范**：

```typescript
// GET /api/health — liveness probe（轻量，<10ms）
{ status: 'ok' | 'degraded' | 'down' }

// GET /api/readyz — readiness probe（含依赖检查）
{
  status: 'ok' | 'degraded' | 'down',
  checks: {
    redis: { status: 'ok', latencyMs: 2 },
    sqlite: { status: 'ok' },
    edition: { id: 'officeclaw', version: '1.0.0', status: 'loaded' },
    connectors: [
      { id: 'feishu', status: 'ok' },
      { id: 'xiaoyi', status: 'degraded', reason: 'websocket reconnecting' }
    ]
  }
}
```

**为什么 P1 而不是"后续按需"**：
- Docker/k8s 部署的 liveness/readiness probe 依赖此端点
- 运维排障（Edition 加载失败时需要明确诊断信息）
- 工作量极小（<1 天），没有理由推后

**EditionRegistry 注入 logger** *(v3 新增)*：

```typescript
export interface EditionRegistry {
  addModelSource(source: IModelSource): void;
  addSkillSource(source: ISkillSource): void;
  addConnector(adapter: IConnectorAdapter): void;
  // v3 新增：
  readonly logger: Logger;        // Core 的 logger 实例
}
```

Edition plugin 使用 Core 注入的 logger，确保日志格式统一、级别可控。

---

## 5. IM Connector 策略

> **v3 变更**：CVO 决策——所有 connector（含内置）统一走 `IConnectorAdapter` 接口。

### 统一接口（CVO 拍板）

所有 connector——无论内置还是 Edition 注册——**必须实现同一个 `IConnectorAdapter` 接口**。不给内置 connector 开后门。

```typescript
// Core 接口（v3 增强）
export interface IConnectorAdapter {
  readonly id: string;
  readonly displayName: string;
  initialize(config: ConnectorConfig): Promise<void>;
  handleInbound(event: InboundEvent): Promise<void>;
  sendOutbound(message: OutboundMessage): Promise<void>;
  shutdown(): Promise<void>;

  // v3 新增
  health(): Promise<{ status: 'ok' | 'degraded' | 'down'; reason?: string }>;
  capabilities(): ConnectorCapabilities;
}

interface ConnectorCapabilities {
  supportsInbound: boolean;
  supportsOutbound: boolean;
  supportedMessageTypes: string[];  // 'text' | 'card' | 'image' | 'audio' | ...
}
```

### 内置 Connector（Core）

| Connector | 说明 | 状态 |
|-----------|------|------|
| Telegram | 全球通用 | 走统一 `IConnectorAdapter` |
| 飞书 | 企业常用 | 走统一 `IConnectorAdapter` |
| 钉钉 | 企业常用 | 走统一 `IConnectorAdapter` |
| 微信 | 个人场景 | 走统一 `IConnectorAdapter`（Phase 4 单独评估是否外置） |

所有内置 connector 保持现有逻辑：**有凭据就启用，无凭据不加载**。代码暂留 Core 包内，但因为走统一接口，将来外置是零成本重构。

### 小艺（XiaoYi）归 Edition

小艺是华为 IoT A2A 协议，且写入了共享类型注册表（`connector.ts:183`）和前端图标（`HubConfigIcons.tsx:54`）。不属于通用 IM。

**决策**：
- **短期**：移入 `editions/officeclaw/plugins/xiaoyi-connector/`
- **长期**：可独立成"官方外置插件仓"

**影响范围**（含 v3 补充）：
- `packages/api/src/infrastructure/connectors/adapters/XiaoyiAdapter.ts` → Edition plugin
- `packages/api/src/infrastructure/connectors/connector-gateway-bootstrap.ts:44` → 删除硬编码注册
- `packages/shared/src/types/connector.ts:183` → 删除 `xiaoyi` 展示语义硬编码，改为 plugin 注册 *(v3 补充)*
- `packages/web/src/components/HubConfigIcons.tsx:54` → 改为 capabilities 驱动
- `packages/api/src/routes/connector-hub.ts:120` → 通过 plugin 注册表发现

### Connector 启动流程（改造后）

```typescript
// connector-gateway-bootstrap.ts（改造后）
async function bootstrapConnectors(config, edition) {
  const registry: IConnectorAdapter[] = [];

  // 1. 内置 connector（统一走 IConnectorAdapter，有凭据就注册）
  if (config.feishuAppId)    registry.push(new FeishuAdapter(config));
  if (config.telegramToken)  registry.push(new TelegramAdapter(config));
  if (config.dingtalkAppKey) registry.push(new DingTalkAdapter(config));
  if (config.weixinBotToken) registry.push(new WeixinAdapter(config));

  // 2. Edition Module 注册的 connector
  for (const adapter of edition._registry.connectors) {
    registry.push(adapter);
  }

  // 3. 统一初始化 + 健康检查
  for (const adapter of registry) {
    await adapter.initialize(config);
    const health = await adapter.health();
    if (health.status === 'down') {
      logger.warn(`Connector ${adapter.id} failed health check: ${health.reason}`);
    }
  }
}
```

---

## 6. Edition 配置与加载系统

### 设计决策：单一 Edition Module 入口

不做泛化多类 plugin 平台。Core 启动时只加载一个 Edition Module，由该模块内部完成所有 plugin 组装。

**理由**：
- 多次 dynamic import 引入过早的"plugin 平台"复杂度
- 安全面难以收拢（每条 import 路径都要校验）
- 当前只有一个 downstream（OfficeClaw），泛化 plugin 平台是过度设计
- 第二个 downstream 真正出现时，再把 Edition Module 内部拆成独立 plugin registry

### edition.json Schema

```jsonc
{
  // === Bootstrap Contract ===
  "coreApiVersion": "^0.1.0",     // v3: 明确 0.x 允许 breaking
  "editionMain": "./edition-main.js",

  // === Branding ===
  "edition": "officeclaw",
  "version": "1.0.0",
  "branding": {
    "appName": "OfficeClaw",
    "windowTitle": "OfficeClaw - AI 协作平台",
    "logoSrc": "./branding/logo.svg",
    "themeColor": "#E29578",
    "locale": "zh-CN",
    "assetsDir": "./branding"
  },

  // === Identity ===
  "identity": {
    "mode": "trusted-header"
    // trusted-header 仅限私网/loopback，见 4.1 节传输信任约束
  },

  // === Login Gateway（Edition 自行消费，Core 不读取） ===
  "loginGateway": {
    "type": "huawei-iam",
    "iamUrl": "https://iam.myhuaweicloud.com",
    "registrationUrl": "https://id1.cloud.huawei.com/...",
    "resetPasswordUrl": "https://id5.cloud.huawei.com/...",
    "userTypes": ["huawei", "iam"],
    "promotionCode": "huawei_dev_blue"
  },

  // === Features（静态声明） ===
  "features": {
    "remoteSkillHub": true,
    "voiceIO": true,
    "agentTeams": true,
    "werewolfGame": false
  },

  // === Members ===
  "members": [
    {
      "catId": "office",
      "provider": "relayclaw",
      "defaultModel": "glm-5",
      "accountRef": "modelarts-shared"
    }
  ]

  // 注意：不再有 modelSources / skillSources / connectorPlugins 数组
  // 所有 plugin 组装由 editionMain 模块内部完成
}
```

### Edition Module 接口

```typescript
// Core 定义
export interface IEditionModule {
  register(registry: EditionRegistry): Promise<void>;
}

export interface EditionRegistry {
  addModelSource(source: IModelSource): void;
  addSkillSource(source: ISkillSource): void;
  addConnector(adapter: IConnectorAdapter): void;
  readonly logger: Logger;  // v3 新增
  // 注册完成后 Core 自动冻结 registry
}

// Edition 实现
// editions/officeclaw/edition-main.ts
import { HuaweiMaaSSource } from './plugins/huawei-maas-source';
import { TencentSkillHubSource } from './plugins/skillhub-source';
import { XiaoyiAdapter } from './plugins/xiaoyi-connector';

export default {
  async register(registry) {
    registry.addModelSource(new HuaweiMaaSSource(config));
    registry.addSkillSource(new TencentSkillHubSource(config));
    registry.addConnector(new XiaoyiAdapter(config));
  }
} satisfies IEditionModule;
```

### 加载逻辑

```typescript
// packages/api/src/edition/edition-loader.ts
export async function loadEdition(): Promise<EditionConfig> {
  const raw = findEditionJson();
  if (!raw) return DEFAULT_EDITION;

  const config = parseAndValidate(raw);

  // API 版本校验
  if (!semver.satisfies(CORE_API_VERSION, config.coreApiVersion)) {
    throw new Error(`Edition requires Core API ${config.coreApiVersion}, got ${CORE_API_VERSION}`);
  }

  // 安全边界 — 只允许 edition 目录内相对路径
  const editionDir = path.dirname(editionJsonPath);
  const mainPath = validatePluginPath(editionDir, config.editionMain);

  // 单一模块加载
  const editionModule = await import(mainPath) as IEditionModule;

  const registry = new EditionRegistry();

  // v3: register() 失败 = 拒绝启动
  try {
    await editionModule.register(registry);
  } catch (err) {
    logger.fatal(`Edition "${config.edition}" register() failed: ${err.message}`);
    process.exit(1);
  }

  registry.freeze();  // 运行时不可变

  config._registry = registry;
  return config;
}

// 安全校验
function validatePluginPath(editionDir: string, pluginPath: string): string {
  if (path.isAbsolute(pluginPath)) {
    throw new Error(`Absolute plugin paths are forbidden: ${pluginPath}`);
  }
  const realEditionDir = fs.realpathSync(editionDir);
  const resolved = fs.realpathSync(path.resolve(editionDir, pluginPath));
  const relative = path.relative(realEditionDir, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Plugin path escapes edition directory: ${pluginPath}`);
  }
  return resolved;
}
```

**默认 Edition（开源版）**：
- `branding.appName = "Clowder AI"`
- `identity.mode = "no-auth"`
- `features.*` 全部合理默认值
- 无任何 plugin 依赖

### Plugin 安全模型

| 规则 | 说明 |
|------|------|
| **仅 trusted local plugin** | 不支持 npm package plugin |
| **仅 edition 目录内相对路径** | 禁止绝对路径、`..` 逃逸 |
| **realpath 校验** | 防止 symlink 逃逸 |
| **仅启动时加载** | 运行时不可动态注册 |
| **registry 冻结** | 注册完成后 `Object.freeze()`，运行时不可变 |
| **apiVersion 校验** | Edition 声明兼容的 Core 版本，不匹配则拒绝启动 |
| **register() 失败即退出** | 不降级，不静默跳过 *(v3 新增)* |
| **edition.json = 启动配置** | 等同于 .env，只有运维人员有写权限 |

---

## 7. 前后端拆分详解

### 7.1 后端 Core / Edition 边界

#### 必须移到 Edition 的文件

| 文件 | 内容 | 目标位置 |
|------|------|---------|
| `routes/auth.ts`（整个文件） | 华为 IAM 认证 + 订阅逻辑 + 登录路由 | `editions/officeclaw/login-gateway/` |
| `routes/maas-models.ts` | 华为 MaaS 模型列表 | `editions/officeclaw/plugins/huawei-maas-source/` |
| `integrations/huawei-maas.ts` | 华为 MaaS 运行时配置 | 同上 |
| `config/model.json` | 华为模型元数据 | `editions/officeclaw/config/` |
| `config/maas-details.json` | 华为 MaaS 服务信息 | `editions/officeclaw/config/` |
| `vendor/jiuwenclaw/` | 九问 CLI | `editions/officeclaw/vendor/` |
| `vendor/dare-cli/` | DARE CLI | `editions/officeclaw/vendor/` |
| `modelarts-preset.json` | 华为预设 | `editions/officeclaw/` |
| `scripts/install-auth-config.mjs`（preset 部分） | 商业安装预设 | `editions/officeclaw/scripts/` |
| `web/src/app/login/page.tsx` | 华为 IAM 登录页 | `editions/officeclaw/login-gateway/web/` |
| **`routes/version.ts`（`/api/lastversion` 端点）** | **直连华为云端点，属强私有耦合** | **`editions/officeclaw/`** *(v3 新增)* |

#### Core 中需要改造的文件

| 文件 | 改造内容 |
|------|---------|
| `provider-profiles.types.ts` | 删 `'huawei_maas'` 硬编码，改用 `string` 尾巴 |
| `model-config-profiles.ts` | 删 `HUAWEI_MAAS_MODEL_SOURCE_ID` 常量 |
| `agent-teams-bundle.ts` | 华为 MaaS binding → 通过 IModelSource 解耦 |
| `DareAgentService.ts` | 删 `'huawei-modelarts'` 分支 |
| `invoke-single-cat.ts` | 删华为 MaaS 运行时配置注入 |
| `connector-gateway-bootstrap.ts` | 所有 connector 走统一 `IConnectorAdapter`，删小艺硬编码 |
| `index.ts`（主入口） | 增加 edition-loader 启动流程，注册 IdentityResolver |
| `hub-cat-editor.model.ts` | 删 `HUAWEI_MAAS_MODEL_SOURCE_ID`，模型源从 API 获取 |
| `ModelsPanel.tsx` | 模型源分组从 API 获取，不硬编码 |
| `web/src/app/layout.tsx` | `generateMetadata()` 从 branding API 读取 |
| `web/src/app/page.tsx` | 首页从强制跳 login → identity mode 驱动 |
| `ChatContainer.tsx` | 登录状态判断改为 identity mode 驱动 |
| **`request-identity.ts`** | **删除 `query.userId` fallback** *(v3 新增)* |
| **`connector.ts:183`** | **删除 `xiaoyi` 展示语义硬编码** *(v3 新增)* |

#### Core 新增文件

| 文件 | 职责 |
|------|------|
| `edition/edition-loader.ts` | 读 edition.json → 加载 Edition Module → 返回配置 |
| `edition/types.ts` | EditionConfig / EditionRegistry / CapabilityManifest 类型 |
| `identity/identity-resolver.ts` | IdentityResolver（no-auth / trusted-header / jwt） |
| `routes/edition-api.ts` | `/api/edition/capabilities` + `/api/edition/branding` + `/api/edition/status` 端点 |
| `model-sources/model-source.ts` | `IModelSource` 接口 |
| `skill-sources/skill-source.ts` | `ISkillSource` 接口 |
| **`routes/health.ts`** | **`/api/health`（liveness）+ `/api/readyz`（readiness + Redis/SQLite 连通性）** *(v3 新增)* |
| `web/src/hooks/useCapabilities.ts` | 前端 capability manifest hook（功能显隐） |
| `web/src/lib/branding-server.ts` | SSR 端调用 `/api/edition/branding`，**支持 `NEXT_PUBLIC_BRANDING_JSON` 环境变量 fallback** *(v3 新增)* |

### 7.2 前端 Core / Edition 边界

**核心策略：前端是编译后产物，不做代码插件化。定制通过两层机制实现。**

Core 构建出的前端包**无需任何修改**就能服务不同 edition。

#### 两层前端定制机制

| 层 | 职责 | 时机 | 实现 |
|---|------|------|------|
| **SSR Bootstrap** | 品牌元数据（title / themeColor / locale / logo / favicon） | 服务端渲染时 | `generateMetadata()` 调用 `/api/edition/branding`，**支持 `NEXT_PUBLIC_BRANDING_JSON` 环境变量 fallback** *(v3)* |
| **Capability Manifest** | 功能显隐（是否显示 SkillHub / 模型广场 / 特定 Hub tab） | 客户端运行时 | `useCapabilities()` hook 调用 `/api/edition/capabilities` |

**SSR Branding build-time fallback** *(v3 新增)*：

> 来源：宪宪识别的启动时序依赖。

`generateMetadata()` 调用 `/api/edition/branding` 时 API 必须已启动。当 Web 独立部署时（Docker / edge），API 可能不可达。

**解法**：`branding-server.ts` 优先读 `NEXT_PUBLIC_BRANDING_JSON` 环境变量（build-time 注入），API 不可达时 fallback 到此变量。实现成本 = 一个 `??` 操作符。

#### 前端改造清单

| 文件 | 改造 | 层 |
|------|------|---|
| `app/layout.tsx` | `generateMetadata()` 从 `/api/edition/branding` 读取 title/themeColor/locale | SSR |
| `app/login/page.tsx` | **整个文件移到 Edition**——Core 没有登录页 | N/A |
| `app/page.tsx` | 首页 identity mode 判断：no-auth → 直接进入 | SSR |
| `components/ThreadSidebar.tsx` | Logo / 品牌名 → 从 branding 读 | SSR |
| `components/SplitPaneView.tsx` | 同上 | SSR |
| `components/ChatEmptyState.tsx` | 品牌文案 → branding | SSR |
| `components/PushSettingsPanel.tsx` | "OfficeClaw" → `branding.appName` | Capability |
| `components/HubPermissionsTab.tsx` | 硬编码 feishu → 通用 connector 权限 API | Capability |
| `components/hub-cat-editor.model.ts` | 删 `HUAWEI_MAAS_MODEL_SOURCE_ID` → 模型源列表从 API 获取 | Capability |
| `utils/api-client.ts` | 删 `cafe.clowder-ai.com` 硬编码 → 纯 env 驱动 | N/A |

#### Edition 品牌资源挂载

```typescript
// Core API: 静态资源服务
app.register(fastifyStatic, {
  root: editionConfig.branding?.assetsDir ?? path.join(__dirname, 'default-assets'),
  prefix: '/edition-assets/',
});
```

---

## 8. 二进制交付方式

开源 Core 以**双轨制**交付：

### 8.1 npm 包（面向开发者和定制版集成商）

```bash
npm install @clowder-ai/core
```

- 版本管理成熟（semver）
- 定制版 `npm install` 后 overlay edition.json + edition-main.js → 启动
- 适合有 Node.js 环境的团队

### 8.2 预构建 Bundle（面向终端用户和桌面分发）

```
clowder-ai-core-v1.2.0-darwin-arm64/
├── node/                  # 内嵌 Node.js runtime
├── packages/              # 编译后的 API + Web + Shared
├── cat-cafe-skills/       # 开源 skills
├── edition.json           # 默认 edition（开源版配置）
├── redis/                 # 内嵌 Redis（可选）
├── tools/python/          # 内嵌 Python（可选）
└── start.sh               # 启动入口
```

### 8.3 Docker 镜像（面向服务端部署）

> **v3 变更**：从"后续按需"提升为 Phase 5 正式交付物。前提：`/api/health` + `/api/readyz` 端点必须在 Phase 5 前就位。

```dockerfile
FROM clowder-ai/core:latest
COPY edition.json /app/
COPY edition-main.js /app/
```

Docker 部署**依赖** liveness/readiness probe（`/api/health` / `/api/readyz`），没有健康检查端点的 Docker 镜像无法在生产 k8s 环境中使用。因此 health 端点是 Docker 交付的**前置依赖**，不是"后续按需"。

---

## 9. 数据流总览

```
                       edition.json
                           │
                    ┌──────┴──────┐
                    ▼             ▼
              Edition Module   Branding
              (register →      Config
              modelSources,
              skillSources,
              connectors)
                    │             │
                    ▼             ▼
  [Edition   ┌──────────── Core API ───────────────┐
   Login  →  │  IdentityResolver (header/JWT 解析)  │
   Gateway]  │  /api/edition/capabilities            │
  (外部)     │  /api/edition/branding (SSR bootstrap)│
              │  /api/health + /api/readyz  (v3新增)  │
              │  内置 Connector (统一 IConnectorAdapter)│
              │  Edition Connector (同一接口)          │
              └──────────────┬──────────────────────┘
                             │
                      ┌──────┼──────┐
                      ▼      ▼      ▼
                   首页    Hub    Sidebar
                  (SSR    Config  Brand
                   品牌)  (功能显隐由 capabilities manifest 驱动)
```

---

## 10. Core / Edition 归属总表

| 组件 | 归属 | 说明 |
|------|------|------|
| API 框架（Fastify + WebSocket + Redis） | Core | 通用运行时 |
| 所有 Agent Provider（Claude/Codex/Gemini/DARE/ACP/...） | Core | 通用 provider |
| IdentityResolver（no-auth / trusted-header / jwt） | Core | 只解析身份，不验证凭据 |
| 登录系统（Login Gateway / 登录页 / IAM 集成） | Edition | Core 前面的外部服务 |
| Provider Profile 存储 | Core | 通用配置 |
| Model Source Plugin 接口（`IModelSource`） | Core | 接口定义 |
| 华为 MaaS 模型目录 | Edition | plugin 实现 |
| 本地 Skill 管理（`LocalSkillSource`） | Core | 内置 |
| Skill Source Plugin 接口（`ISkillSource`） | Core | 接口定义 |
| 远程 SkillHub（腾讯） | Edition | 可选 plugin |
| 内置 IM Connector（Telegram/飞书/钉钉/微信） | Core | **统一 `IConnectorAdapter`**，有凭据即启用 |
| 小艺 Connector | **Edition** | 华为 A2A 协议，非通用 IM |
| Connector Plugin 接口（`IConnectorAdapter`） | Core | 扩展点，**内置也走此接口** *(v3)* |
| 前端 UI | Core | SSR branding + capability manifest 驱动渲染 |
| 品牌值（名字/Logo/文案） | Edition | edition.json 注入 |
| vendor/（jiuwenclaw, dare-cli） | Edition | 专属依赖 |
| Windows 安装器（C# Launcher + NSIS） | Edition | 定制版构建 |
| `cat-cafe-skills/`（通用） | Core | 开源 skill 库 |
| 定制版专属 skill | Edition | `editions/officeclaw/skills/` |
| Health / Readiness 端点 | Core | `/api/health` + `/api/readyz` *(v3)* |
| secure-config / Conf | **Edition** | Phase 1 迁移 *(v3)* |
| `/api/lastversion` 端点 | **Edition** | 华为云版本检查 *(v3)* |

---

## 11. MaaS 渗透清理顺序

> 按依赖拓扑从底向上清理。每步标注 compat shim 退役时间。

### Step 1: 类型松绑（先解除类型层的 vendor 锁定）

| 文件 | 操作 | Compat shim 退役 |
|------|------|------------------|
| `packages/api/src/config/provider-profiles.types.ts` | 删 `'huawei_maas'` 硬编码，改 `string` 尾巴 | Phase 3 结束删除旧 type alias |
| `packages/web/src/components/hub-provider-profiles.types.ts` | 同步修改 | Phase 3 |

### Step 2: 语义去特判（删除 vendor 常量）

| 文件 | 操作 | Compat shim 退役 |
|------|------|------------------|
| `packages/api/src/config/model-config-profiles.ts:15` | 删 `HUAWEI_MAAS_MODEL_SOURCE_ID` 常量 | Phase 3（常量删除即退役） |

### Step 3: 建立运行时解耦层（先有抽象，再动调用方）

| 文件 | 操作 | Compat shim 退役 |
|------|------|------------------|
| 新增 `IModelSource` 接口 + registry | Core 定义 | — |
| `packages/api/src/utils/agent-teams-bundle.ts:108` | 华为 MaaS binding → 通过 IModelSource 解耦 | Phase 3 |
| `packages/api/src/routes/cats.ts:303` | 模型解析走 registry | Phase 3 |
| `packages/api/src/domains/cats/services/agents/invocation/invoke-single-cat.ts:651` | 删华为 MaaS 运行时配置注入 | Phase 3 |

### Step 4: 替换模型路由入口

| 文件 | 操作 | Compat shim 退役 |
|------|------|------------------|
| `packages/api/src/routes/maas-models.ts:405` | 先保兼容别名，再切主路由到 IModelSource | Phase 4 结束删除别名路由 |

### Step 5: 前端语义清理（最后切）

| 文件 | 操作 | Compat shim 退役 |
|------|------|------------------|
| `packages/web/src/components/hub-cat-editor.model.ts:244` | 模型源从 API 获取，不硬编码 | Phase 3（display metadata API 就绪后） |
| `packages/web/src/components/ModelsPanel.tsx:129` | 分组基于 display metadata，非 source ID | Phase 3 |
| `packages/web/src/components/CreateAgentModalDraft.tsx:211` | 同上 | Phase 3 |

**前置条件**：Step 5 必须等 "display metadata API" 就绪后才能执行。

### Step 6: 扫尾（注释级残留，不抢主线）

| 文件 | 操作 | Compat shim 退役 |
|------|------|------------------|
| `context-window-sizes.ts` 等 | 注释/示例中的 Huawei 引用 | Phase 4（soft gate 追踪） |
| `packages/api/src/integrations/huawei-maas.ts` | 整文件移入 Edition | Phase 3 |

### 其他 compat shim 退役清单 *(v3 新增)*

| Shim | 当前位置 | 退役 Phase |
|------|---------|-----------|
| `query.userId` fallback | `request-identity.ts:4` | **Phase 1**（安全漏洞） |
| `providerProfileId` fallback | 待审计 | Phase 3 |
| `huawei_maas` union type | `provider-profiles.types.ts` | Phase 3 |
| `xiaoyi` 展示语义 | `connector.ts:183` | Phase 4 |

> **铁律**：每个 compat shim 在引入时标注 `// @deprecated Phase N — 到期删除`。

---

## 12. 迁移计划

### Phase 0: 发布门禁（Public Artifact Gate）— 1 周

**同仓隔离只是组织约定，必须有技术级断言防止泄漏。**

| 任务 | 工作量 |
|------|--------|
| 定义 Core 产物白名单（npm pack `files` + bundle manifest） | 2 天 |
| CI 禁词扫描脚本（见下方分级规则） | 2 天 |
| `npm pack --dry-run` 校验 + bundle manifest diff gate | 1 天 |
| 集成到 CI pipeline（每次 PR + 发布前必过） | 1 天 |
| **SQLite schema 归属审计**（evidence.db 每表/字段 → Core or Edition） | **0.5 天** *(v3 新增)* |

#### 禁词扫描分级规则 *(v3 新增)*

> 来源：四猫一致认为单级扫描不可操作。

| 级别 | 扫描对象 | 触发行为 | 词典 |
|------|---------|---------|------|
| **Hard gate**（阻止发布） | npm 打包产物 (`npm pack --dry-run`)、bundle manifest、编译后 JS | PR 阻断 + 发布阻断 | OfficeClaw, Huawei, huawei, modelarts, lightmake.site, jiuwenclaw, maas-details, XiaoYi |
| **Soft gate**（告警追踪） | 源码 `.ts/.tsx/.json`（排除 `editions/`） | PR warning，不阻断 | 同上 |
| **白名单排除** | `docs/`, `*.md`, `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `test fixtures`, `editions/` | 不扫描 | — |

**关键**：Hard gate 扫描的是**产物**（用户实际拿到的东西），不是源码。源码层是 soft gate。不分级 = Phase 0 门禁上线即瘫痪。

### Phase 1: 切身份边界 — 5.5 周

**原因**：登录是最敏感的私有逻辑，且当前首页对登录有硬耦合。

| 任务 | 工作量 |
|------|--------|
| 实现 `IdentityResolver`（no-auth / trusted-header / jwt） + 传输约束文档 | 3 天 |
| **删除 `query.userId` fallback**（`request-identity.ts`） | **0.5 天** *(v3 新增)* |
| 删除 Core 中的 `/api/login` 路由、auth.ts 整文件 | 2 天 |
| **绘制凭据链拓扑图（§4.1.1），确认 session→MaaS 切割点** | **1 天** *(v3 新增)* |
| **迁移 `secure-config`/`Conf` 中的 Edition-owned 数据** | **1 天** *(v3 新增)* |
| **迁移 `/api/lastversion` 华为端点到 Edition** | **0.5 天** *(v3 新增)* |
| 将华为 IAM 登录逻辑提取为 Edition Login Gateway | **2.5-3 周** |
| 首页从「强制跳 login」改为 identity mode 驱动 + ChatContainer 登录闸门 | 3 天 |
| `edition-loader` + Edition Module 基础框架 | 1 周 |
| Plugin 安全校验（路径 + realpath + registry freeze） | 0.5 天 |
| `CAT_CAFE_SKIP_AUTH` → `no-auth` mode 迁移 | 1 天 |
| **`/api/health` + `/api/readyz` 健康检查端点** | **0.5 天** *(v3 新增)* |
| 开源版 E2E 验收 | 1 天 |

#### Week 2 并行依赖缓解措施 *(v3 新增)*

> 来源：四猫一致认为的关键路径风险。

| 里程碑 | 截止时间 | 内容 |
|--------|---------|------|
| **接口冻结** | Week 1 Day 3 | B 交付 `IdentityResolver` 接口定义（不是实现），A 基于接口定义开发 Gateway 骨架 |
| **Stub edition-loader** | Week 2 结束 | B 交付可用的 stub edition-loader，A 可集成测试 |
| **Integration checkpoint** | Week 2 结束 | A + B 对齐 `EditionRegistry` 接口定义 + Identity header 格式 + Capability manifest skeleton |

没有这三个里程碑，Week 2-5 的并行就是假并行。

**Phase 1 验收标准（开源版用户故事）**：

1. 用户下载 Core bundle，解压，运行 `./start.sh`
2. 无 edition.json → DEFAULT_EDITION（`no-auth` 模式）
3. 浏览器打开 → 直接进入主界面（无登录页，无品牌 splash）
4. 用户在 Web UI 中配置 OpenAI/Anthropic/Google API Key *(v3 明确)*
5. 创建对话，选择模型，发送消息，收到回复
6. 本地 skill 可用，无远程市场入口
7. 无任何 OfficeClaw / 华为 / ModelArts 字样出现在 UI 或日志中
8. `/api/health` 返回 `{ status: "ok" }` *(v3 新增)*
9. 验收方式：clean-room E2E + forbidden-term scan，录屏存档

**Login Gateway 分步策略**：
- **Week 1-2**：最小 Gateway（独立 Fastify 进程，华为 IAM 对接，成功后注入 `X-Cat-Cafe-User` header）
- **Week 3**：与 C# Launcher + WebView2 集成（登录流 → Gateway → Core 跳转）

### Phase 2: SSR Branding Bootstrap + 品牌去硬编码 — 3 周

| 任务 | 工作量 |
|------|--------|
| `/api/edition/branding` 端点（SSR 时调用） | 2 天 |
| `/api/edition/capabilities` 端点（功能显隐） | 2 天 |
| **`NEXT_PUBLIC_BRANDING_JSON` 环境变量 fallback** | **0.5 天** *(v3 新增)* |
| `layout.tsx` 改为 `generateMetadata()` 从 branding 读取 title / themeColor / locale | 2 天 |
| `/edition-assets/*` 静态资源挂载（logo / banner / favicon） | 1 天 |
| 前端品牌去硬编码（~10 文件：Sidebar / SplitPane / ChatEmpty / Push / api-client） | 1 周 |
| 前端 `useCapabilities` hook（功能显隐，Zustand 缓存） | 2 天 |

### Phase 3: 切模型目录边界 — 3.5 周

| 任务 | 工作量 |
|------|--------|
| 定义 `IModelSource` 接口 + 注册表 | 3 天 |
| **"显示 metadata API"——模型源返回 display name/icon/group，前端不猜语义** | **2 天** *(v3 新增)* |
| 提取 `huawei-maas.ts` + `maas-models.ts` → edition plugin | 1 周 |
| 清理 `provider-profiles.types.ts`（删 `'huawei_maas'`，改 string 尾巴） | 2 天 |
| 清理 `model-config-profiles.ts`（删 `HUAWEI_MAAS_MODEL_SOURCE_ID`） | 1 天 |
| 清理 `agent-teams-bundle.ts`（华为 MaaS binding → 通过 IModelSource 解耦） | 3 天 |
| 清理 `hub-cat-editor.model.ts` + `ModelsPanel.tsx`（前端模型源从 API 获取） | 3 天 |
| `invoke-single-cat.ts`（删华为 MaaS 运行时配置注入） | 1 天 |
| `DareAgentService.ts`（删 `'huawei-modelarts'` 分支） | 0.5 天 |
| `vendor/` + `config/` + `modelarts-preset.json` 移入 `editions/officeclaw/` | 1 天 |
| **退役 Phase 3 标注的 compat shims** | **0.5 天** *(v3 新增)* |

按第 11 节的 6 步清理顺序执行，不可跳步。**Step 5（前端清理）必须等 display metadata API 就绪。**

### Phase 4: 切 Skill 市场 + Connector 扩展 — 3.5 周

| 任务 | 工作量 |
|------|--------|
| 定义 `ISkillSource` 接口 | 2 天 |
| 重构 `SkillCatalogService`：本地 source 内置 + 远程 source 可选注册 | 1 周 |
| 提取 `TencentSkillHubService` → edition plugin | 3 天 |
| 清理路由类型中的 SkillHub 硬依赖 | 2 天 |
| **重构内置 Connector 走统一 `IConnectorAdapter`（含 `health()` + `capabilities()`）** | **3 天** *(v3 更新)* |
| Connector Plugin 发现 + 加载器 | 3 天 |
| `edition.json` schema 完善 + JSON Schema 验证 | 2 天 |
| XiaoyiAdapter → Edition plugin（含 shared types `connector.ts:183` + 前端图标） | 1-1.5 天 |
| **微信 Connector 单独评估是否外置** | **0.5 天** *(v3 新增)* |
| **退役 Phase 4 标注的 compat shims** | **0.5 天** *(v3 新增)* |

### Phase 5: 交付 + 验收 — 3 周

| 任务 | 工作量 |
|------|--------|
| npm 包发布流程（`files` 白名单 + 自动化发布） | 3 天 |
| 预构建 Bundle 构建脚本（各平台） | 1 周 |
| **Docker 镜像构建（依赖 `/api/health` + `/api/readyz`）** | **2 天** *(v3 新增)* |
| **Core/Edition 配对发布契约（安装器/launcher 级版本校验）** | **1 天** *(v3 新增)* |
| **契约测试矩阵（Core vN × Edition vM 自动化验证）** | **2 天** *(v3 新增)* |
| 开源版 E2E（无 edition，纯净启动，确认无定制残留） | 3 天 |
| 定制版 E2E（OfficeClaw 完整功能回归） | 3 天 |
| 禁词扫描 + bundle diff 最终验收 | 1 天 |

### 总工作量

| | 单人 | 双人并行 |
|---|---|---|
| Phase 0-5 合计 | **约 21 周** *(v3 微调)* | **约 11-12 周** |

> v3 较 v2 增加 ~1.5 周，主要来自凭据链切割、健康检查、禁词分级、compat shim 管理等新增任务。

### 第一刀

**Phase 0 发布门禁 → Phase 1 切 Identity Boundary。**（CVO 已拍板）

### 人员分工（双人并行）

| 时段 | 人员 A | 人员 B |
|------|--------|--------|
| Week 1 | Phase 0 发布门禁 + SQLite 审计 | Phase 1 IdentityResolver + **接口定义冻结 (Day 3)** *(v3)* |
| Week 2-3 | Phase 1 Login Gateway (最小 Gateway) | Phase 1 edition-loader + Edition Module + **stub 交付 (Week 2 末)** *(v3)* |
| **Week 2 末** | **Integration checkpoint** *(v3)* | **Integration checkpoint** *(v3)* |
| Week 4-5 | Phase 1 Login Gateway + Launcher 集成 | Phase 1 首页改造 + 开源版 E2E |
| Week 6 | Phase 1 验收 + Phase 2 branding API | Phase 2 前端去硬编码 |
| Week 7-8 | Phase 2 完成 + Phase 3 类型松绑/语义去特判 | Phase 3 运行时解耦 + display metadata API |
| Week 9-10 | Phase 3 前端清理 + Phase 4 ISkillSource | Phase 4 SkillHub + 小艺 + **统一 Connector 接口** *(v3)* |
| Week 11-12 | Phase 5 npm 包 + bundle + Docker | Phase 5 E2E + release gate + **契约测试** *(v3)* |

### 每个 Phase Feature Doc 必须包含

1. 技术设计（接口 + 数据流）
2. 文件级迁移清单（从哪到哪）
3. **数据迁移清单**（State Ownership Contract 对照）
4. **存量实例升级路径**
5. **Compat shim 清单**（引入的 shim + 退役 Phase） *(v3 新增)*
6. 验收标准（测试 + forbidden-term scan + 截图/录屏）

---

## 13. 风险与注意事项

1. **同仓隔离 ≠ 发布安全**——目录隔离只是组织约定，Phase 0 发布门禁必须先到位
2. **如果先切 SkillHub 而不先切身份**——core 继续被商用入口逻辑绑死
3. **如果只做 UI 隐藏，不做 route/service 边界**——私有逻辑还在开源仓
4. **如果过早追求完全插件化**——架构成本过高，拖慢主线迁移
5. **IM Connector 统一接口是硬要求**——内置 connector 不开后门，将来外置零成本 *(v3 更新)*
6. **前端品牌替换的完整性**——不只是字符串替换，SSR 品牌注入 + build-time fallback 必须到位
7. **MaaS / SkillHub 渗透比看上去深**——不是搬文件，而是清理散落在 4-5 层的语义耦合
8. **Edition Login Gateway 是新增组件**——当前没有独立的登录服务，切 auth 时需要新建
9. **trusted-header 安全风险**——Core 以 `trusted-header` 模式直暴公网 = 身份欺骗
10. **单一 Edition Module 的演进压力**——简化为单入口，第二个 downstream 出现时需要拆分
11. **小艺不只是 adapter**——它还写入了 shared types（`connector.ts:183`）和前端注册表（4+ 个文件）
12. **State Ownership 不明确会导致升级翻车**——每个 Phase 必须对照 §4.6 表格
13. **Identity 和 Model Runtime 的暗耦合**——`auth session → MaaS runtime` 凭据链必须在 Phase 1 切断，否则后续协议面全是假解耦 *(v3 新增)*
14. **`/api/lastversion` 直连华为云端点**——文档遗漏的私有耦合点，Phase 1 迁移 *(v3 新增)*
15. **Compat shim 如果没有退役计划会变成永久债务**——每个 shim 标注截止 Phase *(v3 新增)*
16. **禁词扫描不分级 = Phase 0 门禁上线即瘫痪**——CLAUDE.md 等文档文件会触发误报 *(v3 新增)*
17. **Week 2 并行依赖无缓解措施 = 假并行**——接口冻结里程碑是硬要求 *(v3 新增)*
18. **`secure-config`/`Conf` 是 Edition-owned state**——遗漏的状态归属，Phase 1 迁移 *(v3 新增)*
19. **`register()` 失败静默降级比 crash 更危险**——必须拒绝启动 *(v3 新增)*

**节奏**：先做发布门禁 → 再做清晰边界 → 再做稳定协议 → 最后再考虑更重的插件平台。

---

## 14. 后续产物

本方案落地后：

1. **立即**：砚砚产出 Phase 0 + Phase 1 的文件级迁移清单 + 回归测试矩阵 + 凭据链拓扑图
2. **Phase 1 启动前**：Identity Contract 技术设计 Feature Doc（含 §4.1.1 凭据链切割方案）
3. **Phase 2 启动前**：SSR Branding + Capability Manifest Feature Doc（含 build-time fallback + modelSources 过渡策略）
4. **Phase 3 启动前**：Model Catalog Contract Feature Doc（含 6 步清理顺序 + display metadata API 设计）
5. **Phase 4 启动前**：Skill Registry + Connector Plugin Feature Doc（含小艺提取清单 + 统一 IConnectorAdapter 改造）
6. **Phase 5 启动前**：交付 pipeline + release gate + 契约测试矩阵 + Docker 镜像设计

---

## 附录 A：v2 团队评审记录

### 参与者与立场（第一轮）

| 评审人 | 立场 | 重点贡献 |
|--------|------|---------|
| 宪宪/Opus-46 | 方向正确，6 项修正 | 代码库验证、工作量修正、开源版用户故事 |
| 砚砚/Codex | 方向正确，5/6 同意 + 1 部分同意 | MaaS 清理顺序（file:line）、Login Gateway 耦合点补充、门禁复查 |
| GPT-5.4 | 方向正确，5/6 同意 + #4 要更严 | 单一 Edition Module 简化、trusted-header 安全、两个支撑契约、plugin 安全加严 |

---

## 附录 B：v3 团队评审记录 *(新增)*

### 参与者与立场（第二轮，2026-04-06）

| 评审人 | 立场 | 重点贡献 |
|--------|------|---------|
| 宪宪/Opus-46 | 全票 Go | SQLite 归属审计、IM 统一接口、禁词分级、SSR fallback、健康检查、Week 2 里程碑 |
| GPT-5.4 | 全票 Go | `auth session → MaaS runtime` 暗耦合（P0）、`secure-config` owner、compat shim 退役、配对发布契约、connector 抽象偏薄 |
| 砚砚/Codex | 全票 Go | `/api/lastversion` 华为端点（遗漏）、`connector.ts:183` xiaoyi 硬编码、禁词统计口径差异、契约测试矩阵 |
| Sonnet | 全票 Go | `register()` 失败语义（拒绝启动 vs 降级）、禁词白名单遗漏、健康检查是 Docker 前置依赖、微信 Connector 单独评估、Week 2 B→A 依赖缓解 |

### 核心共识

1. `public core → private downstream editions` 方向**四猫全票通过**
2. 所有 connector（含内置）走统一 `IConnectorAdapter`——**CVO 拍板**
3. `auth session → MaaS runtime` 暗耦合是 **P0 风险**，Phase 1 必须切断
4. Phase 0 禁词扫描必须 **hard/soft 两级**，否则不可操作
5. **接口冻结里程碑**（Week 1 Day 3）是并行开发的硬前提
6. `register()` 失败 = **拒绝启动**，不降级
7. `secure-config`/`Conf` 是 Edition-owned state，Phase 1 迁移
8. 健康检查端点工作量极小但价值极高，Phase 1 即做
9. Compat shim 必须有退役计划，每个标注截止 Phase

### 分歧（已收敛）

| 议题 | 收敛结果 |
|------|---------|
| IM Connector 全内置 vs 外置 | CVO 拍板：统一接口，代码暂留 Core |
| 微信 Connector 是否内置 | Phase 4 单独评估 |
| SQLite 是否"遗漏" | 不是遗漏，但"如有"不够严，改为明确条目 |

---

*[宪宪/Opus-46🐾] — 基于四猫评审 + CVO 拍板收敛*
