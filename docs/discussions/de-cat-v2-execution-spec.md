---
feature_ids: [F140]
related_features: []
topics: [branding, de-cat, office-claw, dead-code, execution-plan]
doc_kind: spec
created: 2026-04-23
---

# F140 v2: De-Cat Execution Spec (2026-04-23)

> **Status**: draft | **Owner**: Claude + Codex 联合分析 | **Branch**: `codex/decoupling-main-replay-20260421`
> **前置**: F140 Phase A/M/F 已完成，PR #407 已合入

## 背景

F140 第一轮（2026-04-10 ~ 04-21）完成了系统 prompt、MCP 工具名、功能封堵（Phase F）和部分配置文件重命名。PR #407 在此基础上进一步做了 config 文件名迁移和文档清理。

本 spec 是第二轮执行计划，目标是**完全去猫化**：用户界面零猫痕 + 代码层无误导性残留 + 已封堵功能的死代码物理删除。

## 决策记录

| # | 决策 | 理由 | 日期 |
|---|------|------|------|
| D1 | Signal/Study/Podcast 全量删除 | OfficeClaw 不提供知识阅读器功能 | 2026-04-23 |
| D2 | 毛线球（TaskPanel）删除 | OfficeClaw 不提供任务追踪面板 | 2026-04-23 |
| D3 | 右侧 Workspace 面板全量删除 | RightStatusPanel/WorkspacePanel 已不渲染，确认移除 | 2026-04-23 |
| D4 | Bootcamp 前端断开并删除 | 后端路由已断，前端仍为僵尸渲染 | 2026-04-23 |
| D5 | Mission Control 前端组件删除 | 页面路由已删，26 个组件为孤儿代码 | 2026-04-23 |
| D6 | Agent guide 品牌迁移声明已加入 | CLAUDE.md/AGENTS.md/GEMINI.md/KIMI.md 顶部加 Branding Migration Notice | 2026-04-23 |
| D7 | Governance 标记已统一 | `CAT-CAFE-GOVERNANCE` → `OFFICECLAW-GOVERNANCE` (四个 agent guide) | 2026-04-23 |

---

## Batch 0: 死代码物理删除

> **目标**: 把 Phase F 封堵但保留的 ~130 个孤儿文件物理删除，减少后续 batch 的改动面
> **风险**: 中 — 需确认无 import 残留导致编译失败
> **验收**: `pnpm build` 通过，前端正常加载

### 0-A. Game 系统 (~29 files)

| 目录/文件 | 文件数 | 说明 |
|-----------|--------|------|
| `packages/api/src/domains/cats/services/game/` | 19 | 全目录删除（含 werewolf 子目录） |
| `packages/api/src/routes/games.ts` | 1 | 路由文件（已从 index.ts 摘除） |
| `packages/api/src/routes/game-actions.ts` | 1 | 路由文件 |
| `packages/api/src/routes/game-command-interceptor.ts` | 1 | 路由文件 |
| `packages/web/src/components/game/` | 7 | 全目录删除 |
| `packages/web/src/stores/gameStore.ts` | 1 | 状态管理 |
| `packages/web/src/hooks/useGameApi.ts` | 1 | API hook |
| `packages/web/src/hooks/useGameReconnect.ts` | 1 | Socket hook |

**清理引用**:
- `packages/shared/src/types/` 中 game 相关类型（如 game.ts）
- 测试文件中的 game mock/fixture

### 0-B. Leaderboard (~12 files)

| 目录/文件 | 文件数 | 说明 |
|-----------|--------|------|
| `packages/api/src/domains/leaderboard/` | 7 | 全目录删除 |
| `packages/api/src/routes/leaderboard.ts` | 1 | 路由文件 |
| `packages/api/src/routes/leaderboard-events.ts` | 1 | 路由文件 |
| `packages/web/src/components/HubLeaderboardTab.tsx` | 1 | Hub tab 组件 |
| `packages/web/src/components/leaderboard-cards.tsx` | 1 | 展示组件 |
| `packages/web/src/components/leaderboard-phase-bc.tsx` | 1 | 展示组件 |

**清理引用**:
- `packages/shared/src/types/leaderboard.ts`
- 相关测试文件

### 0-C. Voting (~3 files)

| 文件 | 说明 |
|------|------|
| `packages/api/src/routes/votes.ts` | 路由文件 |
| `packages/web/src/components/VoteConfigModal.tsx` | UI 组件 |
| `packages/web/src/components/VoteActiveBar.tsx` | UI 组件 |

**清理引用**:
- `packages/api/src/domains/cats/services/agents/routing/vote-intercept.ts`
- 测试文件中 vote 相关 fixture

### 0-D. Bootcamp (~5 files)

| 文件 | 说明 |
|------|------|
| `packages/api/src/routes/bootcamp.ts` | 路由文件 |
| `packages/api/src/routes/callback-bootcamp-routes.ts` | 回调路由 |
| `packages/api/src/domains/cats/services/bootcamp/` | 2 文件 |
| `packages/web/src/components/BootcampListModal.tsx` | **仍被 ChatContainer 渲染 — 需先断引用** |

**断引用（必须先做）**:
- `ChatContainer.tsx` 中移除 `BootcampListModal` import 和渲染
- `ChatEmptyState.tsx` 中移除训练营入口

### 0-E. Signal/Study/Podcast (~48 files)

| 目录/文件 | 文件数 | 说明 |
|-----------|--------|------|
| `packages/api/src/domains/signals/` | 33 | 全目录删除 |
| `packages/api/src/routes/signals.ts` | 1 | 路由文件 |
| `packages/api/src/routes/signal-study-routes.ts` | 1 | 路由文件 |
| `packages/api/src/routes/signal-collection-routes.ts` | 1 | 路由文件 |
| `packages/api/src/routes/signal-podcast-routes.ts` | 1 | 路由文件 |
| `packages/web/src/components/signals/` | 11 | 全目录删除 |

**断引用**:
- MCP server 中 signal 工具仍 active — 需从 `server-toolsets.ts` 摘除
- 前端 signal 组件的渲染入口

### 0-F. Mission Control 前端组件 (~26 files)

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `packages/web/src/components/mission-control/` | 26 | 全目录删除（页面路由已在 Phase F 中删除） |

**清理引用**:
- 检查是否有其他组件 import 了 mission-control 目录下的文件

### 0-G. 毛线球 TaskPanel

| 文件 | 说明 |
|------|------|
| `packages/web/src/components/TaskPanel.tsx` | 左侧边栏底部面板 |

**断引用**:
- `ThreadSidebar.tsx` 中移除 TaskPanel import 和渲染
- chatStore 中相关状态（如有）

### 0-H. 右侧 Workspace 面板

| 文件 | 说明 |
|------|------|
| `packages/web/src/components/RightStatusPanel.tsx` | 右侧状态面板（已不渲染） |
| `packages/web/src/components/WorkspacePanel.tsx` | 右侧文件浏览器（已不渲染） |
| `packages/web/src/components/PlanBoardPanel.tsx` | 嵌入 RightStatusPanel |
| `packages/web/src/components/SessionChainPanel.tsx` | 嵌入 RightStatusPanel |
| `packages/web/src/components/audit/AuditExplorerPanel.tsx` | 嵌入 RightStatusPanel |

**断引用**:
- chatStore 中 `rightPanelMode`、`workspaceWorktreeId` 等状态
- 相关测试文件

### Batch 0 验收

```bash
pnpm build                    # 编译通过
pnpm lint                     # 类型检查通过
# 前端能正常启动和渲染
# 无 import 报错
```

---

## Batch 1: 低风险命名清洁

> **目标**: 清理内部常量、注释、组件名中的 cat-cafe 残留（不碰核心 schema/路由/目录结构）
> **风险**: 低
> **验收**: `pnpm build` + 定向 grep 零命中

### 1-A. 前端组件重命名

| 当前 | 改为 | 文件 |
|------|------|------|
| `CatCafeHub` (组件名+文件名) | `OfficeClawHub` | `CatCafeHub.tsx` → `OfficeClawHub.tsx` |
| `CatCafeLogo` (组件名+文件名) | `OfficeClawLogo` | `icons/CatCafeLogo.tsx` → `icons/OfficeClawLogo.tsx` |
| `"Cat Café Hub"` (UI 文本) | `"OfficeClaw Hub"` | Hub 弹窗标题 |

### 1-B. 内部常量/事件名

| 当前 | 改为 | 文件 |
|------|------|------|
| `CAT_CAFE_DIR` | `OFFICE_CLAW_DIR` | `office-claw-catalog-store.ts` |
| `GEMINI_CAT_CAFE_ENV_PLACEHOLDERS` | `GEMINI_OFFICE_CLAW_ENV_PLACEHOLDERS` | `mcp-config-adapters.ts` |
| `'catcafe.ui.thinkingExpandedByDefault'` | `'officeclaw.ui.thinkingExpandedByDefault'` | `chatStore.ts` |
| `'catcafe:chat-layout-changed'` | `'officeclaw:chat-layout-changed'` | `A2ACollapsible.tsx`, `ScrollToBottomButton.tsx` |
| `CAT_ERROR: 'cat_error'` | `AGENT_ERROR: 'agent_error'` | `EventAuditLog.ts` |
| `'CAT_NOT_ACTIVE'` | `'AGENT_NOT_ACTIVE'` | `queue.ts` |

**localStorage 迁移**: `chatStore.ts` 初始化时检查旧 key `catcafe.*`，读取后写入新 key `officeclaw.*` 并删旧 key。一次性迁移，下个版本可删。

### 1-C. 推送通知 tag

| 当前 | 改为 | 文件 |
|------|------|------|
| `'cat-decision-'` | `'oc-decision-'` | `push-notification-policy.ts` |
| `'cat-reply-'` | `'oc-reply-'` | `push-notification-policy.ts` |

### 1-D. 注释清理

搜索范围: `packages/web/src/`, `packages/api/src/`, `packages/shared/src/`
关键词: `CatCafe`, `cat cafe`, `cat-cafe`, `clowder`, `CAT_CAFE`
只改注释，不改代码逻辑。

### Batch 1 验收

```bash
pnpm build
# 定向 grep 零命中:
grep -rn 'CAT_CAFE_DIR\|GEMINI_CAT_CAFE\|catcafe\.\|catcafe:' packages/
grep -rn 'CatCafeHub\|CatCafeLogo' packages/web/src/ --include='*.ts' --include='*.tsx'
grep -rn "'cat-decision-\|'cat-reply-'" packages/web/src/
```

---

## Batch 2: 配置/类型别名去猫

> **目标**: 收敛 shared/api 中保留的猫语义别名和 fallback 常量
> **风险**: 中 — 前端多模块直接依赖
> **验收**: `pnpm build` + 前端 mention/transcription 功能正常

### 2-A. `CAT_CONFIGS` 别名删除

当前 `packages/shared/src/types/cat.ts` 中 `CAT_CONFIGS` 是 `OFFICE_CLAW_CONFIGS` 的别名。

消费链:
- `packages/web/src/hooks/useCatData.ts`
- `packages/web/src/lib/mention-highlight.ts`
- `packages/web/src/stores/chatStore.ts`
- `packages/web/src/utils/transcription-corrector.ts`

**做法**: 所有消费点改用 `OFFICE_CLAW_CONFIGS`，然后删除 `CAT_CONFIGS` 导出。

### 2-B. 兼容层导出清理

检查 `packages/shared/src/types/cat.ts` 和 `cat-breed.ts` 中是否有其他仅为兼容保留的导出，一并清理。

### 2-C. `.env.example` 最终统一

确认所有变量使用 `OFFICE_CLAW_*` 前缀，无 `CAT_CAFE_*` 残留。

### Batch 2 验收

```bash
pnpm build
grep -rn 'CAT_CONFIGS' packages/ --include='*.ts' --include='*.tsx' | grep -v '.test.'
# 前端测试: mention highlight, transcription corrector
```

---

## Batch 3: 用户可见 surface 全量去猫

> **目标**: 清理所有用户直接看到的文字、Header、错误消息、安装器文案
> **风险**: 低（纯文本替换）
> **验收**: 全链路 UI 无猫痕

### 3-A. 参照 F140 Phase A-fix 清单

F140 spec 中 `A-f1` ~ `A-f9` 共 9 项后端残留，照做。

### 3-B. 参照 F140 Phase B 清单

F140 spec 中 `F01` ~ `F52` 共 52 项前端文案，照做。
注意: Batch 0 删除的组件（Game/Bootcamp/Leaderboard/Signal/MissionControl/TaskPanel）中的条目自动跳过。

### 3-C. Governance 治理块

F140 spec 中 `A-g1` ~ `A-g5` governance sentinel 和正文，照做。
注意: agent guide 中的 governance 标记已在 D7 中完成。

### 3-D. 安装器/启动脚本文案

搜索 `macos/`, `scripts/`, `packaging/` 中残留的猫主题文案。

### Batch 3 验收

F140 spec 中的 grep gate 全绿。手动验收: 新安装用户全链路无猫痕。

---

## Batch 4: 领域模型专项去猫（需设计文档）

> **目标**: 重命名核心类型、API 路由、目录结构
> **风险**: 极高 — 影响 250+ 文件，前后端契约
> **前置**: 必须先完成设计文档并由铲屎官批准

### 设计文档需回答的问题

1. `CatId` → 改为什么？`AgentId`？`MemberId`？
2. JSON schema 中的 `catId` 字段 → 是否改？改了是否需要 API 版本控制？
3. `/api/cats/*` 路由 → `/api/agents/*`？是否需要旧路由 redirect 兼容？
4. `packages/api/src/domains/cats/` 目录 → `agents/`？
5. 数据迁移: Redis 中已存储的 `catId` key 怎么处理？
6. 外部消费者: 是否有第三方依赖当前 API 路径？

### 暂不执行，等 Batch 0-3 完成后单独立项

---

## 排期与并行度

```
Batch 0 (死代码删除)     ──── 可立即开始，独立 PR ────┐
Batch 1 (命名清洁)       ──── Batch 0 之后 ──────────┤
Batch 2 (别名去猫)       ──── Batch 1 之后 ──────────┤  → Batch 3 → Batch 4(需设计)
                                                      │
Agent Guide 更新          ──── ✅ 已完成 ─────────────┘
```

每个 Batch 一个 PR，commit message 格式: `refactor(F140): Batch N — 简述`

## 工作量估算

| Batch | 估算文件数 | 风险 | 预计工时 |
|-------|----------|------|---------|
| 0 | ~130 删除 | 中 | 2-3h |
| 1 | ~15 修改 | 低 | 1h |
| 2 | ~8 修改 | 中 | 1h |
| 3 | ~50 修改 | 低 | 2h |
| 4 | ~250 修改 | 极高 | 需设计文档 |

## 注意事项

1. **pnpm check 不能作为唯一 CI 门禁** — 仓库现存 biome 格式化问题和 `.playwright-browsers` 等未跟踪产物会干扰
2. **不要误提交无关文件** — `office-claw-skills/.playwright-browsers/`, `pptx-craft/*.json` 等
3. **每批只 `git add` 本批文件** — 避免携带脏文件
4. **docs/ 历史文档不改** — ADR、讨论记录保持原样作为审计线索（F140 spec 中已有此约定）
