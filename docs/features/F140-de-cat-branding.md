---
feature_ids: [F140]
related_features: []
topics: [branding, de-cat, office-claw, user-facing, config, env-vars, mcp]
doc_kind: spec
created: 2026-04-10
---

# F140: Branding Cleanup — 去除用户可见的历史品牌痕迹

> **Status**: in-progress | **Owner**: Claude | **Priority**: P1

## Why

产品已从内部代号统一到 **OfficeClaw**。最终用户不应在 UI、安装目录配置文件、环境变量中看到任何 `office-claw` / 历史旧品牌 / 旧主题化术语等内容。功能不变，只改用户感知层。

## 目标

在保证功能不变的前提下，最终用户在以下三个维度看不到 `office-claw` 相关内容：

1. **UI**（Web 前端文案、PWA manifest、push 通知、toast 提示）
2. **安装目录配置文件**（`capabilities.json`、MCP server 注册名、`source` 字段）
3. **环境变量**（`CAT_CAFE_*` 前缀）

---

## 术语对照表

| 旧术语 | → 系统内部（LLM-facing） | → 前端 UI（用户-facing） |
|--------|--------------------------|------------------------|
| 智能体 / 猫 | agent | 智能体 |
| 用户 / CVO | 用户 | 用户 |
| 配额 | — | 配额 |
| 🐾 / 🐱 | 删除 | 删除 |
| ᓚᘏᗢ | — | 删除或换通用图标 |
| Claude | 办公智能体 | 办公智能体（小九） |
| Codex | 通用智能体 | 通用智能体（小理） |
| Gemini | 编码智能体 | 编码智能体（小码） |
| office-claw (source) | builtin | — |
| CAT_CAFE_* (env) | OFFICE_CLAW_* | — |
| office-claw-collab (MCP) | office-claw-collab | — |

---

## 已完成工作

以下 Phase 已在 main 上合入（来自迁移前仓库 commit）。

### Phase A — 系统提示词 + 后端文案（✅ 已完成）

> Commit: `e2a7a440` feat(de-cat): remove cat-themed terminology from user-facing text, prompts, and notifications
> 27 files, 181 insertions, 208 deletions

覆盖范围：
- **SystemPromptBuilder.ts** — 身份注入、队友名册、治理摘要、MCP 工具文档、调用上下文、语音模式中所有猫主题文案
- **ContextAssembler.ts** — `用户` → `用户`（消息历史发送者标签）
- **governance-pack.ts** — sentinel 标记 `CAT-CAFE-GOVERNANCE` → `CLOWDER-GOVERNANCE`，治理规则文案
- **Connector 出站** — `ConnectorMessageFormatter`、`OutboundDeliveryHook`、`StreamingOutboundHook`、飞书/钉钉/Telegram adapter 中 🐱 emoji 前缀
- **通知模板** — 信号日报 `🐱 OfficeClaw` 前缀、push 测试推送 `智能体测试推送`
- **错误/提示文案** — `messages.ts`（智能体正在忙/出错了）、`threads.ts`（智能体正在工作中）
- **env-registry.ts** — 描述文案中的猫品种名（`Claude prompt 上限` → `Claude prompt 上限`）
- **成就系统** — `achievement-defs.ts`、`silly-stats.ts` 中猫主题成就名
- **Bootcamp** — `bootcamp-blocks.ts` 选猫文案
- **播客生成器** — `podcast-generator.ts` 说话人身份
- **CAT_CONFIGS 默认值** — `cat.ts` 中 displayName/nickname/roleDescription 对齐 office-claw-config.json
- **其他** — ReviewRouter、GithubReviewMailParser、scheduler reminder

### Phase A-ext — ACP Runtime Skill Hint（✅ 已完成）

> Commit: `89bd4ae2` feat(de-cat): remove stale skill mappings from ACP runtime hint
> `invoke-single-cat.ts` L942-944 清理已删除 skill 引用

### Phase M — MCP Tool Name 重命名（✅ 已完成）

> Commits: `0efb5969` + `2294034a` + `30c89385`
> 42 files, ~205 处改动

覆盖范围：
- **35 个 tool name** `cat_cafe_*` → `office_claw_*`（8 个 tool 定义文件）
- **COMPACT_DESCRIPTIONS** key 全量替换
- **System prompt** 中 tool name 引用（`SystemPromptBuilder`、`SessionBootstrap`、`invoke-single-cat`、`SqliteEvidenceStore`）
- **Skill 文档** 中 tool name 引用（`rich-messaging`、`collaborative-thinking`、`shared-rules`、`cicd-tracking`、`rich-blocks`）
- **测试文件** 同步更新（12 个测试文件）

### Skills 裁剪（✅ 已完成，关联工作）

> Commit: `b98147d7` refactor(skills): remove office-claw synced skills
> 40 files, 删除 20 个 office-claw-specific skills，保留 4 个核心协作 skill 并去猫化

---

## 待完成工作

> 以下清单经 Claude + Codex 双审（2026-04-10），基于全仓 grep 实扫补齐。
> 非测试前端源码命中 129 处 / 52 文件；后端用户可见残留 ~20 处；skill refs 117 处 / 13 文件。

### Phase A-fix — 后端漏网的用户可见文案

Phase A 遗漏的、会直接暴露给用户的后端残留。与 Phase B 一起做，改动量小。

| # | 文件 | 当前 | → 改为 | 用户何时看到 |
|---|------|------|--------|------------|
| A-f1 | `ClaudeAgentService.ts:357` | `Claude CLI 响应超时` | `Claude CLI 响应超时` | agent 超时 error toast |
| A-f2 | `CodexAgentService.ts:427` | `Codex CLI 响应超时` | `Codex CLI 响应超时` | 同上 |
| A-f3 | `GeminiAgentService.ts:157` | `Gemini CLI 响应超时` | `Gemini CLI 响应超时` | 同上 |
| A-f4 | `GeminiAgentService.ts:335` | `Gemini已在 Antigravity 中开始工作` | `Gemini 已在 Antigravity 中开始工作` | 对话消息 |
| A-f5 | `queue.ts:357` | `该猫当前未在执行` | `该智能体当前未在执行` | 停止执行 error |
| A-f6 | `callback-errors.ts:4` | hint 含 `@猫名` | `@智能体名` | 401 expired credentials |
| A-f7 | `McpPromptInjector.ts:63` | `@猫名`（注入 LLM prompt） | `@智能体名` | LLM 引用后暴露给用户 |
| A-f8 | `quota.ts:310-463` | 12 处 `Claude (Claude)` / `Codex (Codex)` / `Gemini (Antigravity)` | 用 displayName 或 provider 名 | Hub 配额面板 |
| A-f9 | `SystemPromptBuilder.ts:196,218,222` | `office-claw-skills/refs/` 路径硬编码 | 去掉 `office-claw-skills/` 前缀或用相对引用 | LLM 引用后暴露给用户 |

#### A-fix-gov. Governance 治理块适配

**Sentinel 标记改名**：`CLOWDER-GOVERNANCE` → `OFFICE-CLAW-GOVERNANCE`

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| A-g1 | `governance-pack.ts:15` | `'<!-- CLOWDER-GOVERNANCE-START -->'` | `'<!-- OFFICE-CLAW-GOVERNANCE-START -->'` |
| A-g2 | `governance-pack.ts:16` | `'<!-- CLOWDER-GOVERNANCE-END -->'` | `'<!-- OFFICE-CLAW-GOVERNANCE-END -->'` |
| A-g3 | `governance-pack.ts:19-20` | `LEGACY: CAT-CAFE-GOVERNANCE-*` | 增加 `CLOWDER-GOVERNANCE-*` 也作为 legacy（三代兼容） |

**Legacy 兼容**：`governance-bootstrap.ts:138-142` 当前只兜底 1 套 legacy（`CAT-CAFE-GOVERNANCE`），改名后需支持 2 套 legacy 链：`CAT-CAFE-GOVERNANCE` → `CLOWDER-GOVERNANCE` → `OFFICE-CLAW-GOVERNANCE`（当前标记）。确保已有项目文件中的旧标记在下次 sync 时自动升级。

**治理正文残留**：`governance-pack.ts` HARD_CONSTRAINTS 中仍有 `office-claw-skills` 路径引用：

| # | 行 | 当前 | → 改为 |
|---|---|------|--------|
| A-g4 | 34 | `Skills are available via symlinked office-claw-skills/` | `via symlinked skills directory` |
| A-g5 | 35 | `See office-claw-skills/refs/shared-rules.md for full collaboration contract` | `See refs/shared-rules.md` |

**测试同步**：`governance-pack.test.js`、`governance-bootstrap.test.js`、`governance-integration.test.js`、`governance-confirm.test.js` 通过 import 常量引用，改常量值即自动跟随，但 `governance-pack.test.js:81` 硬编码了 version 断言（`1.3.0`），改 sentinel 后需升版。

---

### Phase B — 前端 UI 文案（全量清单）

> 方法论：以 `grep -rn '智能体\|配额\|用户\|Claude\|Codex\|Gemini\|DARE\|ᓚᘏᗢ\|Cat Café' packages/web/src/ --include='*.ts' --include='*.tsx' | grep -v __tests__ | grep -v .test.` 为基线。
> 前端用户可见文案：`智能体` → `智能体`，`用户` → `用户`，`配额` → `配额`，品种名 → displayName。

#### B1. 核心交互区

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| F01 | `ThreadCatStatus.tsx:48` | `智能体 @ 了你` | `智能体 @ 了你` |
| F02 | `ThreadCatStatus.tsx:43` + `SplitPaneCell.tsx:68` | `ᓚᘏᗢ` ASCII 猫脸 | 删除或换通用 icon |
| F03 | `PushSettingsPanel.tsx:99` | `智能体回复...推送到系统通知栏` | `智能体回复...` |
| F04 | `PushSettingsPanel.tsx:200` | `智能体消息会推送` / `点击开启接收智能体推送` | → 智能体 |
| F05 | `ChatInput.tsx:1023` | `请至少选一只智能体` | `请至少选一个智能体` |
| F06 | `ChatInputActionButton.tsx:193,203` | `智能体忙完后处理` / `中断当前智能体` | → 智能体 |
| F07 | `ParallelStatusBar.tsx:122` | `停止所有智能体` | `停止所有智能体` |
| F08 | `ChatInputMenus.tsx:202` | `↓ 还有更多智能体` | `↓ 还有更多智能体` |
| F09 | `BindNewSessionSection.tsx:87` | `选择智能体...` | `选择智能体...` |
| F10 | `VoteConfigModal.tsx:164` | `投票智能体` | `投票智能体` |
| F11 | `RightStatusPanel.tsx:179,417,500` | `智能体状态` / `智能体消息` / `智能体互相看不到/分享心里话` | → 智能体 |
| F12 | `MobileStatusSheet.tsx:85,141` | `智能体状态` / `智能体消息` | → 智能体 |
| F13 | `EvidencePanel.tsx:46` | `暂未找到相关证据` | `暂未找到相关证据` |
| F14 | `ChatEmptyState.tsx:117` | `第一次来？开始智能体训练营` | `第一次来？开始新手引导` |
| F15 | `BootcampListModal.tsx:106,174` + `ThreadSidebar.tsx:307` | `🎓 智能体训练营` | `🎓 新手训练营` |
| F16 | `BootcampIcon.tsx:5` | `<title>智能体训练营</title>` | `<title>新手训练营</title>` |
| F17 | `useAuthorization.ts:25` | `🔐 智能体需要权限` | `🔐 智能体需要权限` |
| F18 | `chatStore.ts:249` | fallback `智能体` | fallback `智能体` |
| F19 | `SuggestionDrawer.tsx:102` | `等待用户决策` | `等待用户决策` |
| F20 | `DirectoryPickerModal.tsx:282` | `收起智能体` / `选智能体` | `收起列表` / `选智能体` |
| F21 | `CatSelector.tsx:39` | `默认智能体 (可选)` | `默认智能体 (可选)` |
| F22 | `ThreadCatSettings.tsx:83` | `设置默认智能体` | `设置默认智能体` |
| F23 | `PlanBoardPanel.tsx:202` | `智能体祟祟` | `任务看板` |
| F24 | `QueuePanel.tsx:258` | fallback `智能体` (2 处) | `智能体` |
| F25 | `IdeateHeader.tsx:14` | `智能体们各自独立思考中...` | `智能体们各自独立思考中...` |

#### B2. Hub 设置面板

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| F26 | `HubRoutingPolicyTab.tsx:103,105` | `配额约束` / `智能体自治路由` / `配额` | → 配额 / 智能体 |
| F27 | `HubEnvFilesTab.tsx:179` | `智能体模板（只读 seed）` | `智能体模板（只读 seed）` |
| F28 | `HubEnvFilesTab.tsx:191-193` | `Claude/Codex/Gemini项目指引` | `办公智能体/通用智能体/编码智能体项目指引` |
| F29 | `HubGovernanceTab.tsx:119` | `智能体首次被派遣到外部项目时` | `智能体首次被派遣到外部项目时` |
| F30 | `HubClaudeRescueSection.tsx` | 8 处 `Claude救援`/`救活 N 只Claude` | `Claude 救援` / `救活 N 个 Claude session` |
| F31 | `office-claw-hub.navigation.tsx:59` | `Claude救援` | `Claude 救援` |
| F32 | `hub-cat-editor.sections.tsx:89` | `用户给的昵称` | `用户自定义昵称` |
| F33 | `hub-cat-editor.sections.tsx:533` | placeholder `@codex, @Codex` | `@codex, @assistant` |
| F34 | `HubLeaderboardTab.tsx` | `CVO 能力等级 🐾` / `夜猫子` | 去 🐾 / `夜间活跃` |
| F35 | `HubQuotaBoardTab.tsx:210` | `配额看板` | `配额看板` |
| F36 | `config-viewer-tabs.tsx:74` | `A2A 智能体互调` | `A2A 智能体协作` |

#### B3. 品种名硬编码（必须改为动态读取或 displayName）

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| F37 | `AuthorizationCard.tsx:7-10` | `Claude/Codex/Gemini/DARE` 硬编码映射 | `办公智能体/通用智能体/编码智能体/确定性智能体` |
| F38 | `DailyUsageSection.tsx:35-43,92` | `Claude Opus` / `Codex Codex` / `Gemini Gemini` / `配额消耗` | 用 displayName，`配额消耗` |
| F39 | `MessageNavigator.tsx:26-29` | `Claude/Codex/Gemini/DARE` label | 用 displayName |
| F40 | `quota-cards.tsx:80-82,144` | `Codex Codex + GPT-5.2` / `Codex Spark` / `切到Codex` | 用 displayName |
| F41 | `leaderboard-phase-bc.tsx:41` | `智能体杀 胜场` | `游戏 胜场` |

#### B4. 游戏 + 语音 + 命令

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| F42 | `GameLobby.tsx:124,164,191` | `选择参赛智能体` / `绑定智能体` / `选一只智能体` | → 智能体 |
| F43 | `EventFlow.tsx:116` | 人类玩家显示 `用户` | `用户` |
| F44 | `useVoiceInput.ts:11-12` | 语音纠错上下文含品种名 + `用户` | 用 displayName + `用户` |
| F45 | `SuggestionOpenForm.tsx:59` | `建议领取智能体` | `建议领取智能体` |
| F46 | `SuggestionDecisionPanel.tsx:34` | `建议智能体` | `建议智能体` |

#### B5. Service Worker + 命令 + Socket + Mention

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| F47 | `worker/index.ts:32,49` | `智能体来信` (2 处) | `消息通知` |
| F48 | `useChatCommands.ts:84,93` | `智能体配置` / `A2A 智能体互调` | `智能体配置` / `A2A 智能体协作` |
| F49 | `useSocket-background-system-info.ts:297` | `proposedBy ?? '智能体'` | `?? '智能体'` |
| F50 | `mention-highlight.ts:65,67` | `CO_CREATOR_DISPLAY_NAME = '用户'` + `@用户` pattern | `'用户'` + `@用户` |

#### B6. PWA Manifest

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| F51 | `manifest.json:3-5` | `"Cat Café"` / `"智能体"` / `"三只 AI 智能体的协作空间"` | `"OfficeClaw"` / `"OfficeClaw"` / `"AI team collaboration space"` |

#### B7. Logo / Icon

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| F52 | `CatCafeLogo.tsx` | gradient ID `office-claw-gradient`，注释 `三猫流光渐变` | `brand-gradient`，更新注释 |

#### B8. Showcase 页面（P2，历史演示数据）

`app/showcase/f11-review/page.tsx` 和 `app/showcase/f052-*/page.tsx` 含大量猫品种名和 `用户`。
这些是历史 demo fixture，不影响正式功能。**建议与主改动分开**，低优处理。

#### B9. 测试文件（随主代码同步改，~20 文件）

组件测试中 fixture 的猫名/猫文案需随 B1-B7 同步更新。

---

### Phase S — Skill 文档去猫化

> 用户可见点：skill 加载后注入 LLM prompt，LLM 会引用；Skill 详情面板展示 BOOTSTRAP.md 内容。

| # | 文件 | 命中数 | 改动 |
|---|------|--------|------|
| S1 | `BOOTSTRAP.md` | ~12 处 | `Cat Café Skills` → `OfficeClaw Skills`，去 `用户`/`三猫`/`智能体` |
| S2 | `refs/shared-rules.md` | ~50 处 | 全面去猫化（`猫`→`agent`，`用户`→`用户`，品种名→displayName） |
| S3 | `refs/mcp-callbacks.md` | ~32 处 | `$CAT_CAFE_*` → `$OFFICE_CLAW_*`，`猫`→`agent` |
| S4 | `refs/pr-template.md` | ~10 处 | 去品种名和猫主题签名 |
| S5 | `refs/review-request-template.md` | ~5 处 | 同上 |
| S6 | 其余 8 个 refs 文件 | ~8 处 | 零散替换 |

---

### Phase M-2 — MCP Server 注册名重命名

> 前置：Phase M ✅

将 MCP server 注册名从 `office-claw-*` 改为 `office-claw-*`，影响 capability 配置。

**用户可见点**：安装目录的 `capabilities.json` 配置文件中 server name 可见。

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| 1 | `mcp-server/src/collab.ts` | `createBaseServer('office-claw-collab-mcp')` | `'office-claw-collab-mcp'` |
| 2 | `mcp-server/src/memory.ts` | `createBaseServer('office-claw-memory-mcp')` | `'office-claw-memory-mcp'` |
| 3 | `mcp-server/src/signals.ts` | `createBaseServer('office-claw-signals-mcp')` | `'office-claw-signals-mcp'` |
| 4 | `capability-orchestrator.ts` | `CAT_CAFE_SPLIT_SERVER_IDS` 常量 + 3 个 `name: 'office-claw-*'` | 改为 `office-claw-*` |
| 5 | `routes/capabilities.ts:359-361` | server description `三猫协作工具` 等 | 更新描述 |
| 6 | `DareAgentService.ts:81` | `office-claw-dare-mcp` 临时文件名 | `office-claw-dare-mcp` |
| 7 | 日志标签 | `[office-claw-collab]` 等 console.error | `[office-claw-collab]` |

**迁移策略**：capability-orchestrator 读取旧 `office-claw-*` 名称时自动迁移到新名称，避免用户升级后 capabilities.json 失效。

**测试**：`capability-orchestrator.test.js`、`mcp-config-adapters.test.js`、`capabilities-route.test.js`

---

### Phase M-3 — Source 类型标识重命名

> 前置：Phase M-2

将 `source: 'office-claw'` 改为 `source: 'builtin'`。

**用户可见点**：`capabilities.json` 中 `source` 字段；前端 Skill 详情面板。

| # | 文件 | 改动 |
|---|------|------|
| 1 | `shared/types/capability.ts` | 类型定义 `'office-claw' \| 'external'` → `'builtin' \| 'external'` |
| 2 | `capability-orchestrator.ts` | 4 处 `source: 'office-claw'` |
| 3 | `routes/skills.ts` | 2 处（类型 + 赋值） |
| 4 | `web/SkillDetailView.tsx` | 类型引用 |
| 5 | `web/capability-board-ui.tsx` | 类型引用 |
| 6 | 测试文件 | ~20 处 |

**迁移策略**：读取 capabilities.json 时兼容旧 `source: 'office-claw'`，自动映射为 `'builtin'`。

---

### Phase M-4 — 环境变量前缀重命名

> 前置：Phase M-3

将 `CAT_CAFE_*` 环境变量改为 `OFFICE_CLAW_*`。

**用户可见点**：用户在 `.env` 文件和 Hub 设置面板中直接看到变量名。

已知变量清单（`env-registry.ts`，共 14 个）：

| 旧名 | → 新名 |
|------|--------|
| `CAT_CAFE_USER_ID` | `OFFICE_CLAW_USER_ID` |
| `CAT_CAFE_HOOK_TOKEN` | `OFFICE_CLAW_HOOK_TOKEN` |
| `CAT_CAFE_MCP_SERVER_PATH` | `OFFICE_CLAW_MCP_SERVER_PATH` |
| `CAT_CAFE_TMUX_AGENT` | `OFFICE_CLAW_TMUX_AGENT` |
| `CAT_CAFE_TMUX_PATH` | `OFFICE_CLAW_TMUX_PATH` |
| `CAT_CAFE_DATA_DIR` | `OFFICE_CLAW_DATA_DIR` |
| `CAT_CAFE_CALLBACK_TOKEN` | `OFFICE_CLAW_CALLBACK_TOKEN` |
| `CAT_CAFE_CALLBACK_OUTBOX_ENABLED` | `OFFICE_CLAW_CALLBACK_OUTBOX_ENABLED` |
| `CAT_CAFE_CALLBACK_OUTBOX_DIR` | `OFFICE_CLAW_CALLBACK_OUTBOX_DIR` |
| `CAT_CAFE_CALLBACK_OUTBOX_MAX_ATTEMPTS` | `OFFICE_CLAW_CALLBACK_OUTBOX_MAX_ATTEMPTS` |
| `CAT_CAFE_CALLBACK_OUTBOX_MAX_FLUSH_BATCH` | `OFFICE_CLAW_CALLBACK_OUTBOX_MAX_FLUSH_BATCH` |
| `CAT_CAFE_CALLBACK_RETRY_DELAYS_MS` | `OFFICE_CLAW_CALLBACK_RETRY_DELAYS_MS` |
| `CAT_CAFE_SIGNAL_USER` | `OFFICE_CLAW_SIGNAL_USER` |
| `CAT_CAFE_SKIP_AUTH` | `OFFICE_CLAW_SKIP_AUTH` |

**迁移策略**：代码层双读（新名优先，旧名 fallback + deprecation warning），给用户升级缓冲期。

**注意**：`McpPromptInjector.ts` 和 `mcp-callbacks.md` 中也硬编码了 `$CAT_CAFE_*` 指引，需同步。

---

### Phase M-5 — 文件路径重命名

> 前置：Phase M-4
> 迁移策略：**Clean Break（首版本，无运行时兼容）**
> 决策日期：2026-04-11

将用户可见的文件路径中的 `office-claw` 改为 `office-claw`。

#### 迁移策略决策

本版本为首版本发布，不需要运行时自动迁移逻辑。旧路径不工作是预期行为。

**不做**：启动时自动检测旧目录 → move → symlink 兼容层。
**要做**：在当前版本文档中直接声明不提供历史迁移兼容层。

#### M-5 Scope（in scope）

| 子项 | 类别 | 当前 | → 改为 | 风险 |
|------|------|------|--------|------|
| M-5a | Skills 目录 | `office-claw-skills/` | `office-claw-skills/` | 中 — git mv + ~50 文件引用 |
| M-5b | 用户数据目录 | `~/.office-claw/` / `.office-claw/` | `~/.office-claw/` / `.office-claw/` | 中 — 全链路路径替换（首版本无兼容需求） |
| M-5c | 配置文件名 | `office-claw-config.json` / `office-claw-template.json` / `office-claw-catalog.json` | `office-claw-config.json` / `office-claw-template.json` / `office-claw-catalog.json` | 低 — config loader 直接改 |
| M-5c | DARE 配置 | `.dare/config.json` 内 `"office-claw-skills"` | `"office-claw-skills"` | 低 — 静态替换 |
| M-5b | 前端路径展示 | `HubProviderProfilesTab.tsx` 显示 `.office-claw/...` | `.office-claw/...` | 低 |
| M-5b | API 路径回传 | `config.ts:244` 返回 `.office-claw/redis-dev-sandbox` | `.office-claw/...` | 低 |
| M-5b | 启动脚本 | `start-macos.sh:43` 默认 `~/.office-claw` | `~/.office-claw` | 低 |
| M-5b | 安装器 | `build-windows-installer.mjs:33,37` | 更新路径 | 中 |
| M-5d | 清理脚本 | — | 不提供 | clean break |
| M-5d | 迁移 SOP | — | 不提供 | clean break |

#### M-5 Out of Scope（Tier 2 延期）

| 类别 | 当前 | 说明 |
|------|------|------|
| Package scope | `@office-claw/web`、`@office-claw/shared` 等 | npm workspace，~423 处非测试引用，用户不可见，收益为零 |
| API 路由 | `/api/cats/*` | 前端全链路依赖，改了破坏所有消费者 |
| 内部变量名 | `catId`/`catConfig`/`CAT_CONFIGS` | 纯代码层，改了极易回归 |
| 运行时自动迁移 | — | 首版本不需要，不提供兼容层 |
| ADR 决策文档内容 | ADR-009 等 | 历史文档保持原样 |

#### M-5 附录：Skills 目录改名影响面

改名 `office-claw-skills/` → `office-claw-skills/` 涉及的运行时代码引用：

| 优先级 | 文件 | 硬编码 | 用途 |
|--------|------|--------|------|
| P0 | `governance-bootstrap.ts` | `resolve(this.catCafeRoot, 'office-claw-skills')` | 新工作区 symlink 源路径 |
| P0 | `relayclaw-skills.ts` | `join('office-claw-skills', 'manifest.yaml')` | 动态定位 skills 目录 |
| P0 | `SkillInstallManager.ts` | `resolve(catCafeRoot, 'office-claw-skills')` | SkillHub 远程安装目标 |
| P0 | `skills.ts` | `resolve(..., 'office-claw-skills')` | Skills 目录解析 |
| P1 | `SkillCatalogService.ts` | `join(hostRoot, 'office-claw-skills')` | Skill 发现和列表 |
| P1 | `capabilities.ts` | `basename(parentDir) === 'office-claw-skills'` | 多项目 skill 扫描校验 |
| P1 | `callback-docs-routes.ts` | `'office-claw-skills', 'refs'` | refs/ 文档路径 |
| P1 | `DareAgentService.ts` | `join(projectRoot, 'office-claw-skills')` | DARE agent skill 路径 |
| P1 | `scripts/setup.sh` / `install.sh` | `$PROJECT_DIR/office-claw-skills` | 安装时 symlink 创建 |
| P2 | `.dare/config.json` | `"skill_paths": ["office-claw-skills"]` | DARE 配置 |
| P2 | `manifest.yaml` | trigger pattern `"office-claw-skills/"` | Manifest 触发器 |
| P2 | 12+ test files | 临时 `office-claw-skills/` 目录 | 测试 |
| P2 | 20+ doc files | 文档引用 | 文档 |

---

### Phase C — 运行时数据清理（部署时执行）

非代码改动，在部署机器上手动执行。

| # | 内容 | 说明 |
|---|------|------|
| C1 | `RelayClawAgentService.ts` channelId fallback `'catcafe'` → `'clowder'` | 新 session 目录前缀 |
| C2 | jiuwenclaw 记忆文件清理 | `~/.jiuwenclaw/agent/memory/` 中旧记忆含 "OfficeClaw" |
| C3 | Redis 历史会话数据（可选） | 旧消息中的猫主题内容，自然过期即可 |

---

### Phase F — 非办公功能封堵（Tier 1.5，方案 B+）

> 前置：无（可与 Tier 1 并行或在 Tier 1 之后）
> 策略：不删底层代码（~150 文件死代码保留），只封堵所有用户和 agent 可达入口。
> 决策日期：2026-04-13

#### F-0. 去除目标（8 个功能）

| 功能 | Feature | 去除理由 |
|------|---------|---------|
| Game/狼人杀 | F101/F107/F119 | 纯娱乐 |
| Mission Hub / External Projects | F076 | office-claw 特色项目管理 |
| Showcase | — | 内部 demo 展示页 |
| Leaderboard | F075 | 纯 gamification |
| Voting | F079 | 主要用于趣味投票和游戏 |
| Bootcamp | F087 | office 用户无需训练营 |
| Signals | F021/F091 | AI 信源阅读器，非办公功能 |
| Knowledge Feed | — | 已不存在于 relay-claw，无需处理 |

#### F-1. Slash Commands 裁剪：26 → 4

仅保留 IM 场景刚需命令：`/where`、`/new`、`/threads`、`/use`。
其余命令的功能均可通过 Hub UI 或自然语言与 agent 对话替代。

| # | 文件 | 改动 |
|---|------|------|
| F-1a | `packages/web/src/config/command-registry.ts` | COMMANDS 数组只保留 4 个连接器命令 |
| F-1b | `packages/web/src/hooks/useChatCommands.ts` | 删除已移除命令的 handler 分支 |
| F-1c | `packages/web/src/components/chat-input-options.ts` | 移除 GAME_LIST、WEREWOLF_MODES、detectMenuTrigger 中 game 分支 |
| F-1d | `packages/web/src/components/ChatInputMenus.tsx` | 移除 game menu 渲染逻辑 |

#### F-2. Hub 导航 Tab 裁剪：移除 leaderboard

| # | 文件 | 改动 |
|---|------|------|
| F-2a | `packages/web/src/components/office-claw-hub.navigation.tsx` | 移除 leaderboard tab 条目 |

#### F-3. 前端页面路由删除

| # | 删除目录 | 功能 |
|---|----------|------|
| F-3a | `packages/web/src/app/mission-hub/` | 外部项目管理页 |
| F-3b | `packages/web/src/app/mission-control/` | 同上（重定向） |
| F-3c | `packages/web/src/app/showcase/` | 功能展示 demo 页 |
| F-3d | `packages/web/src/app/signals/` | 信号源阅读器 |

#### F-4. API 路由摘除

路由注册在 `packages/api/src/index.ts`（主入口直接 import 各 route 文件），`packages/api/src/routes/index.ts` 是 barrel re-export。两处均需清理。

| # | 文件 | 改动 |
|---|------|------|
| F-4a | `packages/api/src/index.ts` | 移除 game/leaderboard/bootcamp/signals/vote/external-projects 相关 route 的 import 和注册调用 |
| F-4b | `packages/api/src/routes/index.ts` | 移除 17 个 route export：games、game-actions、game-command-interceptor、external-projects、intent-card-routes、slice-routes、resolution-routes、reflux-routes、signals、signal-collection-routes、signal-study-routes、signal-podcast-routes、leaderboard、leaderboard-events、votes、bootcamp、callback-bootcamp-routes |

#### F-5. API 回调路由摘除

| # | 文件 | 改动 |
|---|------|------|
| F-5a | `packages/api/src/routes/callbacks.ts` | 移除 `POST /api/callbacks/start-vote` 路由块（L1184-1306）+ bootcamp 注册（L1330-1332）+ 顶部 vote/bootcamp import |

#### F-6. MCP 工具摘除

| # | 文件 | 改动 |
|---|------|------|
| F-6a | `packages/mcp-server/src/tools/callback-tools.ts` | 移除 office_claw_start_vote + office_claw_update_bootcamp_state + office_claw_bootcamp_env_check 三个工具定义及 handler |
| F-6b | `packages/mcp-server/src/tools/index.ts` | 移除 game-action-tools、signals-tools、signal-study-tools 的 export |
| F-6c | `packages/mcp-server/src/server-toolsets.ts` | 移除 4 个工具注册条目（office_claw_start_vote / update_bootcamp_state / bootcamp_env_check / submit_game_action） |
| F-6d | 删除 `packages/mcp-server/src/tools/game-action-tools.ts` | 整文件 |
| F-6e | 删除 `packages/mcp-server/src/tools/signals-tools.ts` | 整文件 |
| F-6f | 删除 `packages/mcp-server/src/tools/signal-study-tools.ts` | 整文件 |

#### F-7. 保留组件中的嵌入引用清理

保留的核心组件中嵌入了被裁功能的 import/render/导航，需一并清理。

| # | 文件 | 改动 | 理由 |
|---|------|------|------|
| F-7a | `packages/web/src/components/ThreadSidebar/ThreadSidebar.tsx` | 移除 `router.push('/mission-hub')` 导航链接 | 用户可见 404 |
| F-7b | `packages/web/src/components/ChatContainer.tsx` | 移除 `GameOverlayConnector` import + `<GameOverlayConnector />` render | 死挂载清理 |
| F-7c | `packages/web/src/components/ChatInput.tsx` | 移除 `GameLobby` import + render | 死挂载清理 |
| F-7d | `packages/web/src/components/CatCafeHub.tsx` | 移除 `HubLeaderboardTab` import + `tab === 'leaderboard'` render 分支 | 死分支清理 |
| F-7e | `packages/web/src/hooks/useChatSocketCallbacks.ts` | 移除 `useGameStore` import + game 状态 socket 回调 | 死回调清理 |

#### F 封堵验证矩阵

> 状态列描述 Phase F 全部改动完成后的预期状态。

| 调用路径 | 封堵点 | 改完后状态 |
|---------|--------|-----------|
| 用户 slash command | F-1: command-registry 移除 | 封死 |
| 用户 Hub tab | F-2: navigation 移除 leaderboard | 封死 |
| 用户页面 URL | F-3: app/ 目录删除 → 404 | 封死 |
| 用户直接调 API | F-4: api/src/index.ts + routes/index.ts 移除 import 和注册 | 封死 |
| Agent 调 MCP 工具 | F-6: MCP 注册移除 → 工具不在列表 → agent 不可见 | 封死 |
| Agent callback 调 API | F-5: callbacks.ts 移除回调路由 | 封死 |
| 用户点击 mission-hub 链接 | F-7a: ThreadSidebar 移除导航 | 封死 |
| 前端嵌入渲染 | F-7b~e: 移除 import + render 死挂载 | 清理完毕 |
| SystemPrompt 注入残留 | 全新部署无旧 thread，条件永远不满足 | 无风险 |
| 路由层 vote/game 拦截 | 死代码，无入口触发 | 无风险（Tier 2 清理） |

#### F 改动汇总

| 类别 | 改文件数 | 删文件/目录 |
|------|---------|------------|
| 前端 command + 菜单 | 4 | 0 |
| 前端 Hub 导航 | 1 | 0 |
| 前端页面路由 | 0 | 4 目录 |
| 前端嵌入引用清理 | 5 | 0 |
| API 主入口 + 路由 barrel | 2 | 0 |
| API 回调路由 | 1 | 0 |
| MCP 工具 | 3 | 3 文件 |
| **合计** | **16 文件修改** | **4 目录 + 3 文件删除** |

#### F 保留的死代码（Tier 2 Phase F-cleanup 单独 PR 清理）

> **风险评估结论**：Phase F-cleanup 不与 Phase F（B+）同轮执行。
> 原因：~150 文件删除涉及大量耦合引用（web/api/mcp 多层散布），同轮合并极易引入编译断裂和隐性行为回归。
> 正确顺序：Phase F 封死入口 → 验证通过 → 单独 PR 清理死代码。

- `components/game/`、`signals/`、`mission-control/` 组件目录
- `stores/gameStore.ts`、`missionControlStore.ts`
- `domains/` 下 game、signals、leaderboard、projects 服务
- `shared/types/` 下 game.ts、leaderboard.ts、signals.ts
- 全部相关 route 文件（routes/index.ts barrel export 已摘，文件保留）
- 全部相关 test 文件
- chatStore/route-parallel/route-serial 内的 vote/game/bootcamp 分支逻辑
- SystemPromptBuilder 内的 bootcamp/signal 注入逻辑
- 合计 ~150 文件保留但完全不可达

---

## 执行计划

两层目标：

**Tier 1（必须达成 — 用户零泄漏）**：
- Phase A-fix + Phase B + Phase S — 前端文案/后端残留/skill 文档
- Phase M-2 — MCP server 名
- Phase M-3 — source 类型
- Phase M-4 — 环境变量名
- Phase M-5（必须项，clean break） — skills 目录、数据目录、配置文件名 + 清理脚本 + 迁移 SOP

**Tier 1.5（功能裁剪 — 去除 office-claw 特色功能入口）**：
- Phase F — 非办公功能整体封堵（方案 B+：入口屏蔽 + API 路由摘除 + MCP 工具摘除）

**Tier 2（可延期 — 纯内部实现）**：
- `@office-claw/*` package scope 改名
- `/api/cats/` 路由名
- 内部变量名 `catId`/`CAT_CONFIGS` 等
- Phase F 残留死代码彻底清理（~150 文件，方案 C）

依赖链与并行度：

```
Tier 1:
  Phase A-fix + B + S (文案)  ─── 无前置，可立即开始 ──┐
  Phase M-2 (MCP server 名)  ─── 前置：Phase M ✅ ────┤
                                                        ├→ Phase M-3 → M-4 → M-5 → C
Tier 1.5:
  Phase F (功能裁剪)  ─── 无前置，可与 Tier 1 并行 ────→ Tier 2 Phase F-cleanup
```

**Phase (A-fix + B + S) 和 M-2 可并行**。M-3/M-4/M-5 有依赖链需串行。
**Phase F 无前置依赖**，可与 Tier 1 任意 Phase 并行执行。

**Commit 策略**：每个 Phase 单独一个 commit，方便按 Phase 粒度回滚。commit message 格式：`feat(F140): Phase X — 简述`。

## 验收标准

### 自动化 grep gate（CI 可集成）

```bash
# 前端源码零命中（排除测试、showcase）
grep -rn --include='*.ts' --include='*.tsx' \
  -E '智能体|配额|用户|Claude|Codex|Gemini|DARE|ᓚᘏᗢ|Cat Café' \
  packages/web/src/ | grep -v '__tests__/' | grep -v '.test.' | grep -v 'showcase/' \
  && echo "FAIL" || echo "PASS"

# 后端用户可见文案零命中（排除 GithubReviewMailParser 历史格式匹配）
grep -rn --include='*.ts' \
  -E '智能体|配额|用户|该猫|Claude.*(响应|救援|项目)|Codex.*(响应|项目)|Gemini.*(响应|项目)' \
  packages/api/src/ | grep -v 'GithubReviewMailParser' | grep -v '// ' \
  && echo "FAIL" || echo "PASS"

# Skill refs 零命中
grep -rn -E '智能体|用户|CAT_CAFE_' office-claw-skills/refs/ \
  && echo "FAIL" || echo "PASS"

# 环境变量零残留
grep -rn 'CAT_CAFE_' packages/api/src/config/env-registry.ts \
  && echo "FAIL" || echo "PASS"
```

### 手动验收

1. 新安装用户首次打开 OfficeClaw，全链路无 `office-claw` / `Cat Café` / `智能体` / 猫品种名出现
2. 升级用户旧配置（`.env`、`capabilities.json`、`~/.office-claw/`）自动兼容，无需手动修改
3. `pnpm check` + `pnpm test` 全绿
4. Hub 设置面板 → 环境变量页无 `CAT_CAFE_*` 显示
5. 安装目录无 `office-claw-skills/`、`~/.office-claw/` 路径
6. 对话中触发 MCP 工具调用，前端 CliOutputBlock 显示 `office_claw_*` 名称

## Review 记录

- 2026-04-10 Claude初版 + Codex交叉审查：F140 v1 Phase B 清单不完整（仅覆盖 43/129），补齐 Phase A-fix（9 项后端残留）、Phase S（skill refs 117 处）、Phase B 全量清单（52 项），M-4 补齐 2 个遗漏变量，M-5 拆分必须/延期两层
- Claude补充：McpPromptInjector prompt 注入、quota.ts 品种名标签、SystemPromptBuilder 路径引用、CatCafeLogo gradient ID、配置文件名（office-claw-config.json 等）
