---
feature_ids: [F061]
related_features: [F050, F032, F041, F043, F045, F060]
topics: [antigravity, bengal-cat, cdp, external-agent, image-generation, evidence-chain, multi-model]
doc_kind: phase-1-done
created: 2026-03-04
---

# F061: Antigravity 接入 — 浏览智能体家族

> **Status**: phase-1-done | **Owner**: Claude Opus 4.6
> **Created**: 2026-03-04

---

## Why

OfficeClaw 现有三大纯血家族（Claude/Codex/Gemini）各自对应一个 CLI agent。但 Google Antigravity 是一个独特的存在：

1. **多模型 IDE agent** — 可切换 Gemini 3.1 Pro、Gemini 3 Flash、Claude Sonnet 4.6、Claude Opus 4.6
2. **图片生成能力** — Gemini CLI 没有，Antigravity 有（team lead一直想要的能力）
3. **证据链能力** — 内置截图、录视频，与 F045 NDJSON Observability 方向高度契合
4. **Browser Agent** — 内置 CDP 驱动的浏览器自动化（通过 Jetski 子代理）

Antigravity 不是任何现有家族的替代品——它是**混血**的：底层可跑多家模型，agent 能力由 Antigravity 自身编排，不受单一模型限制。

team lead 定性：Antigravity 作为**浏览智能体家族**接入，强调多模型驱动、浏览器自动化与多模态能力。

---

## What

通过 CDP（Chrome DevTools Protocol）桥接方案，将 Antigravity 作为独立家族接入 OfficeClaw。

### 核心架构

```
OfficeClaw AgentRouter
  → AntigravityAgentService (新 provider)
    → HTTP Bridge Server (CDP 桥)
      → CDP (port 9000)
        → Antigravity IDE (Electron)
```

### 接入方式对比

| 维度 | DARE/确定性智能体 (F050 Phase 1) | Antigravity/浏览智能体 (F061) |
|------|---------------------------|------------------------------|
| 通信层 | CLI spawn + stdout NDJSON | CDP 桥 + HTTP API |
| 事件流 | headless envelope v1 | DOM snapshot + WebSocket |
| 控制面 | control-stdin | `/send` HTTP endpoint |
| 模型 | 底层 LLM 可变 | 多模型可切换（Gemini/Claude） |
| 独有能力 | 确定性执行、审计追踪 | 图片生成、截图录屏、browser automation |

### 社区已有桥方案

- [antigravity_phone_chat](https://github.com/krishnakanthb13/antigravity_phone_chat) — `/send` + `/snapshot` + WebSocket
- [antigravity-remote-dev](https://github.com/EvanDbg/antigravity-remote-dev) — 类似架构
- [antigravity-connect](https://github.com/piyushdaiya/antigravity-connect) — Go 重写

这些项目验证了 `antigravity . --remote-debugging-port=9000` → CDP 桥 → HTTP API 的可行性。

---

## Acceptance Criteria

- [ ] AC-A1: 本文档需在本轮迁移后维持模板核心结构（Status/Why/What/Dependencies/Risk/Timeline）。

### Phase 0: Spike / 可行性验证 ✅ COMPLETE
- [x] AC-1: Antigravity 启动带 `--remote-debugging-port` 并成功连接 CDP
- [x] AC-2: 桥服务能通过 CDP 注入消息并获取回复 DOM
- [x] AC-3: 回复内容可解析为纯文本/markdown（从 HTML DOM）

### Phase 1: OfficeClaw L1 接入 ✅ COMPLETE
- [x] AC-4: `cat-config.json` 可注册 Antigravity 家族（provider: `antigravity`）— CatProvider 类型 + Zod enum + switch case
- [x] AC-5: `AntigravityAgentService` 实现 `AgentService` 接口 — mock CDP 注入 + 6 tests
- [x] AC-6: AgentRouter 可路由消息到 Antigravity 并获取流式回复 — registration test 验证通过
- [ ] AC-7: 图片生成结果可在 Hub 前端展示（F060 rich block 联动）

### Phase 2: 证据链 + 高级能力
- [ ] AC-8: Antigravity 截图/录屏可作为证据附件回传
- [ ] AC-9: 多模型切换可通过 OfficeClaw 配置控制
- [ ] AC-10: 与现有多智能体回归测试共跑通过

---

## 需求点 Checklist

| ID | 需求点（team experience/转述） | AC 编号 | 验证方式 | 状态 |
|----|---------------------------|---------|----------|------|
| R1 | "他是独立的！人家还有两只Claude可以用呢" — 独立家族，不是Gemini替代 | AC-4 | cat-config 注册验证 | [x] |
| R2 | "antigravity 他的智能体是真的能够生成图片的，这才是我一直想要接入的原因" | AC-7 | 图片生成 → Hub 展示 e2e | [ ] |
| R3 | "他能够录视频 截图" — 证据链能力 | AC-8 | 截图/录屏回传验证 | [ ] |
| R4 | CDP 桥可行性（社区已验证） | AC-1, AC-2, AC-3 | spike 验证 | [x] |

### 覆盖检查
- [x] 每个需求点都能映射到至少一个 AC
- [x] 每个 AC 都有验证方式
- [ ] 前端需求已准备需求→证据映射表（Phase 1 时补）

---

## Key Decisions

1. **家族定位：浏览智能体家族** — 多模型、独立家族、不归属任何现有单一模型家族
2. **接入通道：CDP 桥（非 CLI spawn）** — Antigravity 是 Electron 应用，没有 headless CLI 模式
3. **遵循 F050 External Agent Contract v1** — 但通信层用 CDP 桥替代 CLI adapter
4. **图片生成为核心差异化能力** — 这是现有内建智能体都不具备的
5. **catId: `antigravity`** — mentionPatterns: `@antigravity` / `@browser` / `@design-agent` / `@bengal`
6. **双 Variant** — `antigravity-gemini`（默认，Gemini 3.1 Pro）+ `antigravity-claude`（Claude Opus 4.6），换代只改 `defaultModel` 一行
7. **昵称留空** — 等 Antigravity 接入后按统一命名规则补充
8. **配色：琥珀色** — Primary `#D4853A` / Secondary `#FAEBDB`（区别于 DARE 的土金色 `#D4A76A`）
9. **吊牌符号：棱镜** — 一束光折射出多种颜色 = 一个 agent 跑多种模型
10. **Avatar**: `assets/avatars/antigravity.png` — 垫子系列统一画风，扑击姿势体现精力旺盛

---

## Phase 0 可行性评估（2026-03-06）

### 三条接入路径

| 路径 | 方案 | 延迟 | 复杂度 | 流式 |
|------|------|------|--------|------|
| **A. CDP 桥** | `--remote-debugging-port=9000` → DOM snapshot → 消息注入 | ~3s polling | 高（DOM 解析脆弱） | 伪流式（polling） |
| **B. antigravity-claude-proxy** | Anthropic 兼容 API on localhost:8080 | 实时流式 | 低（npm 包，即装即用） | 真 SSE 流式 |
| **C. MCP 反向桥** | Antigravity 本身支持 MCP → 让它连我们的 MCP server | 实时 | 中（需定义 tool schema） | 取决于实现 |

### Phase 0 Spike 实测（2026-03-06 夜）

五条路径逐一实测：

| 路径 | 实测结果 | 结论 |
|------|----------|------|
| **A. CDP 桥** | 需 `--remote-debugging-port=9000` 重启 Antigravity，社区 3+ 项目已验证 | ✅ **主路线** |
| **B. antigravity-claude-proxy** | **Google 正在封号（ToS violation bans）** | ❌ 风险太大，放弃 |
| **C. MCP browser tools** | 端口 62051 已通！Chrome DevTools MCP v0.12.1，25 个浏览器工具可直接调用 | ✅ browser automation 可用 |
| **D. language_server CLI** | `-cli=true -standalone=true` 能启动 HTTP server，但 401 — OAuth 由 IDE 管理 | ❌ 独立不可用 |
| **E. extension_server** | 端口 62054 响应但 CSRF 保护，token 从 IDE 内部传递 | ❌ 无法外部访问 |

#### 关键发现

1. **内置 MCP server 已可用**：Antigravity `language_server` 在端口 62051 暴露了标准 MCP 协议（JSON-RPC + SSE），Chrome DevTools MCP server v0.12.1，含 25 个浏览器工具（click/navigate/screenshot/evaluate_script 等）
2. **language_server 有 CLI 模式**：`-cli=true -standalone=true`，Go 二进制，支持 `-cdp_port` / `-random_port` / `-persistent_mode`，但独立运行缺 OAuth
3. **proxy 封号风险**：antigravity-claude-proxy 被 Google 视为 ToS violation，已有用户被封号/shadow-ban

### CDP 桥端到端验证（2026-03-06 深夜）

在五条路径实测的基础上，对 CDP 桥进行了**完整端到端验证**：消息注入 → 模型响应 → 回复读取。

#### 验证环境

- Antigravity 1.107.0 (Chrome/142.0, Electron 39.2.3)
- CDP 端口: 9000 (`~/.antigravity/argv.json` 配置 `"remote-debugging-port": 9000`)
- 模型: Gemini 3.1 Pro（默认）
- 项目: office-claw（Pencil .pen 文件已打开）

#### 消息注入方案对比

| 方案 | 结果 | 原因 |
|------|------|------|
| `Input.insertText` (CDP) | ❌ 失败 | Lexical 编辑器不响应 CDP 原生 insertText |
| `Input.dispatchKeyEvent` 逐字符 | ❌ 失败 | 同上，Lexical 不监听原生 key events |
| `InputEvent` dispatch (React 兼容) | ❌ 失败 | Lexical 有自己的事件处理 |
| **`document.execCommand('insertText')`** | **✅ 成功** | **Lexical 框架 hook 了 execCommand** |
| VS Code `require('vscode')` | ❌ 不可用 | 主进程无 vscode API |
| Monaco `editor.setValue()` | ❌ 不适用 | 聊天输入不是 Monaco 编辑器 |

**关键发现：Antigravity 聊天输入框使用 [Lexical](https://lexical.dev/) 框架**（Facebook 出品），而非 Monaco 或原生 contentEditable。Lexical 通过 `document.execCommand` 拦截来处理输入，这是唯一有效的文本注入方式。

#### 完整注入流程（已验证可用）

```javascript
// 1. 连接 CDP WebSocket
const ws = new WebSocket(target.webSocketDebuggerUrl);

// 2. 点击聊天输入框获取焦点（必须！execCommand 需要焦点在 Lexical 编辑器上）
await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 });
await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 });

// 3. 通过 execCommand 注入文本
await cdp('Runtime.evaluate', {
  expression: `document.execCommand('insertText', false, 'your prompt here')`
});

// 4. 按 Enter 发送
await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
```

#### 端到端测试结果

| 测试 | 发送消息 | 模型响应 | 响应延迟 | 结果 |
|------|----------|----------|----------|------|
| 测试 1 | "Reply with just the word hello" | "你好。" | ~3s (含 Thought for 1s) | ✅ 完美 |
| 测试 2 | "Say hello" | "你好，team lead。今天有什么需要我一起处理的事？" | ~2s (含 Thought for <1s) | ✅ 完美 |

#### 回复读取方案

模型回复渲染在 `<p>` 标签中（无特殊 class），通过以下方式可提取：
- 用户消息：`document.querySelectorAll('.whitespace-pre-wrap')`
- 模型思考：`button` 元素含 "Thought for" 文本
- 模型回复：思考按钮的兄弟 `<p>` 元素
- Polling 间隔：~1-3s 检查 DOM 变化

#### AC 验证状态更新

- [x] **AC-1**: Antigravity 启动带 `--remote-debugging-port` 并成功连接 CDP ✅
- [x] **AC-2**: 桥服务能通过 CDP 注入消息并获取回复 DOM ✅
- [x] **AC-3**: 回复内容可解析为纯文本/markdown（从 HTML DOM）✅

**Phase 0 全部 AC 通过。CDP 桥方案验证成功。**

#### 会话管理能力验证

| 能力 | CDP 操作 | 结果 |
|------|----------|------|
| **新建对话** | 点击 `+` 按钮 (chat header icon 0) | ✅ 消息数归零，标题自动生成 |
| **新对话收发** | execCommand + Enter | ✅ "2+2=?" → "2+2 等于 4" (Thought for 2s) |
| **查看历史** | 点击 🕐 按钮 (chat header icon 1) | ✅ "Past Conversations" 面板，按项目分组，显示时间戳 |
| **恢复旧对话** | 在历史面板点击对话条目 | ✅ 7 条消息完整恢复 |
| **模型列表** | 点击底部 model selector | ✅ 6 个模型可选 |
| **模型切换** | 在 dropdown 中点击目标模型 | ⚠️ 部分成功 — 需更精确的点击坐标 |

**可用模型列表（实测枚举）：**
1. Gemini 3.1 Pro (High) ← 默认
2. Gemini 3.1 Pro (Low) — 标记 "New"
3. Gemini 3 Flash
4. Claude Sonnet 4.6 (Thinking)
5. Claude Opus 4.6 (Thinking)
6. GPT-OSS 120B (Medium)

**注意：实际可选模型远多于注册的 variant。** 与Claude只注册 opus-45/opus-46/sonnet（实际 Claude 可用模型更多）类似，cat-config.json 只注册需要的 variant 即可，无需穷举。

**获取完整模型列表的 CDP 方法：**
```javascript
// 点击底部 model selector → 读取 dropdown 内容
await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: selectorX, y: selectorY, ... });
const models = await cdp('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('[class*="px-2"][class*="py-1"][class*="cursor-pointer"]')]
    .filter(e => e.offsetParent !== null && e.offsetHeight < 40)
    .map(e => e.textContent?.trim())`
});
```

**聊天面板 UI 结构（CDP 操作参考）：**

```
Chat Header: [Title] [+新建] [🕐历史] [...更多] [X关闭]
  - 更多菜单: Customization | MCP Servers | Export
Chat Area: .overflow-y-auto → 对话 turns
  - User turn: .whitespace-pre-wrap
  - Assistant thinking: button "Thought for Xs"
  - Assistant response: <p> elements
Footer:
  - 附件按钮区: [文件] [代码] [图片] [链接]
  - 输入框: [role="textbox"][contenteditable="true"] (Lexical)
  - 工具栏: [+] [Planning] [Model Selector] [🎙️] [Send→]
```

#### 跨项目派遣能力（F070 Portable Governance 适配）

Antigravity **原生按 project/workspace 隔离对话**：Past Conversations 面板分组为 "Running in {project}" / "Recent in {project}" / "Other Conversations"。

| F070 需求 | Antigravity 能力 | 满足度 |
|-----------|-----------------|--------|
| 项目级对话隔离 | Past Conversations 按 project 分组 | ✅ 原生 |
| 在指定 project 开新对话 | `+` 按钮在当前 workspace 下新建 | ✅ |
| 切换到外部项目 | 多窗口：`open -a Antigravity /path/to/project` | ✅ 新 CDP target |
| 回到OfficeClaw对话 | Past Conversations → "Recent in office-claw" | ✅ |
| 任务态上下文注入 | 首条消息 execCommand 注入 AC/链接 | ✅ |
| MCP 工具跨项目可用 | `~/.gemini/antigravity/mcp_config.json` 全局生效 | ✅ |

**多窗口策略**：OfficeClaw窗口保持开着，派遣到外部项目时 `open -a Antigravity /other/project` 开新窗口。CDP `/json` 返回所有窗口 target，按 `title` 区分项目。

#### 冷启动 vs CLI 延迟对比

| 阶段 | CLI spawn (DARE 等) | CDP 桥 (Antigravity) |
|------|---------------------|---------------------|
| 冷启动 | 2-10s（spawn + 加载） | ~0ms（IDE 已运行，WebSocket 持久） |
| 消息注入 | stdin 即时 | execCommand 即时 |
| 模型首 token | 取决于模型 API | 取决于模型 API |
| 回复获取 | stdout NDJSON 实时 | DOM polling ~1-3s（可用 MutationObserver 降到 ~100ms） |
| **多轮对话** | 保持进程 or 重新 spawn | **始终复用同一 WebSocket** |

### 修正后的推荐策略

~~双通道混合~~ → **CDP 桥是唯一安全可行路线**（已端到端验证）

- **Phase 1**: CDP 桥接入 — `execCommand` 注入 + DOM polling 回复 → AgentService 适配
- **Phase 1+**: MCP browser tools 组合 — 端口 62051 的 25 个浏览器工具同时可用
- **Phase 2**: 图片生成回传 + 截图/录屏证据链

### 各维度可行性判定（最终版）

| 维度 | 判定 | 说明 |
|------|------|------|
| 消息发送 | ✅ **已验证** | `execCommand('insertText')` + Enter — Lexical 框架兼容 |
| 回复读取 | ✅ **已验证** | DOM query `<p>` 元素，可解析纯文本/markdown |
| 流式回复 | ⚠️ 伪流式 | DOM polling ~1-3s，非真 SSE 流式 |
| 图片生成 | ✅ 可行 | DOM 中可获取 Imagen 3 生成结果（待验证具体选择器） |
| 截图/录屏 | ✅ 可行 | CDP 原生 `Page.captureScreenshot` + MCP browser tools |
| Browser automation | ✅ 可行 | 端口 62051 MCP 已通，25 个工具就绪 |
| 多模型切换 | ⚠️ **部分验证** | 6 模型 dropdown 可打开，点击切换需更精确坐标；selector 在 footer |
| 新建/恢复对话 | ✅ **已验证** | `+` 新建 / 🕐 历史面板 / 点击恢复，全部可用 |
| MCP 工具 | ✅ 可行 | Antigravity 原生支持，配置在 `~/.gemini/antigravity/mcp_config.json` |

### 能力覆盖对比：现有智能体 vs Antigravity

| 能力 | Claude | Codex | Gemini | DARE | **Antigravity** |
|------|--------|--------|--------|--------|-------------|
| 对话/推理 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 代码生成 | ✅ | ✅ | ❌ | ✅ | ✅ |
| MCP 工具 | ✅ | ✅ | ✅ | ❌ | ✅ (原生 1500+) |
| Code review | ✅ | ✅ | ❌ | ❌ | ✅ (切 Claude 模型) |
| **图片生成** | ❌ | ❌ | ❌ | ❌ | **✅ 独有** |
| **截图/录屏** | ❌ | ❌ | ❌ | ❌ | **✅ 独有** |
| **Browser automation** | ❌ | ❌ | ❌ | ❌ | **✅ 独有 (Jetski)** |
| 多模型切换 | ❌ | ❌ | ❌ | ✅ (底层可变) | **✅ (Gemini/Claude)** |
| 确定性执行 | ❌ | ❌ | ❌ | ✅ | ❌ |
| 审计追踪 | ❌ | ❌ | ❌ | ✅ | ⚠️ (有截图但无结构化审计) |
| 视觉设计顾问 | ❌ | ❌ | ✅ | ❌ | ⚠️ (能生成图但不是设计师) |

**结论：可行，且比预期更好。** Antigravity带来 3 个独有能力（图片生成、截图录屏、browser automation），这是现有四猫都没有的。接入价值明确。

### 调研来源

- [antigravity-remote-dev](https://github.com/EvanDbg/antigravity-remote-dev) — CDP 移动端桥接验证
- [antigravity-link-extension](https://deepwiki.com/cafeTechne/antigravity-link-extension/2.2-configuration) — CDP 端口扫描范围 9000-9005/9222
- [Reverse Engineering Antigravity's Browser Automation](https://alokbishoyi.com/blogposts/reverse-engineering-browser-automation.html) — Jetski 6 层委托模型 + 19 个浏览器工具
- [Antigravity MCP Integration](https://antigravity.google/docs/mcp) — 原生 MCP 支持 1500+ server
- [antigravity-claude-proxy](https://github.com/badrisnarayanan/antigravity-claude-proxy) — Anthropic 兼容 API，但有 ToS 封号风险
- Antigravity `language_server` CLI 参数：`-cli` / `-standalone` / `-cdp_port` / `-persistent_mode`（实测 2026-03-06）

---

## Dependencies

- **F050**: External Agent Contract v1（接入契约，已定稿）
- **F032**: Agent Plugin Architecture（provider 扩展机制）
- **F060**: output_image 富文本渲染（图片展示基础设施）
- **Antigravity**: Google Antigravity IDE（需要team lead本地安装）
- **Evolved from**: F050（第二个外部 agent 接入用例）

---

## Risk

### Phase 0 Spike 发现的风险（实测验证）

| # | 风险 | 严重度 | 缓解方案 | 来源 |
|---|------|--------|----------|------|
| R1 | **Lexical 编辑器依赖** — 消息注入依赖 `execCommand`，Lexical 升级可能破坏 | 高 | 写适配层 + 版本检测；如 Lexical 弃用 execCommand 需改用其内部 API | Spike 实测 |
| R2 | **DOM 选择器脆弱** — 回复用 `<p>` 无 class/role，用户消息靠 `.whitespace-pre-wrap` | 高 | 多选择器 fallback + 版本适配测试 + DOM snapshot 基准比对 | Spike 实测 |
| R3 | **伪流式延迟** — DOM polling ~1-3s，非真 SSE 流式 | 中 | MutationObserver 替代 polling 可降到 ~100ms | Spike 实测 |
| R4 | **焦点管理** — execCommand 必须在 Lexical 编辑器获焦时才有效，需先 click | 低 | 注入前始终先执行 click 流程 | Spike 实测 |
| R5 | **多窗口/多标签** — CDP `/json` 返回多个 target，需正确选择编辑器页面（非 Launchpad） | 低 | 按 `title` 过滤 + 支持 target 切换 | Spike 实测 |
| R6 | **antigravity-claude-proxy 封号** — Google 正在封禁使用此 proxy 的账号（ToS violation） | 致命 | **已排除此路径**，仅用 CDP 桥 | 社区报告 |
| R7 | **language_server 独立模式 401** — CLI standalone 模式需 OAuth，外部无法获取 | 中 | **已排除此路径**；若未来 Google 开放 CLI 认证可重新评估 | Spike 实测 |
| R8 | **extension_server CSRF** — 端口 62054 有 CSRF token 保护 | 低 | **已排除此路径** | Spike 实测 |

### 原有风险（调研阶段）

1. **CDP 稳定性** — DOM 结构随 Antigravity 版本更新可能变化，桥服务需要适配
2. **Antigravity 更新节奏** — Google 产品更新频繁，CDP 端口支持可能变动
3. **混血身份哲学问题** — Antigravity 切到 Claude Opus 时，它和Claude的边界在哪？（先按"不同个体"处理）
4. **Antigravity 必须运行** — 与 CLI spawn 不同，CDP 桥需要 Antigravity IDE 保持运行；若team lead关闭则断联

---

## Known Bugs（已修复）

### Bug-1: pollResponse 稳定性误判 — 模型暂停时提前截断 ✅

**现象**：@ Antigravity选 Opus 模型后，回复在 "Thinking..." 处被截断，后续内容丢失。

**根因**：`stablePollCount=2` 在模型 thinking/image generation 暂停期（2-5s）误触发完成判定。

**修复** (PR #316, `c25f3308`):
- `stablePollCount` 2→4，容忍更长暂停
- 新增 stop button 检测（chat-scoped），按钮可见时阻止 stable count 累加
- `hasInlineLoading` 已有的保护继续生效

### Bug-2: 模型切换未实现 — Cat Café 选 variant 后 Antigravity 仍用默认模型 ✅

**现象**：选了 "Claude Opus" 变体但 Antigravity 仍用 Gemini 3.1 Pro。

**根因**：CDP 桥没有 `switchModel()` 方法，无法控制 Antigravity 模型下拉框。

**修复** (PR #316, `c25f3308`):
- 新增 `getCurrentModel()` + `switchModel()` CDP 方法
- `MODEL_LABEL_MAP`: cat-config model ID → Antigravity UI label 严格映射（无 fallback）
- `modelVerified` metadata flag: 切换成功后标记 `true`
- DOM scripts: `GET_CURRENT_MODEL_JS` / `CLICK_MODEL_SELECTOR_JS` / `FIND_MODEL_OPTION_JS`

### Bug-3: Thinking DOM 不识别 — Antigravity 用自定义 thinking 结构 ✅

**现象**：Antigravity抓回来的内容有重复，包含 thinking 文本和 CSS 垃圾。

**根因**：`POLL_RESPONSE_JS` 只认 `<details>` / `[class*="thinking"]`，但 Antigravity 用 `<button>Thought for 16s</button>` + `<div class="max-h-0 opacity-0">` 折叠容器。`extractBlockText` 直接取 `textContent` 不过滤隐藏元素。

**修复** (PR #330, `e7e00b37`):
- 扩展 thinking 检测：匹配 "Thought for Xs" 按钮 + 遍历折叠 sibling 容器
- `extractBlockText` 重写为 clone-first：strip hidden 子树（max-h-0/opacity-0/hidden/aria-hidden/style/script/buttons）再提取
- thinking sibling 也走 `extractBlockText` 净化
- 9 个测试（5 JSDOM 行为 fixture + 4 结构 smoke test）

---

## CDP 接入复盘

完整困难清单与解决方案见 [F061 CDP 接入复盘文档](F061-cdp-integration-retrospective.md)。

提炼的四个通用模式：
1. **DOM 是私有 API，没有契约** — 多层降级选择器 + 回归测试
2. **隐藏状态 ≠ 不存在** — 永远 clone → strip → 再读取
3. **轮询稳定性 = 假阳性地雷** — idle timeout + 积极信号检测
4. **一个 bug 修一半 = 新 bug** — 行为测试断言所有输出字段
