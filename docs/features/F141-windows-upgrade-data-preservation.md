---
feature_ids: [F141]
related_features: [F140]
topics: [windows, installer, upgrade, data-preservation, data-directory]
doc_kind: spec
created: 2026-04-13
updated: 2026-04-14
---

# F141: Windows 升级数据保留方案

> Status: implemented | Owner: Claude/宪宪

## Why

当前 Windows 版本的"升级"流程是**卸载 → 重装**。卸载时用户可选择保留数据，但存在两个层面的问题：

1. **显式保护缺失**：`uploads/`、`workspace/` 等目录未被显式保护，靠"不在删除列表中"隐式存活
2. **数据目录落错区域**：多个后端数据目录的物理路径落在 MANAGED 区域内（`packages/api/data/`），升级时直接被删除

根因：API 进程的 cwd 是 `packages/api/`（`start-windows.ps1:550`），相对路径 `./data/` 解析到 `$INSTDIR/packages/api/data/`（MANAGED）而非 `$INSTDIR/data/`（PRESERVE）。

---

## Part 1: 数据保留基线

### 1.1 当前分类体系

数据分三层：**PRESERVE**（升级保留）、**MANAGED**（升级替换）、**未声明**（灰色地带）。

定义位置有**两个独立来源**，当前未完全同步：
- `scripts/build-windows-installer.mjs:75-90` — JS 常量 `WINDOWS_PRESERVE_PATHS` / `WINDOWS_MANAGED_TOP_LEVEL_PATHS`，写入 `.office-claw-release.json` 元数据，**NSIS 不读取**
- `packaging/windows/installer.nsi:691-727` — `CleanupManagedPayload` 宏，**实际执行删除的单一真相源**

> **重要**: NSIS 采用**显式删除列表**（allowlist delete），不在列表中的路径不会被删除。
> 因此"保留"是通过"不在删除列表中"实现的，而非通过"在保留列表中"。
> `WINDOWS_PRESERVE_PATHS` JS 常量仅作为元数据/意图声明，不直接影响 NSIS 行为。

### 1.2 PRESERVE — 卸载选「否」/ 覆盖安装时保留

> 仅当用户卸载时选「是」（删除所有用户数据）才会被删除。
> 覆盖安装和卸载选「否」两种场景下均保留。

| 路径 | 内容 | 说明 |
|------|------|------|
| `.env` | 用户环境变量 | 重装时如不存在才从 `.env.example` 复制 |
| `office-claw-config.json` | 应用配置 | 重装时如不存在才从 seed 复制 |
| `data/` | 用户运行时数据 | 见 1.2.1 |
| `logs/` | 应用日志 | 包含历史运行日志 |
| `.office-claw/` | 本地运行时配置 | 见 1.2.2 |
| `workspace/` | 线程默认工作区 | 本次新增显式保护 |

#### 1.2.1 `data/` 子目录明细

| 子路径 | 内容 | 是否可重建 |
|--------|------|-----------|
| `data/transcripts/` | 会话记录 | 不可重建，用户核心数据 |
| `data/audit-logs/` | 审计日志 | 不可重建 |
| `data/uploads/` | 用户上传图片（含 agent 头像） | 不可重建（本次移入 data/ 下） |
| `data/logs/api/` | API 运行日志 | 可清除但有诊断价值 |
| `data/cli-raw-archive/` | CLI 原始会话存档 | 不可重建 |
| `data/connector-media/` | 连接器下载的媒体文件 | 可重新下载，但耗时 |
| `data/tts-cache/` | TTS 语音缓存 | 可重建（缓存性质） |

#### 1.2.2 `.office-claw/` 内容明细

| 路径 | 内容 | 重要性 |
|------|------|--------|
| `office-claw-catalog.json` | 运行时 catalog（内置+用户自定义 agent） | **核心** — 用户新建的 agent 全在这里 |
| `installed-skills.json` | SkillHub 安装的 skill 注册表 | 重要 — skill 恢复的依据 |
| `skills/` | SkillHub 安装的 skill 文件本体 | 重要 — skill 内容 |
| `relayclaw/<catId>/.jiuwenclaw/` | jiuwenclaw sidecar 的 HOME 目录 | **核心** — 含 agent 记忆数据库 |
| `connector-owner.local.json` | 连接器 owner 映射 | 运行时状态 |
| `run/windows/runtime-state.json` | Windows 运行时状态 | 临时，可丢弃 |

> **jiuwenclaw 记忆存储位置**：sidecar 模式下 `HOME` 被设为 `.office-claw/relayclaw/<catId>/`（`relayclaw-sidecar.ts:149,181`），
> Python 端 `Path.home()` 解析到此处，因此 `memory.db` 实际路径为
> `$INSTDIR/.office-claw/relayclaw/<catId>/.jiuwenclaw/agent/memory/memory.db`。
> 该路径在 `.office-claw/` PRESERVE 范围内，**卸载选「否」时自动保留**。

### 1.3 MANAGED — 卸载选「否」/ 覆盖安装时全量替换

> 无论哪种升级路径（覆盖安装或卸载重装），MANAGED 路径都会被 CleanupManagedPayload 清除后重新释放。

> **注意**: 以下表格以 NSIS `CleanupManagedPayload` 宏实际行为为准（`installer.nsi:691-727`）。
> JS 常量 `WINDOWS_MANAGED_TOP_LEVEL_PATHS` 与 NSIS 存在差异，已标注。

**目录**（`CleanupManagedPayload` 执行 `rd /s /q`）：

| 路径 | 内容 | JS 常量一致性 |
|------|------|-------------|
| `packages/` | 应用代码（API + Web + Shared） | 一致 |
| `scripts/` | 启动/构建/安装脚本 | 一致 |
| `office-claw-skills/` | 内置技能（含 SkillHub 安装的 symlink） | 一致 |
| `tools/` | Node.js / Redis / Python runtime | 一致 |
| `vendor/` | 第三方依赖（jiuwenclaw 等） | 一致 |
| `installer-seed/` | 安装种子配置 | 一致 |
| `docs/` | 文档 | **仅 NSIS，JS 常量未声明** |

> JS 常量中声明但 NSIS 实际**不删除**的路径：`assets/`、`modelarts-preset.json`。
> 这是一个待修复的不一致，见 Open Questions。

**文件**（`CleanupManagedPayload` 逐个 `Delete`）：

| 文件 | 说明 |
|------|------|
| `.office-claw-release.json` | 版本元数据 |
| `.env.example` | 环境变量示例 |
| `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` | 包管理 |
| `office-claw-template.json` | 模板配置 |
| `biome.json` / `tsconfig.base.json` / `.npmrc` | 开发工具配置 |
| `LICENSE` / `README.md` / `SETUP.md` / `AGENTS.md` 等 `.md` | 文档 |

### 1.4 全局目录 `~/.office-claw/`（安装目录之外）

| 文件 | 内容 | 卸载「否」 | 卸载「是」 |
|------|------|-----------|-----------|
| `provider-profiles.json` | 提供商配置（公开部分） | 保留 | 删除 |
| `provider-profiles.secrets.local.json` | API key（0600 权限） | 保留 | 删除 |
| `acp-model-profiles.json` | ACP 模型配置 | 保留 | 删除 |
| `acp-model-profiles.secrets.local.json` | ACP 密钥 | 保留 | 删除 |
| `model.json` | **用户自定义模型配置**（自建 OpenAI 兼容源等） | 保留 | 删除 |
| `known-project-roots.json` | 已知项目根 | 保留 | 删除 |
| `migrated-project-roots.json` | 迁移记录 | 保留 | 删除 |

### 1.5 卸载流程全景（installer.nsi Section "Uninstall"）

```
1. 停止服务（CloseRunningServices）
   - Redis: redis-cli shutdown save（优雅持久化）
   - OfficeClaw.exe / jiuwenclaw.exe / node.exe: taskkill
2. 清除快捷方式和注册表
3. 弹窗询问: "是否同时删除所有用户数据？"
4a. 选「是」→ rd /s /q $INSTDIR + rd /s /q ~/.office-claw
4b. 选「否」→ CleanupManagedPayload（只删 MANAGED）+ RMDir $INSTDIR（空才删）
```

### 1.6 重装恢复流程（installer.nsi Section "Install"）

```
1. CleanupManagedPayload — 清理旧版 MANAGED 目录/文件
2. 解压新 payload（tar.gz → $INSTDIR）
3. 确保 data/ logs/ .office-claw/ 目录存在
4. .env — 不存在时从 .env.example 复制
5. office-claw-config.json — 不存在时从 seed 复制
6. 检查 WebView2 运行时
7. 检查 .office-claw/office-claw-catalog.json 是否存在
   ├─ 存在 → 跳过初始化（保留用户自定义 agent）
   └─ 不存在 → 执行 modelarts-preset apply
8. 注册表 + 快捷方式
```

### 1.7 数据分层设计决策

> PRESERVE 数据分两处存储：安装目录内放**项目级数据**（会话、日志、catalog、上传文件），
> 全局 `~/.office-claw/` 放**账号级数据**（API key、模型配置、provider profiles）。
> 这个分层语义清晰：安装目录 = 一个实例的运行时状态，全局目录 = 跨实例的身份凭据。

### 1.8 自动生成的配置文件（无需保护）

以下文件不在任何清单中，但**无需显式保护** — API 每次启动时自动从 `office-claw-config.json`（已 PRESERVE）重新生成：

| 路径 | 内容 | 生成位置 |
|------|------|---------|
| `.mcp.json` | Claude CLI MCP 配置 | `capabilities.ts:478` `generateCliConfigs()` |
| `.codex/config.toml` | Codex CLI 配置 | 同上 |
| `.gemini/settings.json` | Gemini CLI 配置 | 同上 |

---

## Part 2: 问题详情

### P1 (Critical): 后端数据目录落在 MANAGED 区域

API 启动脚本执行 `cd packages/api`，导致 `process.cwd()` = `$INSTDIR/packages/api/`。

代码中使用相对路径 `'./data/...'` 的数据目录全部解析到 `packages/api/data/`：

| 数据目录 | 代码位置 | 实际物理路径 | 区域 |
|---------|---------|-------------|------|
| audit-logs | `EventAuditLog.ts` | `packages/api/data/audit-logs/` | MANAGED ❌ |
| cli-raw-archive | `CliRawArchive.ts` | `packages/api/data/cli-raw-archive/` | MANAGED ❌ |
| tts-cache | `index.ts` | `packages/api/data/tts-cache/` | MANAGED ❌ |
| connector-media | `index.ts` | `packages/api/data/connector-media/` | MANAGED ❌ |
| logs/api | `logger.ts` | `packages/api/data/logs/api/` | MANAGED ❌ |
| uploads | `index.ts` | `packages/api/uploads/` | MANAGED ❌ |
| **transcripts** | `index.ts` | `$INSTDIR/data/transcripts/` | PRESERVE ✅ |

> transcripts 曾遇到同样的问题，通过 E7 fix 修复（`findMonorepoRoot()` 模式）。其余目录未同步修复。

**影响**：`packages/` 是 MANAGED 目录，NSIS `CleanupManagedPayload` 执行 `rd /s /q packages`，上述所有数据在升级时被删除。

### P1.5 (Low): relayclaw sidecar 的 fallback 路径

`relayclaw-sidecar.ts:149` 和 `RelayClawAgentService.ts:224` 的**默认值**仍用 `process.cwd()`。
主链路传了显式 `homeDir` 所以不会命中 fallback，属于防御性修复。

### P2: workspace/ 未显式保护

`$INSTDIR/workspace/` 是线程默认工作目录（`ThreadStore.ts:278`），不在 PRESERVE 也不在 MANAGED。当前靠"不在删除列表中"隐式存活，缺少显式保护声明。

### P3: 卸载弹窗文案不准确

弹窗提到删除 `.office-claw、data、logs、.env`，但实际选「是」删除整个 `$INSTDIR`，选「否」保留的范围也未完整列出。

---

## Part 3: 修复方案与实现

### Fix 1: 后端数据目录统一到 `$INSTDIR/data/`（已实现）

**策略**：跟随 transcripts 的 E7 fix 模式，所有数据目录通过 `resolve(findMonorepoRoot(), envValue ?? 'data/xxx')` 归一化。`path.resolve` 天然处理绝对路径（透传）和相对路径（基于 monorepo root 解析）。

**改动文件**：

| 文件 | 改动 |
|------|------|
| `index.ts` | uploadDir / connectorMediaDir / ttsCacheDir 统一 resolve 模式；uploadDir 传递给 preview/messages/invocations 三条路由 |
| `preview.ts` | 新增 uploadDir 选项，接收外部传入而非自行 resolve |
| `EventAuditLog.ts` | AUDIT_LOG_DIR 归一化 |
| `CliRawArchive.ts` | CLI_RAW_ARCHIVE_DIR 归一化 |
| `image-paths.ts` | UPLOAD_DIR 归一化 |
| `ConnectorRuntimeManager.ts` | mediaDir + buildMediaPathResolver 内 uploadDir / ttsCacheDir 归一化 |
| `logger.ts` | 日志目录 → `resolve(monorepoRoot, 'data/logs/api')` |
| `config.ts` | env-summary 路径展示 |
| `env-registry.ts` | UPLOAD_DIR defaultValue 描述更新 |

**防御性改动**：`relayclaw-sidecar.ts` 和 `RelayClawAgentService.ts` 的 fallback 默认值改为 `join(findMonorepoRoot(), '.office-claw', 'relayclaw', catId)`。

> HTTP 路径 `/uploads/xxx.png` 不变 — fastify-static 映射的物理目录变了，对前端和 catalog 透明。

### ~~Fix 2: 旧数据迁移~~ (首版本不做)

> **首版本不实现。** NSIS 安装流程中 `CleanupManagedPayload`（`installer.nsi:787`）在解压新 payload 之前
> 执行 `rd /s /q packages`，旧数据在 NSIS 层面已被删除，Node.js 迁移代码来不及运行。
>
> **已有用户升级到首版本时，`packages/api/data/` 和 `packages/api/uploads/` 中的旧数据会丢失。**
> 这是已知的一次性代价。Fix 1 确保升级后新产生的数据落在正确位置，后续升级不再受影响。
>
> **Future**: 如果需要零丢失升级，需在 NSIS 层（`CleanupManagedPayload` 之前）增加预迁移步骤，
> 将 `packages\api\data\` 和 `packages\api\uploads\` 移到 `$INSTDIR\data\`。这是 NSIS 脚本改动，
> 复杂度中等，可作为后续版本的增强。

### Fix 3: 删除 symlink 恢复逻辑（已实现）

移除初版实现的 `recoverMissingSymlinks()`。

**原因**：SkillHub skill 在 Windows 安装版中通过 MCP 工具链访问（`office_claw_list_skills` → `office_claw_load_skill`），不依赖 CLI symlink。

**改动**：
- 删除 `SkillInstallManager.ts` 中的 `recoverMissingSymlinks()` 函数
- 删除 `packages/api/test/skillhub-symlink-recovery.test.ts`
- 更新 `windows-offline-installer.test.js` 为反向断言

### Fix 4: workspace/ 显式 PRESERVE（已实现）

`WINDOWS_PRESERVE_PATHS` 加入 `'workspace'`。

### Fix 5: 卸载弹窗文案（已实现）

更新为准确反映实际行为：选「否」保留 `.env、office-claw-config.json、.office-claw、data、logs、workspace`。

---

## Acceptance Criteria

- [x] AC-1: 所有后端数据目录物理路径在 `$INSTDIR/data/` 下
- [x] AC-2: `workspace/` 加入 PRESERVE 元数据声明
- [x] AC-3: 卸载弹窗文案准确反映实际保留/删除范围
- [x] AC-4: 删除 symlink 恢复逻辑
- [ ] AC-5: Windows 真机端到端验证（需手动执行）

## 真机验证 SOP

### 前置：构建安装包

```bash
pnpm build && node scripts/build-windows-installer.mjs --bundle-only
```

### 验证要点

**Step 1: 安装并制造测试数据**

| 操作 | 预期物理路径 |
|------|-------------|
| 上传自定义 agent 头像 | `$INSTDIR\data\uploads\screenshot-*.png` |
| 发送消息 | `$INSTDIR\data\audit-logs\*.ndjson` |
| 在默认 workspace 创建文件 | `$INSTDIR\workspace\my-test.txt` |
| 在 `.env` 加注释 `# UPGRADE_TEST=1` | `$INSTDIR\.env` |

```powershell
$inst = "$env:LOCALAPPDATA\Programs\OfficeClaw"
# 数据落在正确位置
Test-Path "$inst\data\uploads"              # True
Test-Path "$inst\packages\api\data"         # False
```

**Step 2: 覆盖安装 → 验证数据存活**

```powershell
# PRESERVE 数据存活
Test-Path "$inst\.env"                      # True
Test-Path "$inst\data\uploads"              # True
Test-Path "$inst\workspace\my-test.txt"     # True
Test-Path "$inst\packages"                  # False (MANAGED, 已删)
```

**Step 3: 卸载选「是」→ 完全清除**

```powershell
Test-Path "$env:LOCALAPPDATA\Programs\OfficeClaw"  # False
Test-Path "$env:USERPROFILE\.office-claw"            # False
```

---

## 补充调查记录

### `.office-claw/relayclaw/<catId>/scope-<hash>/` 结构

scope 目录是 relayclaw sidecar 按**认证上下文**（API base + API key + model name）隔离的 HOME 目录。
- 创建：`RelayClawAgentService.ts:222` — hash = `sha256(apiBase|apiKey|modelName).slice(0,12)`
- 用途：`relayclaw-sidecar.ts:181` — 设为 jiuwenclaw 的 `HOME` 环境变量
- 内容：`$HOME/.jiuwenclaw/agent/memory/memory.db`、session 日志、config 等
- 位于 `.office-claw/` PRESERVE 范围内，升级安全

### SkillHub skill 注入链路

jiuwenclaw **不直接读** `.office-claw/skills/`。链路：
1. sidecar 启动时收到 `JIUWENCLAW_SHARED_SKILLS_DIRS=office-claw-skills/`（官方内置 skill）
2. SkillHub 安装的 skill 通过 MCP 工具访问：`office_claw_list_skills` → `office_claw_load_skill`
3. `SkillCatalogService.ts` 扫描 `office-claw-skills/` + `.office-claw/skills/` 两个目录合并返回
4. symlink 是给 CLI 直接读取用的，Windows 安装版不依赖

## Risk

- HTTP 路径 `/uploads/xxx.png` 不变，catalog 中存储的 avatar 引用不受影响
- `findMonorepoRoot()` 已在 transcripts 场景验证过，模式成熟
- 首版本升级已知丢失旧版 `packages/api/data/` 数据（见 Fix 2 说明）

## Open Questions

1. Redis RDB dump 文件物理位置确认
2. `WINDOWS_MANAGED_TOP_LEVEL_PATHS` 与 NSIS `CleanupManagedPayload` 不一致的统一方向
