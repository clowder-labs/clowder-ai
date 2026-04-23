---
feature_ids: [F140]
related_features: []
topics: [branding, de-cat, dead-code, execution-plan]
doc_kind: plan
created: 2026-04-23
---

# F140 v2 Batch 0: Dead Code Removal — Implementation Plan

**Feature:** F140 — `docs/features/F140-de-cat-branding.md`
**Goal:** 物理删除已封堵（Phase F）但代码仍存在的 ~130 个孤儿文件，减少后续去猫化的改动面
**Spec:** `docs/discussions/de-cat-v2-execution-spec.md`
**Acceptance Criteria:**
- [ ] AC1: Game 系统全部代码删除，无编译错误
- [ ] AC2: Leaderboard 全部代码删除
- [ ] AC3: Voting 全部代码删除，route-serial/route-parallel 中投票逻辑移除
- [ ] AC4: Bootcamp 全部代码删除，ChatContainer 不再渲染 BootcampListModal
- [ ] AC5: Signal/Study/Podcast 全部代码删除，MCP 工具摘除
- [ ] AC6: Mission Control 前端组件全部删除
- [ ] AC7: TaskPanel 删除，ThreadSidebar 不再渲染
- [ ] AC8: 右侧 Workspace 面板删除（RightStatusPanel/WorkspacePanel/PlanBoardPanel/SessionChainPanel/AuditExplorerPanel）
- [ ] AC9: `pnpm build` 通过
- [ ] AC10: 相关测试文件清理或删除

**Architecture:** 按功能分 8 个 sub-task，每个 sub-task 内部按"断引用 → 删文件 → 清测试"顺序执行。每个 sub-task 结束后运行 `pnpm build` 确认不破坏编译。
**前端验证:** Yes — 删除后需确认前端正常加载

---

## 风险与跨依赖

执行前必须注意的跨模块依赖：

| 依赖 | 风险 | 处理 |
|------|------|------|
| `route-serial.ts` 和 `route-parallel.ts` import `vote-intercept.ts` | 高 — 这是活跃路由代码 | 移除投票逻辑分支，保留路由主逻辑 |
| `threads.ts` 路由中嵌入 bootcamp schema | 中 — 活跃路由 | 移除 bootcampState 相关字段和逻辑 |
| `ConnectorBubble.tsx` import `BallotIcon` | 低 | 移除该 import 和使用处 |
| `MobileStatusSheet.tsx` import `RightStatusPanelProps` 类型 | 低 | 移除 type import |
| `leaderboard-service.ts` import `game-store.ts` | 无 — 两者同时删 | 同时删除即可 |
| `callback-bootcamp-routes.ts` import `achievement-defs.ts` | 无 — 两者同时删 | 同时删除即可 |

## 执行顺序

建议顺序：Leaderboard → Game → Voting → Bootcamp → Signal → MissionControl → TaskPanel → Workspace

理由：Leaderboard 最独立（零外部引用），先删验证流程；Game 次之；Voting 和 Bootcamp 有嵌入引用需小心；Signal 体量最大；后三个纯前端。

---

## Task 1: Leaderboard 删除 (~12 files)

### Step 1.1: 断引用 — shared types

**Files:**
- Modify: `packages/shared/src/types/index.ts` — 移除 leaderboard 相关 export
- Delete: `packages/shared/src/types/leaderboard.ts`

### Step 1.2: 删除后端文件

**Delete:**
- `packages/api/src/domains/leaderboard/` (整个目录，7 files)
- `packages/api/src/routes/leaderboard.ts`
- `packages/api/src/routes/leaderboard-events.ts`

### Step 1.3: 删除前端文件

**Delete:**
- `packages/web/src/components/HubLeaderboardTab.tsx`
- `packages/web/src/components/leaderboard-cards.tsx`
- `packages/web/src/components/leaderboard-phase-bc.tsx`

### Step 1.4: 清测试

**Delete:**
- `packages/web/src/components/__tests__/leaderboard-avatar-pipeline.test.tsx`
- `packages/api/test/leaderboard/` (整个目录)

### Step 1.5: 验证

```bash
pnpm build
```

---

## Task 2: Game 系统删除 (~29 files)

### Step 2.1: 断引用 — API 主入口

**Modify:** `packages/api/src/index.ts`
- 移除 game 初始化代码块（约 lines 820-850）：
  - `EventEmitterActionNotifier` import
  - `f101SharedDriver` 声明
  - `GameOrchestrator` import
  - `createGameDriver` import
  - `createWakeCatFn` import

### Step 2.2: 断引用 — messages 路由

**Modify:** `packages/api/src/routes/messages.ts`
- 移除 lines 35-38 的 game imports
- 移除 line 86 的 game-command-interceptor import
- 移除使用这些 import 的代码块

### Step 2.3: 断引用 — services barrel export

**Modify:** `packages/api/src/domains/cats/services/index.ts`
- 移除 lines 35-47 的全部 game 相关 export

### Step 2.4: 断引用 — shared types

**Modify:** `packages/shared/src/types/index.ts`
- 移除 game type export（lines 173-179）

**Delete:** `packages/shared/src/types/game.ts`

### Step 2.5: 删除后端文件

**Delete:**
- `packages/api/src/domains/cats/services/game/` (整个目录，19 files)
- `packages/api/src/routes/games.ts`
- `packages/api/src/routes/game-actions.ts`
- `packages/api/src/routes/game-command-interceptor.ts`
- `packages/api/src/domains/cats/services/stores/redis/RedisGameStore.ts`（如存在）
- `packages/api/src/domains/cats/services/stores/redis-keys/game-keys.ts`（如存在）

### Step 2.6: 删除前端文件

**Delete:**
- `packages/web/src/components/game/` (整个目录)
- `packages/web/src/stores/gameStore.ts`
- `packages/web/src/hooks/useGameApi.ts`
- `packages/web/src/hooks/useGameReconnect.ts`

### Step 2.7: 清测试

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

### Step 2.8: 验证

```bash
pnpm build
```

---

## Task 3: Voting 删除 (~5 files)

### Step 3.1: 断引用 — route-serial.ts（高风险）

**Modify:** `packages/api/src/domains/cats/services/agents/routing/route-serial.ts`
- 移除 line 63: `import { buildVoteTally, checkVoteCompletion, extractVoteFromText, VOTE_RESULT_SOURCE } from './vote-intercept.js';`
- 移除使用这些函数的代码分支（投票检查/投票结果计算逻辑）

### Step 3.2: 断引用 — route-parallel.ts（高风险）

**Modify:** `packages/api/src/domains/cats/services/agents/routing/route-parallel.ts`
- 移除 line 52: `import { buildVoteTally, checkVoteCompletion, extractVoteFromText, VOTE_RESULT_SOURCE } from './vote-intercept.js';`
- 移除使用这些函数的代码分支

### Step 3.3: 断引用 — ConnectorBubble.tsx

**Modify:** `packages/web/src/components/ConnectorBubble.tsx`
- 移除 `import { BallotIcon } from './icons/VoteIcons';`
- 移除 BallotIcon 使用处

### Step 3.4: 删除文件

**Delete:**
- `packages/api/src/routes/votes.ts`
- `packages/api/src/domains/cats/services/agents/routing/vote-intercept.ts`
- `packages/web/src/components/VoteConfigModal.tsx`
- `packages/web/src/components/VoteActiveBar.tsx`
- `packages/web/src/components/icons/VoteIcons.tsx`（如存在）

### Step 3.5: 清测试

**Modify:** 以下测试文件中移除 VoteConfigModal/VoteActiveBar 的 mock：
- `chat-container-recognition-loading.test.tsx`
- `chat-container-inline-authorization.test.tsx`
- `chat-container-auth-gate.test.tsx`
- `chat-container-empty-state.test.tsx`
- `business-theme-token-usage.test.tsx`
- `chat-container-right-panel-hidden.test.tsx`
- `chat-container-pending-send-guard.test.tsx`
- `game-thread-switch-recovery.test.ts`（如果 Task 2 没删掉的话）

**Delete:**
- `packages/web/src/components/__tests__/vote-config-modal.test.ts`
- `packages/web/src/hooks/__tests__/useChatCommands-vote.test.ts`

### Step 3.6: 验证

```bash
pnpm build
```

---

## Task 4: Bootcamp 删除 (~7 files)

### Step 4.1: 断引用 — ChatContainer.tsx

**Modify:** `packages/web/src/components/ChatContainer.tsx`
- 移除 line 32: `import { BootcampListModal } from './BootcampListModal';`
- 移除 `<BootcampListModal>` 渲染（约 line 941-945）
- 移除相关 state/handler

### Step 4.2: 断引用 — ChatEmptyState.tsx

**Modify:** `packages/web/src/components/ChatEmptyState.tsx`
- 移除训练营入口按钮/文案

### Step 4.3: 断引用 — ThreadSidebar.tsx

**Modify:** `packages/web/src/components/ThreadSidebar/ThreadSidebar.tsx`
- 移除 `BootcampIcon` import 和使用处

### Step 4.4: 断引用 — threads.ts 路由（中风险）

**Modify:** `packages/api/src/routes/threads.ts`
- 移除 bootcamp schema 定义（lines 72-90）
- 移除 bootcampState 初始化和更新逻辑
- 注意：`bootcampState` 是 thread 数据模型的一部分，需要确认 ThreadStore 接口是否需要同步清理

### Step 4.5: 删除文件

**Delete:**
- `packages/web/src/components/BootcampListModal.tsx`
- `packages/web/src/components/icons/BootcampIcon.tsx`
- `packages/api/src/routes/bootcamp.ts`
- `packages/api/src/routes/callback-bootcamp-routes.ts`
- `packages/api/src/domains/cats/services/bootcamp/` (整个目录)

### Step 4.6: 清测试

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

### Step 4.7: 验证

```bash
pnpm build
```

---

## Task 5: Signal/Study/Podcast 删除 (~48 files)

### Step 5.1: 断引用 — MCP server

**Modify:** `packages/mcp-server/src/server-toolsets.ts`
- 移除 signal 工具注册（lines 128-139）
- 移除 `registerSignalToolset()` 调用

### Step 5.2: 断引用 — shared types

**Modify:** `packages/shared/src/types/index.ts`
- 移除 signal 相关 type export（SignalArticle, SignalSource, SignalTier, StudyMeta 等）

**Delete:** `packages/shared/src/types/signals.ts`（或包含 signal 类型的文件）

### Step 5.3: 删除后端文件

**Delete:**
- `packages/api/src/domains/signals/` (整个目录，33 files)
- `packages/api/src/routes/signals.ts`
- `packages/api/src/routes/signal-study-routes.ts`
- `packages/api/src/routes/signal-collection-routes.ts`
- `packages/api/src/routes/signal-podcast-routes.ts`

### Step 5.4: 删除前端文件

**Delete:**
- `packages/web/src/components/signals/` (整个目录，11 files)
- `packages/web/src/utils/signals-api.ts`
- `packages/web/src/utils/signals-view.ts`

### Step 5.5: 清测试

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

### Step 5.6: 验证

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

## Task 8: 右侧 Workspace 面板删除

### Step 8.1: 断引用 — MobileStatusSheet.tsx

**Modify:** `packages/web/src/components/MobileStatusSheet.tsx`
- 移除 `import type { RightStatusPanelProps } from './RightStatusPanel';`
- 如果 MobileStatusSheet 依赖该类型，需要内联定义或移除相关代码

### Step 8.2: 断引用 — chatStore.ts

**Modify:** `packages/web/src/stores/chatStore.ts`
- 移除 `rightPanelMode` 状态和 setter
- 移除 `workspaceWorktreeId`, `workspaceOpenTabs`, `workspaceOpenFilePath`, `workspaceOpenFileLine`, `workspaceEditToken` 状态

### Step 8.3: 断引用 — ChatContainer.tsx

**Modify:** `packages/web/src/components/ChatContainer.tsx`
- 移除 workspace 相关 state 使用
- 移除 `workspaceWorktreeId` navigation 逻辑（line 357-359）

### Step 8.4: 删除文件

**Delete:**
- `packages/web/src/components/RightStatusPanel.tsx`
- `packages/web/src/components/WorkspacePanel.tsx`
- `packages/web/src/components/PlanBoardPanel.tsx`
- `packages/web/src/components/SessionChainPanel.tsx`
- `packages/web/src/components/audit/AuditExplorerPanel.tsx`
- `packages/web/src/components/audit/index.ts`（如果只有 AuditExplorerPanel 的 re-export）

### Step 8.5: 清测试

**Delete:**
- `packages/web/src/components/__tests__/right-status-panel.test.ts`
- `packages/web/src/components/__tests__/plan-board-panel.test.ts`
- `packages/web/src/components/__tests__/SessionChainPanel-viewSession.test.ts`
- `packages/web/src/components/__tests__/session-chain-panel.test.ts`
- `packages/web/src/components/__tests__/workspace-panel-copy-button.test.ts`
- `packages/web/src/components/__tests__/workspace-panel-reveal-in-tree.test.ts`
- `packages/web/src/components/__tests__/workspace-panel-md-add-to-chat.test.ts`
- `packages/web/src/components/audit/__tests__/AuditExplorerPanel.test.ts`

### Step 8.6: 验证

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
grep -rn 'BootcampListModal\|VoteConfigModal\|VoteActiveBar\|TaskPanel\|RightStatusPanel\|WorkspacePanel\|PlanBoardPanel\|SessionChainPanel\|AuditExplorerPanel' packages/web/src/ --include='*.ts' --include='*.tsx' | grep -v __tests__
```

## Commit 策略

**方案 A（推荐）：按 Task 分 commit**
每个 Task 完成后单独 commit，方便定位问题和 rollback：
- `refactor(F140): Batch 0.1 — remove leaderboard dead code`
- `refactor(F140): Batch 0.2 — remove game system dead code`
- `refactor(F140): Batch 0.3 — remove voting dead code`
- `refactor(F140): Batch 0.4 — remove bootcamp dead code`
- `refactor(F140): Batch 0.5 — remove signal/study/podcast dead code`
- `refactor(F140): Batch 0.6 — remove mission control frontend`
- `refactor(F140): Batch 0.7 — remove task panel`
- `refactor(F140): Batch 0.8 — remove workspace panels`

**方案 B：合并为一个 commit**
如果铲屎官觉得太碎，可以合为一个：
- `refactor(F140): Batch 0 — remove sealed feature dead code (~130 files)`

---

## 不在本 Batch 范围

以下与被删功能相关但**不在本次删除范围**：
- `packages/api/src/routes/callbacks.ts` 中的 vote/bootcamp 回调（Phase F 已摘除注册，代码保留）
- `chatStore` 中 game/vote/bootcamp 相关状态分支（嵌入在复杂 store 中，单独清理风险高）
- `SystemPromptBuilder` 中的 bootcamp/signal 注入逻辑（条件永不满足，无运行时风险）
- `packages/api/src/routes/index.ts` 中残留的注释掉的 export（如果有）
- 共享类型中被其他活跃功能也引用的通用类型（如 `Achievement` 可能被其他系统引用）

这些留给后续 Batch 或 Tier 2 处理。
