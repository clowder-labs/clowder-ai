---
feature_ids: [F140]
related_features: []
topics: [branding, de-cat, office-claw, user-facing, config, env-vars, mcp]
doc_kind: spec
created: 2026-04-10
---

# F140: De-Cat Branding — 去除用户可见的 Cat Cafe 痕迹

> **Status**: in-progress | **Owner**: 布偶猫 | **Priority**: P1

## Why

产品已从内部代号 "Cat Cafe" 正式定名为 **OfficeClaw**。最终用户不应在 UI、安装目录配置文件、环境变量中看到任何 `cat-cafe` / `Cat Café` / `猫猫` 等旧品牌内容。功能不变，只改用户感知层。

## 目标

在保证功能不变的前提下，最终用户在以下三个维度看不到 `cat-cafe` 相关内容：

1. **UI**（Web 前端文案、PWA manifest、push 通知、toast 提示）
2. **安装目录配置文件**（`capabilities.json`、MCP server 注册名、`source` 字段）
3. **环境变量**（`CAT_CAFE_*` 前缀）

---

## 术语对照表

| 旧术语 | → 系统内部（LLM-facing） | → 前端 UI（用户-facing） |
|--------|--------------------------|------------------------|
| 猫猫 / 猫 | agent | 智能体 |
| 铲屎官 / CVO | 用户 | 用户 |
| 猫粮 | — | 配额 |
| 🐾 / 🐱 | 删除 | 删除 |
| ᓚᘏᗢ | — | 删除或换通用图标 |
| 布偶猫 | 办公智能体 | 办公智能体（小九） |
| 缅因猫 | 通用智能体 | 通用智能体（小理） |
| 暹罗猫 | 编码智能体 | 编码智能体（小码） |
| cat-cafe (source) | builtin | — |
| CAT_CAFE_* (env) | OFFICE_CLAW_* | — |
| cat-cafe-collab (MCP) | office-claw-collab | — |

---

## 已完成工作

以下 Phase 已在 main 上合入（来自迁移前仓库 commit）。

### Phase A — 系统提示词 + 后端文案（✅ 已完成）

> Commit: `e2a7a440` feat(de-cat): remove cat-themed terminology from user-facing text, prompts, and notifications
> 27 files, 181 insertions, 208 deletions

覆盖范围：
- **SystemPromptBuilder.ts** — 身份注入、队友名册、治理摘要、MCP 工具文档、调用上下文、语音模式中所有猫主题文案
- **ContextAssembler.ts** — `铲屎官` → `用户`（消息历史发送者标签）
- **governance-pack.ts** — sentinel 标记 `CAT-CAFE-GOVERNANCE` → `CLOWDER-GOVERNANCE`，治理规则文案
- **Connector 出站** — `ConnectorMessageFormatter`、`OutboundDeliveryHook`、`StreamingOutboundHook`、飞书/钉钉/Telegram adapter 中 🐱 emoji 前缀
- **通知模板** — 信号日报 `🐱 Clowder AI` 前缀、push 测试推送 `猫猫测试推送`
- **错误/提示文案** — `messages.ts`（猫猫正在忙/出错了）、`threads.ts`（猫猫正在工作中）
- **env-registry.ts** — 描述文案中的猫品种名（`布偶猫 prompt 上限` → `Claude prompt 上限`）
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

> Commit: `b98147d7` refactor(skills): remove cat-cafe synced skills
> 40 files, 删除 20 个 cat-cafe-specific skills，保留 4 个核心协作 skill 并去猫化

---

## 待完成工作

> 以下清单经布偶猫 + 缅因猫双审（2026-04-10），基于全仓 grep 实扫补齐。
> 非测试前端源码命中 129 处 / 52 文件；后端用户可见残留 ~20 处；skill refs 117 处 / 13 文件。

### Phase A-fix — 后端漏网的用户可见文案

Phase A 遗漏的、会直接暴露给用户的后端残留。与 Phase B 一起做，改动量小。

| # | 文件 | 当前 | → 改为 | 用户何时看到 |
|---|------|------|--------|------------|
| A-f1 | `ClaudeAgentService.ts:357` | `布偶猫 CLI 响应超时` | `Claude CLI 响应超时` | agent 超时 error toast |
| A-f2 | `CodexAgentService.ts:427` | `缅因猫 CLI 响应超时` | `Codex CLI 响应超时` | 同上 |
| A-f3 | `GeminiAgentService.ts:157` | `暹罗猫 CLI 响应超时` | `Gemini CLI 响应超时` | 同上 |
| A-f4 | `GeminiAgentService.ts:335` | `暹罗猫已在 Antigravity 中开始工作` | `Gemini 已在 Antigravity 中开始工作` | 对话消息 |
| A-f5 | `queue.ts:357` | `该猫当前未在执行` | `该智能体当前未在执行` | 停止执行 error |
| A-f6 | `callback-errors.ts:4` | hint 含 `@猫名` | `@智能体名` | 401 expired credentials |
| A-f7 | `McpPromptInjector.ts:63` | `@猫名`（注入 LLM prompt） | `@智能体名` | LLM 引用后暴露给用户 |
| A-f8 | `quota.ts:310-463` | 12 处 `布偶猫 (Claude)` / `缅因猫 (Codex)` / `暹罗猫 (Antigravity)` | 用 displayName 或 provider 名 | Hub 配额面板 |
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

> 方法论：以 `grep -rn '猫猫\|猫粮\|铲屎官\|布偶猫\|缅因猫\|暹罗猫\|狸花猫\|ᓚᘏᗢ\|Cat Café' packages/web/src/ --include='*.ts' --include='*.tsx' | grep -v __tests__ | grep -v .test.` 为基线。
> 前端用户可见文案：`猫猫` → `智能体`，`铲屎官` → `用户`，`猫粮` → `配额`，品种名 → displayName。

#### B1. 核心交互区

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| F01 | `ThreadCatStatus.tsx:48` | `猫猫 @ 了你` | `智能体 @ 了你` |
| F02 | `ThreadCatStatus.tsx:43` + `SplitPaneCell.tsx:68` | `ᓚᘏᗢ` ASCII 猫脸 | 删除或换通用 icon |
| F03 | `PushSettingsPanel.tsx:99` | `猫猫回复...推送到系统通知栏` | `智能体回复...` |
| F04 | `PushSettingsPanel.tsx:200` | `猫猫消息会推送` / `点击开启接收猫猫推送` | → 智能体 |
| F05 | `ChatInput.tsx:1023` | `请至少选一只猫猫` | `请至少选一个智能体` |
| F06 | `ChatInputActionButton.tsx:193,203` | `猫猫忙完后处理` / `中断当前猫猫` | → 智能体 |
| F07 | `ParallelStatusBar.tsx:122` | `停止所有猫猫` | `停止所有智能体` |
| F08 | `ChatInputMenus.tsx:202` | `↓ 还有更多猫猫` | `↓ 还有更多智能体` |
| F09 | `BindNewSessionSection.tsx:87` | `选择猫猫...` | `选择智能体...` |
| F10 | `VoteConfigModal.tsx:164` | `投票猫猫` | `投票智能体` |
| F11 | `RightStatusPanel.tsx:179,417,500` | `猫猫状态` / `猫猫消息` / `猫猫互相看不到/分享心里话` | → 智能体 |
| F12 | `MobileStatusSheet.tsx:85,141` | `猫猫状态` / `猫猫消息` | → 智能体 |
| F13 | `EvidencePanel.tsx:46` | `喵... 翻遍了猫砂盆也没找到相关证据` | `暂未找到相关证据` |
| F14 | `ChatEmptyState.tsx:117` | `第一次来？开始猫猫训练营` | `第一次来？开始新手引导` |
| F15 | `BootcampListModal.tsx:106,174` + `ThreadSidebar.tsx:307` | `🎓 猫猫训练营` | `🎓 新手训练营` |
| F16 | `BootcampIcon.tsx:5` | `<title>猫猫训练营</title>` | `<title>新手训练营</title>` |
| F17 | `useAuthorization.ts:25` | `🔐 猫猫需要权限` | `🔐 智能体需要权限` |
| F18 | `chatStore.ts:249` | fallback `猫猫` | fallback `智能体` |
| F19 | `SuggestionDrawer.tsx:102` | `等待铲屎官决策` | `等待用户决策` |
| F20 | `DirectoryPickerModal.tsx:282` | `收起猫猫` / `选猫猫` | `收起列表` / `选智能体` |
| F21 | `CatSelector.tsx:39` | `默认猫猫 (可选)` | `默认智能体 (可选)` |
| F22 | `ThreadCatSettings.tsx:83` | `设置默认猫猫` | `设置默认智能体` |
| F23 | `PlanBoardPanel.tsx:202` | `猫猫祟祟` | `任务看板` |
| F24 | `QueuePanel.tsx:258` | fallback `猫猫` (2 处) | `智能体` |
| F25 | `IdeateHeader.tsx:14` | `猫猫们各自独立思考中...` | `智能体们各自独立思考中...` |

#### B2. Hub 设置面板

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| F26 | `HubRoutingPolicyTab.tsx:103,105` | `猫粮约束` / `猫猫自治路由` / `猫粮` | → 配额 / 智能体 |
| F27 | `HubEnvFilesTab.tsx:179` | `猫猫模板（只读 seed）` | `智能体模板（只读 seed）` |
| F28 | `HubEnvFilesTab.tsx:191-193` | `布偶猫/缅因猫/暹罗猫项目指引` | `办公智能体/通用智能体/编码智能体项目指引` |
| F29 | `HubGovernanceTab.tsx:119` | `猫猫首次被派遣到外部项目时` | `智能体首次被派遣到外部项目时` |
| F30 | `HubClaudeRescueSection.tsx` | 8 处 `布偶猫救援`/`救活 N 只布偶猫` | `Claude 救援` / `救活 N 个 Claude session` |
| F31 | `cat-cafe-hub.navigation.tsx:59` | `布偶猫救援` | `Claude 救援` |
| F32 | `hub-cat-editor.sections.tsx:89` | `铲屎官给的昵称` | `用户自定义昵称` |
| F33 | `hub-cat-editor.sections.tsx:533` | placeholder `@codex, @缅因猫` | `@codex, @assistant` |
| F34 | `HubLeaderboardTab.tsx` | `CVO 能力等级 🐾` / `夜猫子` | 去 🐾 / `夜间活跃` |
| F35 | `HubQuotaBoardTab.tsx:210` | `猫粮看板` | `配额看板` |
| F36 | `config-viewer-tabs.tsx:74` | `A2A 猫猫互调` | `A2A 智能体协作` |

#### B3. 品种名硬编码（必须改为动态读取或 displayName）

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| F37 | `AuthorizationCard.tsx:7-10` | `布偶猫/缅因猫/暹罗猫/狸花猫` 硬编码映射 | `办公智能体/通用智能体/编码智能体/确定性智能体` |
| F38 | `DailyUsageSection.tsx:35-43,92` | `布偶猫 Opus` / `缅因猫 Codex` / `暹罗猫 Gemini` / `猫粮消耗` | 用 displayName，`配额消耗` |
| F39 | `MessageNavigator.tsx:26-29` | `布偶猫/缅因猫/暹罗猫/狸花猫` label | 用 displayName |
| F40 | `quota-cards.tsx:80-82,144` | `缅因猫 Codex + GPT-5.2` / `缅因猫 Spark` / `切到缅因猫` | 用 displayName |
| F41 | `leaderboard-phase-bc.tsx:41` | `猫猫杀 胜场` | `游戏 胜场` |

#### B4. 游戏 + 语音 + 命令

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| F42 | `GameLobby.tsx:124,164,191` | `选择参赛猫猫` / `绑定猫猫` / `选一只猫猫` | → 智能体 |
| F43 | `EventFlow.tsx:116` | 人类玩家显示 `铲屎官` | `用户` |
| F44 | `useVoiceInput.ts:11-12` | 语音纠错上下文含品种名 + `铲屎官` | 用 displayName + `用户` |
| F45 | `SuggestionOpenForm.tsx:59` | `建议领取猫猫` | `建议领取智能体` |
| F46 | `SuggestionDecisionPanel.tsx:34` | `建议猫猫` | `建议智能体` |

#### B5. Service Worker + 命令 + Socket + Mention

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| F47 | `worker/index.ts:32,49` | `猫猫来信` (2 处) | `消息通知` |
| F48 | `useChatCommands.ts:84,93` | `猫猫配置` / `A2A 猫猫互调` | `智能体配置` / `A2A 智能体协作` |
| F49 | `useSocket-background-system-info.ts:297` | `proposedBy ?? '猫猫'` | `?? '智能体'` |
| F50 | `mention-highlight.ts:65,67` | `CO_CREATOR_DISPLAY_NAME = '铲屎官'` + `@铲屎官` pattern | `'用户'` + `@用户` |

#### B6. PWA Manifest

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| F51 | `manifest.json:3-5` | `"Cat Café"` / `"猫猫"` / `"三只 AI 猫猫的协作空间"` | `"OfficeClaw"` / `"OfficeClaw"` / `"AI team collaboration space"` |

#### B7. Logo / Icon

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| F52 | `CatCafeLogo.tsx` | gradient ID `cat-cafe-gradient`，注释 `三猫流光渐变` | `brand-gradient`，更新注释 |

#### B8. Showcase 页面（P2，历史演示数据）

`app/showcase/f11-review/page.tsx` 和 `app/showcase/f052-*/page.tsx` 含大量猫品种名和 `铲屎官`。
这些是历史 demo fixture，不影响正式功能。**建议与主改动分开**，低优处理。

#### B9. 测试文件（随主代码同步改，~20 文件）

组件测试中 fixture 的猫名/猫文案需随 B1-B7 同步更新。

---

### Phase S — Skill 文档去猫化

> 用户可见点：skill 加载后注入 LLM prompt，LLM 会引用；Skill 详情面板展示 BOOTSTRAP.md 内容。

| # | 文件 | 命中数 | 改动 |
|---|------|--------|------|
| S1 | `BOOTSTRAP.md` | ~12 处 | `Cat Café Skills` → `OfficeClaw Skills`，去 `铲屎官`/`三猫`/`猫猫` |
| S2 | `refs/shared-rules.md` | ~50 处 | 全面去猫化（`猫`→`agent`，`铲屎官`→`用户`，品种名→displayName） |
| S3 | `refs/mcp-callbacks.md` | ~32 处 | `$CAT_CAFE_*` → `$OFFICE_CLAW_*`，`猫`→`agent` |
| S4 | `refs/pr-template.md` | ~10 处 | 去品种名和猫主题签名 |
| S5 | `refs/review-request-template.md` | ~5 处 | 同上 |
| S6 | 其余 8 个 refs 文件 | ~8 处 | 零散替换 |

---

### Phase M-2 — MCP Server 注册名重命名

> 前置：Phase M ✅

将 MCP server 注册名从 `cat-cafe-*` 改为 `office-claw-*`，影响 capability 配置。

**用户可见点**：安装目录的 `capabilities.json` 配置文件中 server name 可见。

| # | 文件 | 当前 | → 改为 |
|---|------|------|--------|
| 1 | `mcp-server/src/collab.ts` | `createBaseServer('cat-cafe-collab-mcp')` | `'office-claw-collab-mcp'` |
| 2 | `mcp-server/src/memory.ts` | `createBaseServer('cat-cafe-memory-mcp')` | `'office-claw-memory-mcp'` |
| 3 | `mcp-server/src/signals.ts` | `createBaseServer('cat-cafe-signals-mcp')` | `'office-claw-signals-mcp'` |
| 4 | `capability-orchestrator.ts` | `CAT_CAFE_SPLIT_SERVER_IDS` 常量 + 3 个 `name: 'cat-cafe-*'` | 改为 `office-claw-*` |
| 5 | `routes/capabilities.ts:359-361` | server description `三猫协作工具` 等 | 更新描述 |
| 6 | `DareAgentService.ts:81` | `cat-cafe-dare-mcp` 临时文件名 | `office-claw-dare-mcp` |
| 7 | 日志标签 | `[cat-cafe-collab]` 等 console.error | `[office-claw-collab]` |

**迁移策略**：capability-orchestrator 读取旧 `cat-cafe-*` 名称时自动迁移到新名称，避免用户升级后 capabilities.json 失效。

**测试**：`capability-orchestrator.test.js`、`mcp-config-adapters.test.js`、`capabilities-route.test.js`

---

### Phase M-3 — Source 类型标识重命名

> 前置：Phase M-2

将 `source: 'cat-cafe'` 改为 `source: 'builtin'`。

**用户可见点**：`capabilities.json` 中 `source` 字段；前端 Skill 详情面板。

| # | 文件 | 改动 |
|---|------|------|
| 1 | `shared/types/capability.ts` | 类型定义 `'cat-cafe' \| 'external'` → `'builtin' \| 'external'` |
| 2 | `capability-orchestrator.ts` | 4 处 `source: 'cat-cafe'` |
| 3 | `routes/skills.ts` | 2 处（类型 + 赋值） |
| 4 | `web/SkillDetailView.tsx` | 类型引用 |
| 5 | `web/capability-board-ui.tsx` | 类型引用 |
| 6 | 测试文件 | ~20 处 |

**迁移策略**：读取 capabilities.json 时兼容旧 `source: 'cat-cafe'`，自动映射为 `'builtin'`。

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

将用户可见的文件路径中的 `cat-cafe` 改为 `office-claw`。

#### 迁移策略决策

本版本为首版本发布，不需要运行时自动迁移逻辑。旧路径不工作是预期行为。
前序版本的开发者安装新版本前，通过清理脚本 `scripts/clean-legacy-env.sh` + SOP 文档清除旧环境数据。

**不做**：启动时自动检测旧目录 → move → symlink 兼容层。
**要做**：提供清理脚本 + 迁移 SOP 文档（`docs/migration-from-cat-cafe.md`）。

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
| M-5d | 清理脚本 | （新增） | `scripts/clean-legacy-env.sh` | 新增 |
| M-5d | 迁移 SOP | （新增） | `docs/migration-from-cat-cafe.md` | 新增，F140 关联 |

#### M-5 Out of Scope（Tier 2 延期）

| 类别 | 当前 | 说明 |
|------|------|------|
| Package scope | `@cat-cafe/web`、`@cat-cafe/shared` 等 | npm workspace，~423 处非测试引用，用户不可见，收益为零 |
| API 路由 | `/api/cats/*` | 前端全链路依赖，改了破坏所有消费者 |
| 内部变量名 | `catId`/`catConfig`/`CAT_CONFIGS` | 纯代码层，改了极易回归 |
| 运行时自动迁移 | — | 首版本不需要，清理脚本覆盖 |
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
| C2 | jiuwenclaw 记忆文件清理 | `~/.jiuwenclaw/agent/memory/` 中旧记忆含 "Cat Cafe" |
| C3 | Redis 历史会话数据（可选） | 旧消息中的猫主题内容，自然过期即可 |

---

## 执行计划

两层目标：

**Tier 1（必须达成 — 用户零泄漏）**：
- Phase A-fix + Phase B + Phase S — 前端文案/后端残留/skill 文档
- Phase M-2 — MCP server 名
- Phase M-3 — source 类型
- Phase M-4 — 环境变量名
- Phase M-5（必须项，clean break） — skills 目录、数据目录、配置文件名 + 清理脚本 + 迁移 SOP

**Tier 2（可延期 — 纯内部实现）**：
- `@cat-cafe/*` package scope 改名
- `/api/cats/` 路由名
- 内部变量名 `catId`/`CAT_CONFIGS` 等
- Showcase 历史 demo 数据

依赖链与并行度：

```
Phase A-fix + B + S (文案)  ─── 无前置，可立即开始 ──┐
Phase M-2 (MCP server 名)  ─── 前置：Phase M ✅ ────┤
                                                      ├→ Phase M-3 → M-4 → M-5 → C
```

**Phase (A-fix + B + S) 和 M-2 可并行**。M-3/M-4/M-5 有依赖链需串行。

**Commit 策略**：每个 Phase 单独一个 commit，方便按 Phase 粒度回滚。commit message 格式：`feat(F140): Phase X — 简述`。

## 验收标准

### 自动化 grep gate（CI 可集成）

```bash
# 前端源码零命中（排除测试、showcase）
grep -rn --include='*.ts' --include='*.tsx' \
  -E '猫猫|猫粮|铲屎官|布偶猫|缅因猫|暹罗猫|狸花猫|ᓚᘏᗢ|Cat Café' \
  packages/web/src/ | grep -v '__tests__/' | grep -v '.test.' | grep -v 'showcase/' \
  && echo "FAIL" || echo "PASS"

# 后端用户可见文案零命中（排除 GithubReviewMailParser 历史格式匹配）
grep -rn --include='*.ts' \
  -E '猫猫|猫粮|铲屎官|该猫|布偶猫.*(响应|救援|项目)|缅因猫.*(响应|项目)|暹罗猫.*(响应|项目)' \
  packages/api/src/ | grep -v 'GithubReviewMailParser' | grep -v '// ' \
  && echo "FAIL" || echo "PASS"

# Skill refs 零命中
grep -rn -E '猫猫|铲屎官|CAT_CAFE_' office-claw-skills/refs/ \
  && echo "FAIL" || echo "PASS"

# 环境变量零残留
grep -rn 'CAT_CAFE_' packages/api/src/config/env-registry.ts \
  && echo "FAIL" || echo "PASS"
```

### 手动验收

1. 新安装用户首次打开 OfficeClaw，全链路无 `cat-cafe` / `Cat Café` / `猫猫` / 猫品种名出现
2. 升级用户旧配置（`.env`、`capabilities.json`、`~/.office-claw/`）自动兼容，无需手动修改
3. `pnpm check` + `pnpm test` 全绿
4. Hub 设置面板 → 环境变量页无 `CAT_CAFE_*` 显示
5. 安装目录无 `office-claw-skills/`、`~/.office-claw/` 路径
6. 对话中触发 MCP 工具调用，前端 CliOutputBlock 显示 `office_claw_*` 名称

## Review 记录

- 2026-04-10 布偶猫初版 + 缅因猫交叉审查：F140 v1 Phase B 清单不完整（仅覆盖 43/129），补齐 Phase A-fix（9 项后端残留）、Phase S（skill refs 117 处）、Phase B 全量清单（52 项），M-4 补齐 2 个遗漏变量，M-5 拆分必须/延期两层
- 布偶猫补充：McpPromptInjector prompt 注入、quota.ts 品种名标签、SystemPromptBuilder 路径引用、CatCafeLogo gradient ID、配置文件名（office-claw-config.json 等）
