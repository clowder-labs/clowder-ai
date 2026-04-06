---
feature_ids: []
topics: [architecture, binary-core, phase-0, phase-1, migration, identity]
doc_kind: decision
created: 2026-04-06
authors: [codex, opus]
status: active
---

# Binary Core Phase 0 + Phase 1 执行包

> 依据 `binary-core-product-line-v3.md`，由砚砚产出文件级迁移清单 + 凭据链拓扑 + IdentityResolver 接口，宪宪审核并落盘。

## 重要调整（相对 V3）

**MaaS 凭据链在 Phase 1 一起切断**，而非等到 Phase 3。

原因：§4.1.1 凭据链拓扑证明 `auth.ts → sessions/Conf → huawei-maas.ts → invoke-single-cat.ts` 是同一条链。如果 Phase 1 只切 auth 不切 MaaS 凭据路径，Identity Contract 与 Model Catalog Contract 仍然共享登录状态——这是假解耦。

影响：Phase 1 工作量从 5.5 周增加到约 **6.5-7 周**，但换来的是 Phase 1 结束后 Core 真正具备独立启动能力。Phase 3 的 MaaS 清理工作相应减少。

---

## 1. Phase 0 文件级迁移清单

| 优先级 | 动作 | 源文件 | 目标 | DoD |
|--------|------|--------|------|-----|
| P0 | 禁词扫描外置配置 | `scripts/check-public-gate.mjs` | 新增 `scripts/public-gate/terms.json` + `soft-whitelist.json` | 词典可维护，不硬编码在脚本里 |
| P0 | CI 接入 hard gate | `.github/workflows/ci.yml` | 同文件增加步骤 | PR 命中 hard 词时 fail |
| P0 | SQLite owner 审计 | 已完成 | `docs/decisions/phase0-sqlite-schema-audit.md` | ✅ 每张表标注 Core/Edition owner |
| P0 | 基线扫描报告 | 已完成 | `docs/decisions/phase0-baseline-scan.md` | ✅ 61 文件 / 397 处命中 |

---

## 2. Phase 1 文件级迁移清单

### 2.1 必须移到 Edition 的文件（P0 优先级）

| 源文件 | 目标位置 | DoD |
|--------|---------|-----|
| `packages/api/src/routes/auth.ts` | `editions/officeclaw/login-gateway/src/routes/auth.ts` | Core 无 `/api/login`、无 `sessions`、无 `secure-config` |
| `packages/api/src/routes/version.ts`（`/api/lastversion` 部分） | Edition；Core 只保留 `/api/curversion` | Core 不直连华为版本端点 |
| `packages/api/src/integrations/huawei-maas.ts` | `editions/officeclaw/plugins/huawei-maas-source/src/runtime.ts` | Core 无 `resolveHuaweiMaaSRuntimeConfig` |
| `packages/api/src/routes/maas-models.ts` | `editions/officeclaw/plugins/huawei-maas-source/src/routes/` | Core 无 `/api/maas-models` 路由 |

### 2.2 Core 中必须改造的文件（P0 优先级）

| 文件 | 改造内容 | DoD |
|------|---------|-----|
| `packages/api/src/utils/request-identity.ts` | 删除 `query.userId` fallback | 身份来源仅 header/jwt/default |
| `packages/api/src/domains/cats/services/agents/invocation/invoke-single-cat.ts:803` | 删 `huawei_maas` 分支，改走 `IModelSource.resolveRuntimeConfig()` | 无 MaaS 硬编码 |
| `packages/api/src/utils/agent-teams-bundle.ts:108` | 删华为 MaaS binding，走 IModelSource | 无 MaaS 硬编码 |

### 2.3 Core 中必须改造的文件（P1 优先级）

| 文件 | 改造内容 | DoD |
|------|---------|-----|
| `packages/api/src/domains/cats/services/agents/providers/DareAgentService.ts:260` | 删 `huawei-modelarts` env 映射 | 无 vendor 特判 |
| `packages/api/src/infrastructure/connectors/connector-gateway-bootstrap.ts:24` | 删 XiaoyiAdapter 导入和硬编码注册 | Core 无 xiaoyi 依赖 |
| `packages/shared/src/types/connector.ts:183` | 删 `xiaoyi` 展示语义硬编码 | connector 类型表纯通用 |
| `packages/web/src/components/HubConfigIcons.tsx:54` | 删 xiaoyi 图标硬编码，改 capabilities 驱动 | 无 vendor 图标 |
| `packages/web/src/app/layout.tsx` | `generateMetadata()` 从 branding API 读 | 无硬编码品牌 |
| `packages/web/src/components/ThreadSidebar/ThreadSidebar.tsx` | 品牌名从 branding 读 | 无 OfficeClaw 字样 |
| `packages/web/src/components/HubButton.tsx` | 品牌名从 branding 读 | 无 OfficeClaw 字样 |
| `packages/web/src/components/SplitPaneView.tsx` | 品牌名从 branding 读 | 无 OfficeClaw 字样 |
| `packages/web/src/components/ChatEmptyState.tsx` | 品牌文案从 branding 读 | 无 OfficeClaw 字样 |
| `packages/web/src/app/page.tsx` | 首页从强制跳 login → identity mode 驱动 | no-auth 直接进入 |

### 2.4 Core 新增文件

| 文件 | 职责 | DoD |
|------|------|-----|
| `packages/api/src/identity/identity-resolver.ts` | 统一身份解析（no-auth / trusted-header / jwt） | 三模式可测 |
| `packages/api/src/edition/edition-loader.ts` | edition.json 加载 + Edition Module 注册 | `coreApiVersion` 校验 + registry freeze |
| `packages/api/src/edition/types.ts` | EditionConfig / EditionRegistry / CapabilityManifest | 类型完备 |
| `packages/api/src/routes/edition-api.ts` | `/api/edition/branding` + `/capabilities` + `/status` | 三端点可测 |
| `packages/api/src/routes/health.ts` | `/api/health`（liveness）+ `/api/readyz`（readiness） | 含 Redis/SQLite 连通性 |
| `packages/api/src/model-sources/model-source.ts` | `IModelSource` 接口 | stub 实现可测 |
| `packages/web/src/hooks/useCapabilities.ts` | 前端 capability manifest hook | 功能显隐可测 |
| `packages/web/src/lib/branding-server.ts` | SSR branding（含 env var fallback） | build-time 注入可用 |

---

## 3. 凭据链拓扑图

### 3.1 当前态（P0 风险）

```
[Web Login Page]
    → /api/login (auth.ts:72)
        → Huawei IAM (外部认证)
        → sessions Map (内存存储登录态)
        → secureConfig / Conf (存 promotion code / modelInfo)
            → /api/maas-models refresh
                → resolveHuaweiMaaSRuntimeConfig(userId) (huawei-maas.ts)
                    → invoke-single-cat.ts:805 (MaaS env 注入)
                    → agent-teams-bundle.ts:108 (MaaS binding)

[/api/lastversion (version.ts:40)]
    → 华为云版本端点 (直连外部)
```

**问题**：Identity（auth.ts）和 Model Runtime（huawei-maas.ts）共享同一个 `sessions` 对象。切 Identity 不切 MaaS = 假解耦。

### 3.2 目标态（Phase 1 后）

```
[Edition Login Gateway]
    → 认证成功 → 注入 X-Cat-Cafe-User header / JWT
                        ↓
                [Core IdentityResolver]
                    → resolve(request) → ResolvedIdentity { userId, mode, source }
                        ↓
                [Core API — provider-agnostic]
                    → invoke-single-cat → IModelSource.resolveRuntimeConfig(modelId)
                    → agent-teams-bundle → IModelSource.resolveRuntimeConfig(modelId)

[Core /api/curversion] — 本地版本
[Edition /api/lastversion] — 可选，华为云端点
```

### 3.3 切割点

| ID | 位置 | 操作 | Phase |
|----|------|------|-------|
| C1 | `auth.ts` 整文件 | 迁出 Core → Edition Login Gateway | Phase 1 |
| C2 | `request-identity.ts:40` | 删 `query.userId` fallback，仅 header/jwt/default | Phase 1 |
| C3 | `huawei-maas.ts` 整文件 | 迁出 Core → Edition ModelSource plugin | Phase 1 |
| C4 | `version.ts:40` | `/api/lastversion` 迁出 Core → Edition | Phase 1 |
| C5 | `auth.ts:66` 的 `Conf`/`secureConfig` | 明确为 Edition-owned state，Core 不读写 | Phase 1 |

---

## 4. IdentityResolver 接口定义（Phase 1 Day 3 冻结）

```typescript
// packages/api/src/identity/identity-resolver.ts

export type IdentityMode = 'no-auth' | 'trusted-header' | 'jwt';

export interface IdentityConfig {
  mode: IdentityMode;
  /** no-auth 模式下的默认用户 ID */
  defaultUserId?: string;
  trustedHeader?: {
    /** 用户身份 header 名，默认 X-Cat-Cafe-User */
    userHeader?: string;
    /** 是否要求签名头校验，默认 false */
    requireSignedHeaders?: boolean;
    /** 签名 header 名，默认 X-Cat-Cafe-Signature */
    signatureHeader?: string;
    /** 时间戳 header 名，默认 X-Cat-Cafe-Timestamp */
    timestampHeader?: string;
    /** Nonce header 名，默认 X-Cat-Cafe-Nonce */
    nonceHeader?: string;
    /** HMAC shared secret 的环境变量名 */
    sharedSecretEnv?: string;
    /** 最大时间偏差（秒），默认 30 */
    maxSkewSeconds?: number;
    /** 允许的客户端 CIDR（可选传输层加固） */
    allowedCidrs?: string[];
  };
  jwt?: {
    issuer?: string;
    audience?: string | string[];
    /** JWKS 端点 URL */
    jwksUrl?: string;
    /** PEM 公钥（与 jwksUrl 二选一） */
    publicKeyPem?: string;
    /** 时钟容差（秒），默认 30 */
    clockToleranceSec?: number;
  };
}

export interface ResolvedIdentity {
  userId: string;
  mode: IdentityMode;
  source: 'default' | 'trusted-header' | 'jwt';
  /** JWT 模式下的原始 claims */
  claims?: Record<string, unknown>;
}

export interface IdentityError {
  code:
    | 'MISSING_IDENTITY'
    | 'UNTRUSTED_TRANSPORT'
    | 'INVALID_SIGNATURE'
    | 'REPLAY_DETECTED'
    | 'JWT_INVALID';
  message: string;
  statusCode: 401 | 403;
}

export type IdentityResult =
  | { ok: true; identity: ResolvedIdentity }
  | { ok: false; error: IdentityError };

export interface IdentityResolver {
  resolve(request: FastifyRequest): Promise<IdentityResult>;
}
```

### 请求头规范（trusted-header 模式）

| Header | 必填 | 说明 |
|--------|------|------|
| `X-Cat-Cafe-User` | 是 | 用户身份（明文） |
| `X-Cat-Cafe-Timestamp` | 仅 `requireSignedHeaders=true` | Unix 秒，偏差 ≤ `maxSkewSeconds` |
| `X-Cat-Cafe-Nonce` | 仅 `requireSignedHeaders=true` | 一次性随机串，Redis TTL 去重 |
| `X-Cat-Cafe-Signature` | 仅 `requireSignedHeaders=true` | `HMAC_SHA256(secret, user + "." + timestamp + "." + nonce)` |

### 错误码

| Code | HTTP Status | 触发条件 |
|------|-------------|---------|
| `MISSING_IDENTITY` | 401 | 未提供身份信息 |
| `UNTRUSTED_TRANSPORT` | 403 | `trusted-header` 模式但请求来源不在 `allowedCidrs` |
| `INVALID_SIGNATURE` | 403 | 签名校验失败 |
| `REPLAY_DETECTED` | 403 | Nonce 重复（防重放） |
| `JWT_INVALID` | 401 | JWT 验签失败 / 过期 / issuer 不匹配 |

### 迁移策略

1. Phase 1 中 `no-auth` 和 `trusted-header` 两模式优先实现
2. `jwt` 模式可在 Phase 1 末或 Phase 2 补完
3. Phase 1 末**删除** `query.userId` 入口（C2 切割点）

---

## 5. 并行依赖里程碑（V3 §12 补充）

| 里程碑 | 截止 | 负责 | 内容 |
|--------|------|------|------|
| IdentityResolver 接口冻结 | Week 1 Day 3 | B | 本文档 §4 接口 + header 规范 |
| Stub edition-loader 交付 | Week 2 末 | B | 可加载 DEFAULT_EDITION 的最小实现 |
| Integration checkpoint | Week 2 末 | A + B | EditionRegistry 接口对齐 + Identity header 格式对齐 |

---

*[砚砚/Codex🐾] 产出 · [宪宪/Opus-46🐾] 审核落盘*
