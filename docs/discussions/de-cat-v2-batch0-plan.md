---
feature_ids: [F140]
related_features: []
topics: [branding, de-cat, dead-code, execution-plan]
doc_kind: plan
created: 2026-04-23
revised: 2026-04-23
---

# F140 v2 Batch 0: Dead Code Removal — Implementation Plan

**Feature:** F140 — `docs/features/F140-de-cat-branding.md`
**Goal:** 物理删除已封堵（Phase F）但代码仍存在的 ~130 个孤儿文件，减少后续去猫化的改动面
**Spec:** `docs/discussions/de-cat-v2-execution-spec.md`
**Acceptance Criteria:**
- [ ] AC1: Game 系统全部代码删除，无编译错误
- [ ] AC2: Voting 全部代码删除，route-serial/route-parallel 中投票逻辑移除
- [ ] AC3: Bootcamp 全部代码删除，ChatContainer 不再渲染 BootcampListModal
- [ ] AC4: Leaderboard 全部代码删除
- [ ] AC5: Signal/Study/Podcast 全部代码删除，MCP 工具摘除，index.ts/AgentRouter/路由中 signalArticleLookup 移除
- [ ] AC6: Mission Control 前端组件全部删除
- [ ] AC7: TaskPanel 删除，ThreadSidebar 不再渲染
- [ ] AC8: 右侧面板组件删除（RightStatusPanel/WorkspacePanel/PlanBoardPanel/SessionChainPanel/AuditExplorerPanel）
- [ ] AC9: `pnpm build` 通过
- [ ] AC10: 相关测试文件清理或删除

**Architecture:** 按功能分 8 个 sub-task，每个 sub-task 内部按"断引用 → 删文件 → 清测试"顺序执行。每个 sub-task 结束后运行 `pnpm build` 确认不破坏编译。
**前端验证:** Yes — 删除后需确认前端正常加载

---

## Review 修订记录

> v2 2026-04-23: 根据 Codex review 修订 5 个问题

| # | 问题 | 修订 |
|---|------|------|
| P1-1 | `callback-bootcamp-routes:19` 引用 `achievement-defs`（leaderboard），先删 leaderboard 会断编译 | **重排执行顺序**：Bootcamp(Task 3) 在 Leaderboard(Task 4) 之前执行 |
| P1-2 | Signal 删除遗漏 `createSignalArticleLookup`（index.ts:90,798）、`AgentRouter` signalArticleLookup、`route-serial/parallel` signal 注入、`scripts/fetch-signals.ts`、`scripts/migrate-signals/` | **Task 5 补充**：增加 5 个断引用步骤 + 2 个额外删除目标 |
| P1-3 | chatStore workspace 字段被 5 个 hooks + 3 个活跃组件使用，不能直接删 | **Task 8 降级**：只删面板组件文件，不动 chatStore/hooks/ChatContainer（移至 Batch 1） |
| P2 | Game 在 index.ts 的引用不只 820-850，还有 877、1242、1359 | **Task 1 补充**：完整覆盖 index.ts 四段 game 引用 |
| P3 | ChatEmptyState 已无 bootcamp 入口 | **Task 3 删除 Step 4.2**（不存在的改动） |

---

## 风险与跨依赖

| 依赖 | 风险 | 处理 |
|------|------|------|
| `callback-bootcamp-routes:19` → `achievement-defs` (leaderboard) | **高** — 先删 leaderboard 会断编译 | 先删 Bootcamp 再删 Leaderboard |
| `index.ts:90,798` → `createSignalArticleLookup` (signals) | **高** — 活跃编译依赖 | Task 5 中先断引用 |
| `AgentRouter.ts` / `route-serial.ts` / `route-parallel.ts` → `signalArticleLookup` | **高** — 活跃路由代码 | Task 5 中移除 signal 注入分支 |
| `route-serial.ts` / `route-parallel.ts` → `vote-intercept.ts` | **高** — 活跃路由代码 | Task 2 中移除投票分支 |
| `threads.ts` 路由中嵌入 bootcamp schema | **中** — 活跃路由 | Task 3 中移除 bootcampState 逻辑 |
| chatStore workspace 字段被 hooks/组件使用 | **中** — 大面积依赖 | Task 8 不动 chatStore，移至 Batch 1 |
| `ConnectorBubble.tsx` → `BallotIcon` | **低** | Task 2 中移除 |
| `MobileStatusSheet.tsx` → `RightStatusPanelProps` 类型 | **低** | Task 8 中移除 type import |

## 执行顺序

**Game → Voting → Bootcamp → Leaderboard → Signal → MissionControl → TaskPanel → Workspace**

理由：
- Game 最独立（路由已摘除，只需断 index.ts/messages.ts）
- Voting 次之（需改活跃路由代码，但范围小）
- **Bootcamp 必须在 Leaderboard 之前**（Bootcamp 引用了 Leaderboard 的 achievement-defs）
- Signal 体量最大 + 有活跃编译依赖需断
- 后三个纯前端

---

## Task 1: Game 系统删除 (~29 files)

### Step 1.1: 断引用 — API 主入口（index.ts 四段）

**Modify:** `packages/api/src/index.ts`
- 移除 line 817: `RedisGameStore` 初始化
- 移除 lines 820-853: game 初始化代码块（`EventEmitterActionNotifier`, `f101SharedDriver`, `GameOrchestrator`, `createGameDriver`, `createWakeCatFn`）
- 移除 lines 877-878: messagesRoutes options 中的 `gameStore`/`autoPlayer` 展开
- 移除 lines 1242-1244: `f101RecoveryPlayer` 声明和 stopAllLoops
- 移除 lines 1359-1363: game recovery 代码块

### Step 1.2: 断引用 — messages 路由

**Modify:** `packages/api/src/routes/messages.ts`
- 移除 lines 35-38 的 game imports（`createGameDriver`, `GameDriver`, `GameOrchestrator`, `WerewolfLobby`）
- 移除 line 86 的 `game-command-interceptor` import
- 移除 line 317+ 的 `/game` 命令处理分支及使用这些 import 的代码

### Step 1.3: 断引用 — services barrel export

**Modify:** `packages/api/src/domains/cats/services/index.ts`
- 移除 lines 35-47 的全部 game 相关 export

### Step 1.4: 断引用 — shared types

**Modify:** `packages/shared/src/types/index.ts`
- 移除 game type export（lines 173-179）

**Delete:** `packages/shared/src/types/game.ts`

### Step 1.5: 删除后端文件

**Delete:**
- `packages/api/src/domains/cats/services/game/` (整个目录，19 files)
- `packages/api/src/routes/games.ts`
- `packages/api/src/routes/game-actions.ts`
- `packages/api/src/routes/game-command-interceptor.ts`
- `packages/api/src/domains/cats/services/stores/redis/RedisGameStore.ts`（如存在）
- `packages/api/src/domains/cats/services/stores/redis-keys/game-keys.ts`（如存在）

### Step 1.6: 删除前端文件

**Delete:**
- `packages/web/src/components/game/` (整个目录)
- `packages/web/src/stores/gameStore.ts`
- `packages/web/src/hooks/useGameApi.ts`
- `packages/web/src/hooks/useGameReconnect.ts`

### Step 1.7: 清测试

**Delete:** 所有 game 相关测试文件（~35 files）:
- `packages/web/src/components/__tests__/god-inspector-buttons.test.ts`
- `packages/web/src/components/__tests__/player-grid-ready-state.test.ts`
- `packages/web/src/components/__tests__/game-result-screen.test.ts`
- `packages/web/src/stores/__tests__/gameStore.test.ts`
- `packages/web/src/hooks/__tests__/useGameApi.test.ts`
- `packages/web/src/hooks/__tests__/useGameReconnect.test.ts`
- `packages/web/src/__tests__/game-thread-switch-recovery.test.ts`
- `packages/api/test/game-*.test.js` (全部)
- `packages/api/test/werewolf-*.test.js` (全部)
- `packages/api/test/create-game-driver.test.js`
- `packages/api/test/event-emitter-action-notifier.test.js`
- `packages/api/test/god-actions.test.js`
- `packages/api/test/wake-cat-impl.test.js`

### Step 1.8: 验证

```bash
pnpm build
```

---

## Task 2: Voting 删除 (~5 files)

### Step 2.1: 断引用 — route-serial.ts（高风险）

**Modify:** `packages/api/src/domains/cats/services/agents/routing/route-serial.ts`
- 移除 line 63: `import { buildVoteTally, checkVoteCompletion, extractVoteFromText, VOTE_RESULT_SOURCE } from './vote-intercept.js';`
- 移除使用这些函数的代码分支（投票检查/投票结果计算逻辑）

### Step 2.2: 断引用 — route-parallel.ts（高风险）

**Modify:** `packages/api/src/domains/cats/services/agents/routing/route-parallel.ts`
- 移除 line 52: `import { buildVoteTally, checkVoteCompletion, extractVoteFromText, VOTE_RESULT_SOURCE } from './vote-intercept.js';`
- 移除使用这些函数的代码分支

### Step 2.3: 断引用 — ConnectorBubble.tsx

**Modify:** `packages/web/src/components/ConnectorBubble.tsx`
- 移除 `import { BallotIcon } from './icons/VoteIcons';`
- 移除 BallotIcon 使用处

### Step 2.4: 删除文件

**Delete:**
- `packages/api/src/routes/votes.ts`
- `packages/api/src/domains/cats/services/agents/routing/vote-intercept.ts`
- `packages/web/src/components/VoteConfigModal.tsx`
- `packages/web/src/components/VoteActiveBar.tsx`
- `packages/web/src/components/icons/VoteIcons.tsx`（如存在）

### Step 2.5: 清测试

**Modify:** 以下测试文件中移除 VoteConfigModal/VoteActiveBar 的 mock：
- `chat-container-recognition-loading.test.tsx`
- `chat-container-inline-authorization.test.tsx`
- `chat-container-auth-gate.test.tsx`
- `chat-container-empty-state.test.tsx`
- `business-theme-token-usage.test.tsx`
- `chat-container-right-panel-hidden.test.tsx`
- `chat-container-pending-send-guard.test.tsx`

**Delete:**
- `packages/web/src/components/__tests__/vote-config-modal.test.ts`
- `packages/web/src/hooks/__tests__/useChatCommands-vote.test.ts`

### Step 2.6: 验证

```bash
pnpm build
```

---

## Task 3: Bootcamp 删除 (~7 files)

> ⚠️ 必须在 Task 4 (Leaderboard) 之前执行，因为 `callback-bootcamp-routes.ts` 引用了 `achievement-defs.ts`

### Step 3.1: 断引用 — ChatContainer.tsx

**Modify:** `packages/web/src/components/ChatContainer.tsx`
- 移除 `import { BootcampListModal } from './BootcampListModal';`
- 移除 `<BootcampListModal>` 渲染及相关 state/handler

### Step 3.2: 断引用 — ThreadSidebar.tsx

**Modify:** `packages/web/src/components/ThreadSidebar/ThreadSidebar.tsx`
- 移除 `BootcampIcon` import 和使用处

### Step 3.3: 断引用 — threads.ts 路由（中风险）

**Modify:** `packages/api/src/routes/threads.ts`
- 移除 bootcamp schema 定义（lines 72-90）
- 移除 bootcampState 初始化和更新逻辑
- 确认 ThreadStore 接口中 `bootcampState` 字段是否需同步清理

### Step 3.4: 删除文件

**Delete:**
- `packages/web/src/components/BootcampListModal.tsx`
- `packages/web/src/components/icons/BootcampIcon.tsx`
- `packages/api/src/routes/bootcamp.ts`
- `packages/api/src/routes/callback-bootcamp-routes.ts`
- `packages/api/src/domains/cats/services/bootcamp/` (整个目录)

### Step 3.5: 清测试

**Modify:** 以下测试文件中移除 BootcampListModal mock：
- `chat-container-recognition-loading.test.tsx`
- `chat-container-inline-authorization.test.tsx`
- `chat-container-auth-gate.test.tsx`
- `chat-container-empty-state.test.tsx`
- `business-theme-token-usage.test.tsx`
- `chat-container-right-panel-hidden.test.tsx`
- `chat-container-pending-send-guard.test.tsx`

**Delete:**
- `packages/api/test/bootcamp-flow.test.js`
- `packages/api/test/callback-bootcamp-state.test.js`

### Step 3.6: 验证

```bash
pnpm build
```

---

## Task 4: Leaderboard 删除 (~12 files)

> ⚠️ 必须在 Task 3 (Bootcamp) 之后执行

### Step 4.1: 断引用 — shared types

**Modify:** `packages/shared/src/types/index.ts`
- 移除 leaderboard 相关 export

**Delete:** `packages/shared/src/types/leaderboard.ts`

### Step 4.2: 删除后端文件

**Delete:**
- `packages/api/src/domains/leaderboard/` (整个目录，7 files，含 achievement-defs.ts 和 game-store.ts)
- `packages/api/src/routes/leaderboard.ts`
- `packages/api/src/routes/leaderboard-events.ts`

### Step 4.3: 删除前端文件

**Delete:**
- `packages/web/src/components/HubLeaderboardTab.tsx`
- `packages/web/src/components/leaderboard-cards.tsx`
- `packages/web/src/components/leaderboard-phase-bc.tsx`

### Step 4.4: 清测试

**Delete:**
- `packages/web/src/components/__tests__/leaderboard-avatar-pipeline.test.tsx`
- `packages/api/test/leaderboard/` (整个目录)

### Step 4.5: 验证

```bash
pnpm build
```

---

## Task 5: Signal/Study/Podcast 删除 (~48 files)

### Step 5.1: 断引用 — API 主入口 index.ts（P1-2 修复）

**Modify:** `packages/api/src/index.ts`
- 移除 line 90: `import { createSignalArticleLookup } from './domains/signals/services/signal-thread-lookup.js';`
- 移除 line 798: `signalArticleLookup: createSignalArticleLookup({ transcriptReader }),`

### Step 5.2: 断引用 — AgentRouter.ts（P1-2 修复）

**Modify:** `packages/api/src/domains/cats/services/agents/routing/AgentRouter.ts`
- 移除 line 160: `signalArticleLookup?` 选项类型定义
- 移除 line 197: `private signalArticleLookup?` 字段
- 移除 line 243: `this.signalArticleLookup = options.signalArticleLookup;`
- 移除 line 640: signalArticleLookup 展开传递

### Step 5.3: 断引用 — route-serial.ts signal 注入（P1-2 修复）

**Modify:** `packages/api/src/domains/cats/services/agents/routing/route-serial.ts`
- 移除 lines 212-215: `if (deps.invocationDeps.signalArticleLookup)` 代码块

### Step 5.4: 断引用 — route-parallel.ts signal 注入（P1-2 修复）

**Modify:** `packages/api/src/domains/cats/services/agents/routing/route-parallel.ts`
- 移除 lines 160-163: `if (deps.invocationDeps.signalArticleLookup)` 代码块

### Step 5.5: 断引用 — invoke-single-cat.ts（P1-2 修复）

**Modify:** `packages/api/src/domains/cats/services/agents/invocation/invoke-single-cat.ts`
- 移除 line 189: `readonly signalArticleLookup?` 类型定义

### Step 5.6: 断引用 — MCP server

**Modify:** `packages/mcp-server/src/server-toolsets.ts`
- 移除 signal 工具注册（lines 128-139）
- 移除 `registerSignalToolset()` 调用

### Step 5.7: 断引用 — shared types

**Modify:** `packages/shared/src/types/index.ts`
- 移除 signal 相关 type export

**Delete:** `packages/shared/src/types/signals.ts`（或包含 signal 类型的文件）

### Step 5.8: 删除后端文件

**Delete:**
- `packages/api/src/domains/signals/` (整个目录，33 files)
- `packages/api/src/routes/signals.ts`
- `packages/api/src/routes/signal-study-routes.ts`
- `packages/api/src/routes/signal-collection-routes.ts`
- `packages/api/src/routes/signal-podcast-routes.ts`
- `packages/api/src/scripts/fetch-signals.ts`（P1-2 修复）
- `packages/api/src/scripts/migrate-signals/` (整个目录)（P1-2 修复）

### Step 5.9: 删除前端文件

**Delete:**
- `packages/web/src/components/signals/` (整个目录，11 files)
- `packages/web/src/utils/signals-api.ts`
- `packages/web/src/utils/signals-view.ts`

### Step 5.10: 清测试

**Delete:**
- `packages/web/src/utils/__tests__/signals-api.test.ts`
- `packages/web/src/utils/__tests__/signals-view.test.ts`
- `packages/web/src/components/__tests__/signal-inbox-view.test.ts`
- `packages/web/src/components/__tests__/signal-article-detail.test.ts`
- `packages/web/src/components/__tests__/signal-article-list.test.ts`
- `packages/web/src/components/__tests__/signal-nav.test.ts`
- `packages/web/src/components/__tests__/signal-sources-view.test.ts`
- `packages/web/src/components/__tests__/study-fold-nav.test.ts`
- `packages/api/test/signal-*.test.js` (全部)

### Step 5.11: 验证

```bash
pnpm build
```

---

## Task 6: Mission Control 前端删除 (~26 files)

### Step 6.1: 删除组件目录

**Delete:**
- `packages/web/src/components/mission-control/` (整个目录，26 files)

### Step 6.2: 清测试

**Delete:**
- `packages/web/src/components/__tests__/mission-control-page.test.ts`
- `packages/web/src/components/__tests__/feature-bird-eye-panel.test.ts`
- `packages/web/src/components/__tests__/workflow-sop-panel.test.ts`
- `packages/web/src/components/__tests__/triage-badge.test.ts`

### Step 6.3: 验证

```bash
pnpm build
```

---

## Task 7: TaskPanel 删除

### Step 7.1: 断引用 — ThreadSidebar.tsx

**Modify:** `packages/web/src/components/ThreadSidebar/ThreadSidebar.tsx`
- 移除 line 19: `import { TaskPanel } from '../TaskPanel';`
- 移除 line 989: `<TaskPanel />`

### Step 7.2: 删除文件

**Delete:**
- `packages/web/src/components/TaskPanel.tsx`

### Step 7.3: 清测试

**Modify:** ThreadSidebar 测试中如有 TaskPanel mock，移除：
- `thread-time-filter.test.ts`
- `sidebar-mobile-close.test.ts`
- `thread-delete-confirm.test.ts`
- `thread-search-empty-state.test.ts`

### Step 7.4: 验证

```bash
pnpm build
```

---

## Task 8: 右侧面板组件删除（降级版）

> ⚠️ P1-3 修复：本 Task 只删面板组件文件。chatStore workspace 字段、useWorkspace 等 5 个 hooks、ChatContainer 中的 workspace 逻辑因被 HubEnvFilesTab/MarkdownContent 等活跃组件依赖，**移至 Batch 1 处理**。

### Step 8.1: 断引用 — MobileStatusSheet.tsx

**Modify:** `packages/web/src/components/MobileStatusSheet.tsx`
- 移除 `import type { RightStatusPanelProps } from './RightStatusPanel';`
- 内联定义所需的 props 类型（如有）

### Step 8.2: 删除面板组件文件

**Delete:**
- `packages/web/src/components/RightStatusPanel.tsx`
- `packages/web/src/components/WorkspacePanel.tsx`
- `packages/web/src/components/PlanBoardPanel.tsx`
- `packages/web/src/components/SessionChainPanel.tsx`
- `packages/web/src/components/audit/AuditExplorerPanel.tsx`
- `packages/web/src/components/audit/index.ts`（如果只有 AuditExplorerPanel 的 re-export）

### Step 8.3: 清测试

**Delete:**
- `packages/web/src/components/__tests__/right-status-panel.test.ts`
- `packages/web/src/components/__tests__/plan-board-panel.test.ts`
- `packages/web/src/components/__tests__/SessionChainPanel-viewSession.test.ts`
- `packages/web/src/components/__tests__/session-chain-panel.test.ts`
- `packages/web/src/components/__tests__/workspace-panel-copy-button.test.ts`
- `packages/web/src/components/__tests__/workspace-panel-reveal-in-tree.test.ts`
- `packages/web/src/components/__tests__/workspace-panel-md-add-to-chat.test.ts`
- `packages/web/src/components/__tests__/workspace-navigate-store.test.ts`
- `packages/web/src/components/audit/__tests__/AuditExplorerPanel.test.ts`
- `packages/web/src/components/__tests__/preview-auto-open-store.test.ts`

### Step 8.4: 验证

```bash
pnpm build
```

---

## 最终验证

所有 Task 完成后：

```bash
# 编译
pnpm build

# 类型检查
pnpm lint

# 确认无残留 import
grep -rn 'from.*game/' packages/web/src/ packages/api/src/ --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v __tests__
grep -rn 'from.*leaderboard' packages/web/src/ packages/api/src/ --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v __tests__
grep -rn 'from.*signals/' packages/web/src/ packages/api/src/ --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v __tests__
grep -rn 'signalArticleLookup' packages/api/src/ --include='*.ts' | grep -v __tests__
grep -rn 'BootcampListModal\|VoteConfigModal\|VoteActiveBar\|TaskPanel\|RightStatusPanel\|WorkspacePanel\|PlanBoardPanel\|SessionChainPanel\|AuditExplorerPanel' packages/web/src/ --include='*.ts' --include='*.tsx' | grep -v __tests__
```

## Commit 策略

按 Task 分 commit（方案 A）：
- `refactor(F140): Batch 0.1 — remove game system dead code`
- `refactor(F140): Batch 0.2 — remove voting dead code`
- `refactor(F140): Batch 0.3 — remove bootcamp dead code`
- `refactor(F140): Batch 0.4 — remove leaderboard dead code`
- `refactor(F140): Batch 0.5 — remove signal/study/podcast dead code`
- `refactor(F140): Batch 0.6 — remove mission control frontend`
- `refactor(F140): Batch 0.7 — remove task panel`
- `refactor(F140): Batch 0.8 — remove workspace panel components`

---

## 不在本 Batch 范围

以下与被删功能相关但**不在本次删除范围**（移至 Batch 1 或 Tier 2）：

| 项目 | 原因 | 归属 |
|------|------|------|
| chatStore workspace 字段 + 5 个 workspace hooks | 被 HubEnvFilesTab/MarkdownContent/ChatContainer 活跃使用 | Batch 1 |
| `useWorkspace`, `usePreviewAutoOpen`, `useGitPanel`, `useGitHealth`, `useFileManagement` | 同上 | Batch 1 |
| `callbacks.ts` 中的 vote/bootcamp 回调死代码 | Phase F 已摘除注册，代码保留低风险 | Batch 1 |
| `chatStore` 中 game/vote/bootcamp 状态分支 | 嵌入复杂 store，单独清理风险高 | Batch 1 |
| `SystemPromptBuilder` 中 bootcamp/signal 注入逻辑 | 条件永不满足，无运行时风险 | Batch 1 |
| 共享类型中被其他功能也引用的通用类型（如 `Achievement`） | 需确认依赖范围 | Batch 1 |
