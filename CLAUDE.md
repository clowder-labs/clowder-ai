# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指导。

## 语言设置

所有回复请使用**简体中文**。

## 代码规范

- 代码注释使用中文
- 变量名保持英文
- 技术文档使用中文撰写

## 项目概述

Clowder AI 是一个多智能体协作平台 —— "猫猫咖啡馆" —— 多个 AI 智能体（Claude、GPT、Gemini、opencode）在共享工作空间中协同工作，具备持久身份、跨模型审查和共享记忆。智能体被称为"猫猫"，人类是"CVO"（首席愿景官）。

## 开发命令

```bash
# 构建所有包（首次启动前必须执行）
pnpm build

# 启动所有服务（Redis + API + 前端）
pnpm start

# 开发模式，热重载（所有包并行）
pnpm dev

# 单独的开发服务器
pnpm --filter @cat-cafe/api run dev     # 仅 API（tsx watch）
pnpm --filter @cat-cafe/web run dev     # 仅 Web（next dev）
```

### 代码质量

```bash
pnpm check           # Biome 检查 + feature/port/profile 校验
pnpm check:fix       # 自动修复 Biome 问题
pnpm lint            # TypeScript 类型检查所有包（tsc --noEmit）
```

### 测试

API 使用 **Node.js 内置测试运行器**（`node --test`），Web 使用 **Vitest**。测试运行在编译后的 `dist/` 输出上 —— 需先构建。

```bash
# 所有包的测试
pnpm test

# API 测试（会先构建）
pnpm --filter @cat-cafe/api run test

# 仅 API 公开测试（排除较慢的 Redis/集成测试）
pnpm --filter @cat-cafe/api run test:public

# 单个测试文件
node --test packages/api/test/some-test.test.js

# Redis 专用隔离测试
pnpm test:api:redis

# Web 测试（Vitest）
pnpm --filter @cat-cafe/web run test
```

## Monorepo 结构

pnpm workspace，`packages/` 下有 5 个包：

| 包 | 用途 | 框架 | 构建 |
|---|------|------|------|
| `api` | 后端 API 服务器 | Fastify + Socket.IO | `tsc` |
| `web` | 前端 Web 应用 | Next.js 14 (App Router) + Tailwind + Zustand | `next build` |
| `shared` | 共享类型、Schema、工具函数 | 纯 TypeScript | `tsc` |
| `mcp-server` | MCP 工具（记忆、线程、信号） | MCP SDK (stdio) | `tsc` |
| `xinsheng-mcp` | 网页抓取 MCP 服务器 | Puppeteer | `tsc` |

### Shared 包导出

`@cat-cafe/shared` 有多个入口：
- `@cat-cafe/shared` — 类型（前端安全，无 Node.js 依赖）
- `@cat-cafe/shared/types` — 类型定义
- `@cat-cafe/shared/schemas` — Zod 校验 Schema
- `@cat-cafe/shared/utils` — 工具函数（包含 Redis 依赖）
- `@cat-cafe/shared/registry` — 猫猫/智能体注册表

**构建顺序重要**：`shared` 必须在 `api` 和 `web` 之前构建（由 workspace 协议处理）。

## 架构

### API 领域结构（`packages/api/src/domains/`）

API 按业务领域组织：
- `cats/services/` — 智能体生命周期、会话管理、编排、数据存储
- `signals/` — 新闻/文章聚合与处理
- `memory/` — 证据存储与搜索
- `workspace/` — 项目上下文管理

### 存储

- **Redis**（端口 6399）：临时状态 —— 会话、队列、投递游标、任务进度
- **SQLite**：持久存储 —— 线程、消息、记忆/证据、待办、工作流 SOP、信号文章

### 智能体通信

- **A2A 消息**：异步智能体间通信，通过线程 @mention 路由
- **MCP**：跨智能体工具共享（Claude 原生支持，其他通过回调桥接）
- **WebSocket/Socket.IO**：向前端推送实时更新

### 前端

Next.js 14 App Router：
- 多线程聊天，支持 @mention 路由
- 富文本块（卡片、diff、检查清单、交互式组件）
- Socket.IO 实时更新
- CodeMirror 代码编辑，xterm.js 终端

## 代码规范

- **格式化**：Biome —— 120 字符行宽、2 空格缩进、单引号、尾逗号
- **文件大小**：200 行警告 / 350 行硬限制
- **禁止 `any` 类型**（Biome 对 `noExplicitAny` 报警告）
- **TypeScript 严格模式**，启用 `noImplicitOverride`
- **编译目标**：ES2022，模块 NodeNext

## Skills 框架

`office-claw-skills/` 包含按需加载的 Prompt 模块。核心 Skills：
- `feat-lifecycle`、`tdd`、`quality-gate`、`request-review`、`merge-gate`
- `manifest.yaml` 是路由的唯一事实来源
- `refs/shared-rules.md` — 核心协作原则

## 安全规则（铁律）

1. 不得删除/清空 Redis、SQLite 或任何持久存储
2. 不得终止父进程或修改启动配置
3. 运行时不得修改 `office-claw-config.json`、`.env` 或 MCP 配置
4. 不得访问本服务以外的 localhost 端口

## 环境配置

- 端口：前端 3003、API 3004、Redis 6399
- `.env` 覆盖 `.inner.env`（加载顺序有影响）
- `CAT_CAFE_SKIP_AUTH=1` 可跳过认证，用于本地调试

## Vendor 目录

- `vendor/dare-cli/` — Python DARE 智能体框架
- `vendor/jiuwenclaw/` — Python ACP 中继（Oh My OpenCode 集成）

## Windows 打包

```bash
pnpm package:windows:bundle           # 构建 bundle（不生成 exe）
pnpm package:windows                  # 完整 bundle + NSIS exe
# 增量构建参数：--skip-build、--skip-python、--launcher-only、--nsis-only
```

新增顶层运行时文件时，需同时更新 `scripts/build-windows-installer.mjs` 中的 `WINDOWS_MANAGED_TOP_LEVEL_PATHS` 和 `copyTopLevelProject()`。
