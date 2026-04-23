---
feature_ids: []
topics:
  - de-cat
  - remediation
  - packaging
  - frontend
  - runtime
  - api
doc_kind: discussion
created: 2026-04-11
---

# Office Claw 第二轮术语收口实施计划（仅限最终打包暴露面）

> 目标：本轮**不追求去除仓库中的所有历史命名**，只处理**最终打出来的安装包中会暴露给用户、运维使用者、前端界面或运行时日志/通知的旧术语**。  
> 适用仓库：`D:\ai\jiuwen\relay-claw`  
> 关联旧文档：`docs/discussions/de-cat-remediation.md`  
> 暴露面参考：安装目录审查文档 `workspace/docs/discussions/branding-elements-audit.md`  
> 日期：2026-04-11

---

## 0. 当前进展（基于 `feat/de-cat`）

以下状态基于当前 `feat/de-cat` 分支截至本轮修改后的实际情况整理。

### 0.1 已实施

以下工作已经在 `feat/de-cat` 上完成，并已进入代码：

1. 安装包配置模板文案中性化

- `.env.example` 已将以下暴露文案改为中性表达：
  - `OfficeClaw / OfficeClaw` → `OfficeClaw / OfficeClaw`
  - `智能体咖啡环境配置` → `OfficeClaw 环境配置`
  - `cat invocation` / `猫调用` → `agent invocation` / `智能体调用`
  - `Chat with cats ...` → `Chat with agents ...`
  - `cats need your attention` → `agents need your attention`

2. 安装包默认展示路径中性化

- `.env.example` 中的用户可见路径已改为 `.office-claw`
- `RELAY_TEAMS_CONFIG_DIR` 的默认展示值已改为 `~/.office-claw/.relay-teams`

3. 前端用户可见 SVG 资源中性化

- `packages/web/public/avatars/assistant.svg` 已替换为中性助手形象
- `packages/web/public/avatars/office.svg` 已替换为中性办公图形
- `packages/web/public/images/longcat.svg` 已替换为中性 `TaskList` 图标

4. Worker 默认通知文案和默认 tag 中性化

- `packages/web/worker/index.ts` 已完成：
  - `OfficeClaw Service Worker` → `OfficeClaw Service Worker`
  - 默认标题改为 `新消息`
  - 默认 tag 改为 `office-claw-default`
  - 窗口注释文案同步改为 `OfficeClaw`

5. 通知策略兼容新旧决策 tag

- `packages/web/src/utils/push-notification-policy.ts` 已支持：
  - `office-decision-`
  - `cat-decision-`

说明：

- 这意味着新逻辑可以识别新旧 tag
- 但不代表后端发送侧已经完全迁移到新前缀

6. Windows 启动日志品牌文案中性化

- `scripts/start-windows.ps1` 已完成：
  - `OfficeClaw - Windows Startup` → `OfficeClaw - Windows Startup`
  - `OfficeClaw started!` → `OfficeClaw started!`

7. legacy PNG 头像内容已批量替换为中性 `agent-avatar-*`

当前已替换内容但保留原路径的文件包括：

- `codex.png`
- `opus.png`
- `gemini.png`
- `dare.png`
- `agentteams.png`
- `opencode.png`
- `sonnet.png`
- `gpt52.png`
- `gemini25.png`
- `antigravity.png`
- `codex-kawaii.png`
- `codex_box.png`
- `codex_iquid.png`
- `gemini-kawaii.png`
- `opus-kawaii.png`
- `antig-opus.png`
- `opus-45.png`

说明：

- 当前采用的是低风险策略：替换内容，不改路径，不改代码逻辑
- 因此任何旧路径若仍被命中，也不会再露出猫头像

8. 未使用切片资源已清理

- `packages/web/public/avatars/sliced-finial/antigravity_cyber.png`
- `packages/web/public/avatars/sliced-finial/codex_box.png`

已删除，原因是当前未发现生产运行时引用。

9. `client-visibility` 已增加新旧 env 键兼容

- `packages/api/src/utils/client-visibility.ts` 现在显式兼容：
  - `CAT_CAFE_BUILTIN_CLIENTS_ENABLED` / `OFFICE_CLAW_BUILTIN_CLIENTS_ENABLED`
  - `CAT_CAFE_ALLOWED_CLIENTS` / `OFFICE_CLAW_ALLOWED_CLIENTS`
  - `CAT_CAFE_VISIBLE_BUILTIN_AUTH_CLIENTS` / `OFFICE_CLAW_VISIBLE_BUILTIN_AUTH_CLIENTS`
  - `CAT_CAFE_CLIENT_LABELS` / `OFFICE_CLAW_CLIENT_LABELS`

说明：

- 这修复了安装包配置项与代码读取键名不一致的一个关键风险点

### 0.2 已明确不纳入本轮或暂缓

以下事项当前已明确不作为本轮直接实施项，或者已决定暂缓：

1. 全量 `catId` / `CatId` / `createCatId` 等内部模型重命名
2. `/api/cats` → `/api/agents` 路径迁移
3. `@office-claw/*` 包名迁移
4. 动态头像回退逻辑重构
5. 游戏/狼人杀链路的系统性头像逻辑调整

说明：

- 这些都属于较高风险改动
- 当前策略是优先处理“安装包暴露面”，不是做领域模型重构

### 0.3 待实施

以下事项仍应保留在第二轮待办列表中：

1. 重新构建前端产物，确保 `public/worker-*.js` 与最新 Worker 源码一致

当前源代码已经完成通知默认值去猫化，但构建产物是否完全同步，仍需通过实际 build 验证。

2. 检查后端通知发送侧是否仍在生成 `cat-decision-*`

当前策略层已兼容新旧前缀，但如果发送端仍只产出旧值，则运行时仍会保留旧 tag。

3. 复核 `jiuwenclaw.png`

当前已知该图片可接受，因此本轮未改；后续如设计侧有新标准，再单独处理。

4. 复核 `OFFICE_CLAW_*` / `CAT_CAFE_*` 的其他读取链路

本轮只修复了 `client-visibility.ts` 这条关键链路。仓库中仍有大量 `CAT_CAFE_*` 读取点，后续应继续按暴露面优先原则逐步兼容或收口。

5. 清理未进入本轮提交但后续可能有价值的设计文档与审计材料

当前尚存在：

- `docs/discussions/de-cat-remediation-phase2.md`（本文档）

该文档本轮按要求不提交，可在后续文档整理后单独提交。

### 0.4 当前分支建议

基于当前 `feat/de-cat` 的现状，第二轮后续工作建议按如下顺序推进：

1. 先 build 并验证最终产物
2. 再确认通知发送侧 tag 是否还在产出旧前缀
3. 最后才考虑是否继续动高风险的动态头像回退逻辑

一句话概括：

**当前 `feat/de-cat` 已经完成了“安装包用户可见头像与显性文案”的大部分低风险中性化；剩余工作主要集中在构建验证、发送侧 tag 收口，以及少量 env 兼容链路继续排查。**

---

## 1. 本轮目标边界

这轮整改的目标必须严格收敛。

### 1.1 本轮要处理的内容

只处理以下几类内容：

1. 最终安装包中会被带上的文件里的猫元素。
2. 用户在前端界面、通知、图标、头像、推送、错误提示、配置说明中能直接看到的猫元素。
3. 安装包运行时暴露出来的 API 路径、运行日志、通知 tag、配置路径等显性猫元素。
4. 会进入最终包并影响用户或运维使用者认知的默认值、默认文案、默认目录名。

### 1.2 本轮明确不处理的内容

以下内容即使仓库中存在，也**不作为本轮去猫目标**，除非它们最终会进入包并对外暴露：

1. 不会进入最终安装包的源码文件。
2. 只用于开发协作的顶层 guide 文件，例如 `CLAUDE.md`、`AGENTS.md`、`GEMINI.md`，前提是它们不会被打包进最终安装目录。
3. 内部类型名、内部函数名、内部数据模型，如 `catId`、`CatId`、`createCatId`，只要用户最终不可见。
4. 仅在测试目录中存在的猫元素，前提是不会被打包。
5. 仅在源码注释中存在、但不会进入包和用户界面的猫元素。

### 1.3 本轮判断依据

本轮是否纳入整改，统一以安装包审查文档为准：

`workspace/docs/discussions/cat-elements-audit.md`

换句话说：

- 审查文档里已经确认“安装包里暴露出来”的，纳入本轮。
- 只在源代码里存在、但安装包里没有暴露的，不纳入本轮。

---

## 2. 本轮总原则

### 2.1 以“最终用户可见”和“安装包显性暴露”为最高优先级

本轮优先顺序如下：

1. 用户前端界面可见
2. 系统通知/推送/头像/图标可见
3. 安装包 `.env`、配置说明、目录路径等对使用者可见
4. 运行日志、API 资源路径、服务启动文案等显性暴露
5. 内部实现

### 2.2 不为了“代码洁癖”扩大改动面

如果某个猫元素：

- 不在最终包里
- 不会出现在前端
- 不会出现在安装目录
- 不会通过日志/接口/通知暴露

那么本轮不动。

### 2.3 允许内部继续保留猫化模型名

例如：

- `catId`
- `CatId`
- `createCatId`
- `CAT_CAFE_*` 环境变量名

只要它们不直接暴露给最终用户或安装包使用者，这轮可以继续保留。

本轮重点是“暴露面去猫化”，不是“仓库语义大换血”。

---

## 3. 依据安装包审查，当前真正需要处理的暴露面

以下内容来自安装包审查文档，属于本轮必须关注的对象。

## 3.1 安装包中的 `.env` 文案和路径

安装包审查里已经确认，当前安装目录中的 `.env` 仍然暴露以下猫元素：

- `OfficeClaw / OfficeClaw — Environment Configuration`
- `智能体咖啡环境配置`
- `blocks cat invocation`
- `阻止猫调用`
- `.office-claw/proxy-upstreams.json`
- `Chat with cats from Feishu/Lark`
- `在飞书里和智能体聊天`
- `Chat with cats from Telegram`
- `在 Telegram 里和智能体聊天`
- `when cats need your attention`
- `智能体需要你关注时提醒`
- `~/.office-claw/.relay-teams`

这些内容明确进入最终包，并且属于安装包使用者可直接看到的显性暴露，必须纳入本轮。

## 3.2 用户可见的前端头像与图标资源

安装包审查已确认以下资源带有明确猫形象：

- `packages/web/public/avatars/assistant.svg`
- `packages/web/public/avatars/office.svg`
- `packages/web/public/images/longcat.svg`

另外，本次对源仓运行时代码的复核表明，`public/avatars/` 目录中并不是只有 `agent-avatar-*` 会被实际使用。

当前可以确认的情况是：

1. `CreateAgentModal.tsx` 的预设头像列表确实只显式使用 `agent-avatar-1.png` 到 `agent-avatar-9.png`。
2. 但运行时代码仍存在动态头像回退：
   - `packages/web/src/components/CatAvatar.tsx` 使用 `cat?.avatar ?? /avatars/${catId}.png`
   - `packages/api/src/routes/messages.ts` 推送通知图标使用 `/avatars/${targetCats[0]}.png`
   - `packages/web/src/components/game/PlayerGrid.tsx`、`NightActionCard.tsx`、`EventFlow.tsx` 也会按 `actorId` 动态拼接 `/avatars/${id}.png`
3. `packages/shared/src/types/cat.ts` 中，`opus/codex/gemini` 三个默认静态 fallback 已切到：
   - `/avatars/agent-avatar-2.png`
   - `/avatars/agent-avatar-1.png`
   - `/avatars/agent-avatar-3.png`
4. 但 `jiuwenclaw` 的静态 fallback 仍然直接使用 `/avatars/jiuwenclaw.png`。

因此，本轮不能简单假设“只有 `agent-avatar-*` 会被使用”。需要把头像资源分成三类处理。

具体暴露形式：

- 头像中直接是猫耳、猫脸、胡须
- `longcat.svg` 的 title 为 `LongCat`

这些都是强用户可见项，必须纳入本轮。

### 3.2.1 头像资源使用状态分层

#### A. 明确会被运行时使用

- `agent-avatar-1.png` ~ `agent-avatar-9.png`
- `assistant.svg`
- `jiuwenclaw.png`
- 所有可能被 `/avatars/${catId}.png` 动态命中的头像文件

#### B. 通过动态回退“可能被使用”，当前不能直接删

至少包括：

- `codex.png`
- `opus.png`
- `gemini.png`
- `agentteams.png`
- `dare.png`
- `opencode.png`
- `sonnet.png`
- `gpt52.png`
- `gemini25.png`
- `antigravity.png`

原因：

- 当前运行时代码仍有按 `catId` 或 `actorId` 拼接 `/avatars/${id}.png` 的逻辑
- 在未收敛这些动态路径前，不能直接删除上述文件

#### C. 当前未确认有运行时引用、但会随安装包带上的候选冗余头像

重点怀疑对象包括：

- `codex-kawaii.png`
- `codex_box.png`
- `codex_iquid.png`
- `gemini-kawaii.png`
- `opus-kawaii.png`
- `antig-opus.png`
- `assistant.svg` 之外的明显猫风格变体
- `sliced-finial/` 下的切片资源（需确认是否有运行时引用）

这类资源如果最终确认无运行时使用，应纳入本轮清理，因为它们虽然不一定在界面中直接出现，但会进入安装包并构成不必要的猫主题资源暴露。

### 3.2.2 头像命中调用链分析

为了避免误删头像资源，需要区分“真的会在产品运行时命中”的路径和“只存在于测试或编辑态”的路径。

#### 一类：确定会在主产品运行时命中的路径

##### 路径 A：`useCatData()` 主数据流

调用链：

1. `packages/web/src/hooks/useCatData.ts`
2. 优先请求 `/api/cats`
3. 请求失败时 fallback 到 `@office-claw/shared` 的 `CAT_CONFIGS`
4. 多个核心组件通过 `getCatById(catId)` 读取 `cat.avatar`
5. 最终由 `CatAvatar.tsx` 渲染

关键代码：

- `packages/web/src/hooks/useCatData.ts:126-135`
- `packages/web/src/hooks/useCatData.ts:99-118`
- `packages/web/src/components/CatAvatar.tsx:25-27`
- `packages/web/src/components/CatAvatar.tsx:50-56`

命中逻辑：

```tsx
src={cat?.avatar ?? `/avatars/${catId}.png`}
```

这意味着：

- 如果 `/api/cats` 返回了 `avatar`，会优先使用返回值
- 如果运行时数据没有 `avatar`，就会退回 `/avatars/${catId}.png`

因此这条路径是**真实运行主路径**，不是测试路径。

##### 路径 B：核心聊天与会话 UI

`CatAvatar` 当前被多个主界面组件直接使用：

- `packages/web/src/components/ChatMessage.tsx`
- `packages/web/src/components/ThreadSidebar/ThreadItem.tsx`
- `packages/web/src/components/MiniThreadSidebar.tsx`
- `packages/web/src/components/IntentRecognitionPlaceholder.tsx`
- `packages/web/src/components/TaskPanel.tsx`
- `packages/web/src/components/SummaryCard.tsx`
- `packages/web/src/components/SplitPaneCell.tsx`
- `packages/web/src/components/leaderboard-cards.tsx`
- `packages/web/src/components/leaderboard-phase-bc.tsx`

结论：

- `CatAvatar.tsx` 不是边缘组件，而是核心头像渲染组件
- 所以 `cat?.avatar ?? /avatars/${catId}.png` 的回退逻辑会在真实产品中被频繁执行

##### 路径 C：线程列表 fallback 头像

文件：`packages/web/src/components/ThreadSidebar/ThreadItem.tsx`

关键代码：

```tsx
if (!avatar) return '/avatars/assistant.svg';
```

这说明：

- `assistant.svg` 是真实运行中的默认兜底头像
- 不是测试专用资源
- 不能删除，只能改内容

##### 路径 D：模型列表默认图标

文件：`packages/web/src/components/ModelSelectDropdownDraft.tsx`

关键代码：

```tsx
const DEFAULT_MODEL_ICON = '/avatars/assistant.svg';
```

另外，后端模型路由也会返回：

- `packages/api/src/routes/maas-models.ts:118`

```ts
icon: '/avatars/assistant.svg'
```

结论：

- `assistant.svg` 同时被前端和后端返回值作为默认图标使用
- 这是明确的生产运行路径

##### 路径 E：新建智能体预设头像

文件：`packages/web/src/components/CreateAgentModal.tsx`

关键代码：

```ts
const PRESET_AVATARS = [
  '/avatars/agent-avatar-1.png',
  ...,
  '/avatars/agent-avatar-9.png',
]
```

结论：

- `agent-avatar-1.png` 到 `agent-avatar-9.png` 是明确生产使用资源
- 这批资源应保留

##### 路径 F：静态 fallback 配置中的头像

文件：`packages/shared/src/types/cat.ts`

当前静态 fallback：

- `opus -> /avatars/agent-avatar-2.png`
- `codex -> /avatars/agent-avatar-1.png`
- `gemini -> /avatars/agent-avatar-3.png`
- `jiuwenclaw -> /avatars/jiuwenclaw.png`

结论：

- `agent-avatar-1/2/3.png` 明确需要保留
- `jiuwenclaw.png` 仍然会在真实 fallback 路径中使用
- 如果 `jiuwenclaw.png` 是猫头像，不能删，只能替换内容

#### 二类：条件运行路径，当前不能直接删除对应 png

##### 路径 G：消息推送通知图标

文件：`packages/api/src/routes/messages.ts`

关键代码：

```ts
icon: targetCats.length === 1 ? `/avatars/${targetCats[0]}.png` : '/icons/icon-192x192.png'
```

影响：

- 当单个智能体完成回复并触发推送时，通知图标会直接按 `catId` 拼接 png 路径
- 这会命中诸如：
  - `opus.png`
  - `codex.png`
  - `gemini.png`
  - `jiuwenclaw.png`
  - 以及其他 runtime cat id 对应的 png

结论：

- 在这段逻辑改掉前，不能直接删除 `opus.png/codex.png/gemini.png` 这类文件
- 这属于真实运行路径，但触发条件是“单个智能体推送通知”

##### 路径 H：游戏模块头像

文件：

- `packages/web/src/components/game/PlayerGrid.tsx`
- `packages/web/src/components/game/NightActionCard.tsx`
- `packages/web/src/components/game/EventFlow.tsx`

关键代码：

```tsx
src={`/avatars/${seat.actorId}.png`}
src={actorId === 'owner' ? '/avatars/owner.jpg' : `/avatars/${actorId}.png`}
```

影响：

- 只要游戏/狼人杀相关界面在产品中可达，这些头像路径就是真实运行路径
- 会命中 seat / actor 对应的 png 文件

结论：

- 这类路径是“条件运行但真实存在”
- 在确认游戏模块是否在最终产品中开放之前，不应删除对应 png

#### 三类：编辑器/配置型运行路径

##### 路径 I：聊天输入候选 / whisper 候选

文件：`packages/web/src/components/chat-input-options.ts`

关键代码：

```ts
avatar: resolveCatAvatar(cat.avatar)
```

说明：

- 这里只使用 `cat.avatar`
- 不会自动回退到 `/avatars/${catId}.png`

结论：

- 它会命中 runtime cat 数据里明确声明的头像
- 对旧 `codex.png/opus.png/gemini.png` 的依赖取决于 `/api/cats` 实际返回什么
- 当前静态 fallback 已经是 `agent-avatar-*`，因此这条路径本身不要求保留老猫头像 png

#### 四类：当前主要是测试/非生产证据，不能作为保留依据

例如：

- `packages/web/src/**/__tests__/**`
- `packages/api/test/**`

这些引用可以帮助我们发现历史依赖，但**不能单独证明某头像文件在生产中必需**。

### 3.2.3 结论：哪些头像当前“必要且会实际运行”

#### 必要，不能删，只能改内容或保留

- `assistant.svg`
- `agent-avatar-1.png` ~ `agent-avatar-9.png`
- `jiuwenclaw.png`

#### 当前仍可能被真实运行命中，不能直接删

原因：存在动态 `/avatars/${id}.png` 路径。

- `opus.png`
- `codex.png`
- `gemini.png`
- `agentteams.png`
- `dare.png`
- `opencode.png`
- `sonnet.png`
- `gpt52.png`
- `gemini25.png`
- `antigravity.png`

#### 当前未找到生产运行命中证据，可作为冗余清理候选

- `codex-kawaii.png`
- `codex_box.png`
- `codex_iquid.png`
- `gemini-kawaii.png`
- `opus-kawaii.png`
- `antig-opus.png`
- `office.svg`（当前未查到生产代码直接引用；若无构建期注入使用，可作为冗余候选，但因安装包审查确认其存在且为猫头像，建议仍优先替换为中性资源后再决定是否删除）
- `sliced-finial/` 下未被运行时引用的切片资源

### 3.2.4 对本轮整改的直接影响

基于以上分析，本轮头像整改策略应调整为：

1. **运行时明确使用的头像**：不删，直接改内容去猫化。
2. **动态路径可能命中的头像**：在未改掉动态拼接逻辑前，不删；若其内容是猫头像，应优先替换成中性版本。
3. **未发现生产命中证据的冗余头像**：逐个确认后从安装包资源中清理。

## 3.3 前端通知/Worker 暴露

安装包审查已确认：

- `office-claw-default`
- `cat-decision-`

并且在源仓中还能看到其来源：

- `packages/web/worker/index.ts`
- `packages/web/src/utils/push-notification-policy.ts`

这类内容属于：

- 用户系统通知
- 浏览器运行时标签
- 可能出现在调试信息或重复通知策略中

必须纳入本轮。

## 3.4 安装包运行日志与启动文案

安装包审查已确认运行日志中仍出现：

- `OfficeClaw - Windows Startup`
- `OfficeClaw started!`
- `/api/cats`

其中要分开判断：

- `OfficeClaw - Windows Startup` / `OfficeClaw started!` 属于明显对外暴露的品牌残留，本轮要处理。
- `/api/cats` 是否要处理，要看它是否会直接暴露给用户或外部运维使用者，以及改动风险是否可控。

## 3.5 安装包中的用户可见应用名与实际残留并存

安装包已经在部分位置展示了：

- `OfficeClaw`
- `office-claw-*`

但同时仍保留：

- `office-claw-default`
- `.office-claw`
- 猫头像
- `LongCat`

这说明当前问题不是“完全没做去猫化”，而是“用户能同时看到新旧语言并存”。

本轮的核心就是消灭这类并存感。

---

## 4. 本轮纳入整改的文件范围

以下范围是结合“安装包暴露面”反推源仓中应修改的文件。

## 4.1 必改：最终包中的配置与默认文案来源

目标文件：

- `.env.example`
- 若安装包中实际会落地 `.env` 模板或 seed，也要同步检查：
  - `installer-seed/`
  - 顶层配置模板
  - 构建脚本复制列表

整改目标：

- 所有面向安装包使用者的说明文案去猫化
- 所有默认路径从 `.office-claw` 迁移到新主路径，或至少文案不暴露猫

## 4.2 必改：前端公开资源

目标文件：

- `packages/web/public/avatars/assistant.svg`
- `packages/web/public/avatars/office.svg`
- `packages/web/public/images/longcat.svg`
- 其他最终打包到 `public/` 且会被界面使用的猫形象资源
- `public/avatars/` 中确认未被运行时使用、但会进包的多余猫头像资源

整改目标：

- 去掉猫耳、猫脸、胡须等猫形象
- `LongCat` 资源删除、替换或改为中性图标
- 对头像目录做“保留必要运行时资源、清理确认未使用冗余资源”的梳理

## 4.3 必改：通知与 Service Worker 来源文件

目标文件：

- `packages/web/worker/index.ts`
- `packages/web/src/utils/push-notification-policy.ts`

整改目标：

- 默认通知标题去猫化
- `office-claw-default` 改为新默认 tag
- `cat-decision-` 改为新前缀或中性前缀
- 保留兼容识别，但不要继续写出旧值

## 4.4 必改：会进入安装包并暴露的启动/日志来源

目标文件：

- 桌面启动器相关源码或脚本
- 生成启动日志文案的源文件
- 任何会输出 `OfficeClaw - Windows Startup` / `OfficeClaw started!` 的代码位置

整改目标：

- 启动文案统一使用 `OfficeClaw` 或中性产品名

## 4.5 条件纳入：API 路径与显性协议暴露

目标项：

- `/api/cats`

处理原则：

- 如果它只是内部前后端调用路径，用户通常不可见，本轮可以不强改。
- 如果它会在前端报错、浏览器 DevTools、公开文档、日志、控制台或安装包说明中持续显性暴露，才纳入。

当前建议：

- 不把“全量 `/api/cats` 改名”作为本轮硬目标。
- 先处理更高优先级、低风险且用户明确可见的暴露面。

---

## 5. 本轮明确排除的文件类型

以下类型文件，即使仓库中有猫元素，也不作为本轮目标：

## 5.1 不进包的顶层开发协作文档

例如：

- `CLAUDE.md`
- `AGENTS.md`
- `GEMINI.md`

前提：

- 构建脚本不会把它们复制进最终安装目录

说明：

- 这些文件可能值得以后清理
- 但它们不属于本轮“最终包暴露面去猫化”目标

## 5.2 测试目录

例如：

- `packages/api/test/**`
- `packages/web/src/**/__tests__/**`

前提：

- 测试文件不会被打进最终包

说明：

- 本轮不为了测试内容里的猫词汇而扩大改造范围
- 只有当测试必须随代码修改而更新时，才做被动修改

## 5.3 纯内部类型、函数、模块命名

例如：

- `catId`
- `CatId`
- `createCatId`
- `CatConfig`

说明：

- 这些属于更深层的内部模型
- 当前安装包审查并没有把它们当作核心用户暴露问题
- 本轮不主动重构

## 5.4 不会进入最终包的源码注释

说明：

- 例如前端源码里的 `Cat ears` 注释是否保留，本轮不按“注释本身”处理
- 但如果注释对应的资源本身就是猫头像，则处理资源本身

---

## 6. 第二轮整改实施分期

本轮建议按“用户可见程度”和“改动风险”排序，而不是按代码层次排序。

## Phase 1：用户界面可见资源清理

这是本轮最高优先级。

### P1-A. 替换猫头像资源

文件：

- `packages/web/public/avatars/assistant.svg`
- `packages/web/public/avatars/office.svg`

补充范围：

- 对 `public/avatars/` 全目录进行运行时引用核对
- 对确认未使用的猫头像做清理

目标：

- 改为中性办公风格头像
- 不再出现猫耳、猫脸、胡须
- 保留原有尺寸、配色层级和资源路径，尽量减少代码层联动修改

建议方案：

1. `assistant.svg` 改为抽象 AI 助手头像
2. `office.svg` 改为办公助理/文档/徽章类抽象图形
3. 文件名可暂时不改，避免额外改动引用路径；本轮先改内容
4. 对 `jiuwenclaw.png` 等确认会被运行时用到、但实际是猫头像的文件，改内容不改路径
5. 对确认未被运行时使用的猫头像文件，直接从 `public/avatars/` 清理

验收标准：

- 用户界面显示的头像不再具备猫特征
- 安装包中的 `public/avatars/` 不再携带已确认无运行时用途的猫头像冗余资源

### P1-B. 替换 `longcat.svg`

文件：

- `packages/web/public/images/longcat.svg`

目标：

- 删除该资源，或替换为同路径下的中性图标
- 若被界面引用，保持路径不变优先

建议方案：

- 用中性“长列表”“流程图”“抽象标识”图标替代
- 去掉 `<title>LongCat</title>`

验收标准：

- 前端包中不再出现 `LongCat` 可见字样和对应猫图形

## Phase 2：通知与运行时前端暴露清理

### P2-A. 通知标题去猫化

源文件：

- `packages/web/worker/index.ts`

当前问题：

- 默认通知标题是 `智能体来信`

建议改为：

- `新消息`
- 或 `OfficeClaw 通知`
- 或 `智能体消息`

建议优先：`新消息`

原因：

- 最中性
- 不绑定产品品牌，不容易再引入其他风格问题

### P2-B. 通知 tag 默认值去猫化

源文件：

- `packages/web/worker/index.ts`

当前问题：

- 默认 tag 是 `office-claw-default`

建议改为：

- `office-claw-default`

兼容策略：

- 新通知只写 `office-claw-default`
- 去重/策略判断仍接受 `office-claw-default`

### P2-C. 决策 tag 前缀去猫化

源文件：

- `packages/web/src/utils/push-notification-policy.ts`
- `packages/web/worker/index.ts` 相关使用点

当前问题：

- 规则中识别 `cat-decision-`

建议改为：

- 新前缀：`office-decision-`

兼容策略：

- 判断时同时识别：
  - `office-decision-`
  - `cat-decision-`
- 生成时只生成新前缀

验收标准：

- 新构建出来的 worker 产物里不再默认写出 `office-claw-default`
- 不再默认写出 `智能体来信`

## Phase 3：安装包配置说明与默认路径清理

### P3-A. `.env` 模板文案去猫化

目标源文件：

- `.env.example`
- 任何用于生成最终安装包 `.env` 的 seed/template 文件

根据安装包审查，必须处理的文案包括：

| 当前 | → 改为 |
|------|--------|
| `OfficeClaw / OfficeClaw — Environment Configuration` | `OfficeClaw / OfficeClaw — Environment Configuration` 或 `OfficeClaw Environment Configuration` |
| `智能体咖啡环境配置` | `OfficeClaw 环境配置` |
| `blocks cat invocation` | `blocks agent invocation` 或更中性表达 |
| `阻止猫调用` | `阻止智能体调用` |
| `Chat with cats from Feishu/Lark` | `Chat with agents from Feishu/Lark` |
| `在飞书里和智能体聊天` | `在飞书里和智能体聊天` |
| `Chat with cats from Telegram` | `Chat with agents from Telegram` |
| `在 Telegram 里和智能体聊天` | `在 Telegram 里和智能体聊天` |
| `when cats need your attention` | `when agents need your attention` |
| `智能体需要你关注时提醒` | `智能体需要你关注时提醒` |

### P3-B. `.office-claw` 路径的安装包暴露清理

根据安装包审查，当前暴露出的路径包括：

- `.office-claw/proxy-upstreams.json`
- `~/.office-claw/.relay-teams`

本轮处理原则：

- 只要该路径会直接出现在安装包配置说明、设置页、或用户可见配置中，就纳入本轮。
- 不要求同步清理所有内部实现；但至少要把**最终展示给用户的默认路径**改掉。

建议主路径：

- `.office-claw/proxy-upstreams.json`
- `~/.office-claw/.relay-teams`

兼容策略：

- 运行时仍可兼容旧目录读取
- 但安装包文案和默认值只展示新路径

验收标准：

- 新安装包中的 `.env` 和相关设置说明不再出现 `.office-claw`

## Phase 4：启动文案和运行日志品牌残留清理

### P4-A. Windows 启动文案

根据安装包审查，运行日志中仍出现：

- `OfficeClaw - Windows Startup`
- `OfficeClaw started!`

本轮目标：

- 找到启动器或脚本中的源头文案
- 改为：
  - `OfficeClaw - Windows Startup`
  - `OfficeClaw started!`

说明：

- 这类文案虽然不是主界面 UI，但属于安装包运行时的明显暴露面
- 对品牌一致性影响很大，必须纳入本轮

---

## 7. 条件处理项

以下项目在本轮不默认展开，但如果实现成本很低、并且已经明确进入安装包暴露面，可以顺手处理。

## 7.1 `/api/cats`

当前状态：

- 安装包日志中出现 `/api/cats`

本轮判断：

- 如果只是内部前后端请求路径，不作为本轮主要目标
- 如果它会频繁在用户可见日志、错误弹窗、控制台界面、运维面板中显式展示，再考虑纳入

建议：

- 本轮不把全量 API 路由改名作为必须项
- 除非你已经明确希望连运行日志和接口资源名一起去猫化

## 7.2 包名 `@office-claw/*`

当前状态：

- 审查文档中确实发现了 `@office-claw/web`、`@office-claw/api`、`@office-claw/mcp-server`

本轮判断：

- 这些主要是工程/产物命名空间问题，不一定对最终用户可见
- 如果它们不会在安装包 UI、设置页、错误对话框、日志中对外直接展示，本轮不建议主动修改

---

## 8. 详细修改清单

下面这部分用于直接指导开发。

## 8.1 配置模板与安装包默认说明

### F-ENV-1

文件：`.env.example`

操作：

- 全面检查所有会被拷贝进最终安装包的配置说明文案
- 把用户可见的“猫/智能体/cat invocation/Chat with cats”改为“智能体/agent”体系

重点替换：

- 标题
- Feishu 文案
- Telegram 文案
- Web Push 文案
- shared-state preflight 文案

### F-ENV-2

文件：构建/安装 seed 中实际生成 `.env` 的模板文件

操作：

- 确保最终安装目录里生成的 `.env` 与 `.env.example` 一致去猫化
- 防止改了 `.env.example` 但安装器仍注入旧文案

## 8.2 前端公开资源

### F-ASSET-1

文件：`packages/web/public/avatars/assistant.svg`

操作：

- 在不改路径的前提下替换 SVG 内容
- 改为中性智能助手图形

### F-ASSET-2

文件：`packages/web/public/avatars/office.svg`

操作：

- 在不改路径的前提下替换 SVG 内容
- 改为办公品牌/文档助手风格图形

### F-ASSET-3

文件：`packages/web/public/avatars/jiuwenclaw.png`

操作：

- 由于 `packages/shared/src/types/cat.ts` 当前静态 fallback 仍直接引用该文件
- 如该图片事实为猫头像，则应改内容不改路径，替换为中性办公助理形象

### F-ASSET-4

文件：`packages/web/public/images/longcat.svg`

操作：

- 删除或替换成中性资源
- 如果页面依赖该路径，保留同名文件但改内容

### F-ASSET-5

文件：`packages/web/public/avatars/` 目录下确认未被运行时引用的冗余猫头像

首批候选：

- `codex-kawaii.png`
- `codex_box.png`
- `codex_iquid.png`
- `gemini-kawaii.png`
- `opus-kawaii.png`
- `antig-opus.png`
- `sliced-finial/` 下未被引用的切片资源

操作：

- 逐个确认运行时无引用后直接删除
- 若构建脚本有静态复制整个 `public/avatars/` 目录，则这些文件删除后可直接减少安装包中的猫主题资源暴露

注意：

- `codex.png`、`opus.png`、`gemini.png`、`agentteams.png`、`dare.png`、`opencode.png`、`sonnet.png`、`gpt52.png`、`gemini25.png`、`antigravity.png` 目前仍可能被动态路径命中，**本轮不能在未改动态回退前直接删除**

## 8.3 通知与 Worker

### F-WORKER-1

文件：`packages/web/worker/index.ts`

操作：

- `智能体来信` → `新消息`
- `office-claw-default` → `office-claw-default`

### F-WORKER-2

文件：`packages/web/src/utils/push-notification-policy.ts`

操作：

- 引入新前缀 `office-decision-`
- 保留 `cat-decision-` 兼容识别

### F-WORKER-3

构建验证：

- 重新构建前端后，检查生成的 `public/worker-*.js`
- 确认其中不再默认写出：
  - `智能体来信`
  - `office-claw-default`

## 8.4 启动文案

### F-RUNTIME-1

目标：找到生成以下日志的源码位置并替换：

- `OfficeClaw - Windows Startup`
- `OfficeClaw started!`

操作要求：

- 文案统一改成 `OfficeClaw`
- 不改变日志结构，只改文案内容

---

## 9. 推荐 PR 拆分

本轮建议拆成 3 个 PR。

## PR-1：前端资源与通知

包含：

- `packages/web/public/avatars/*`
- `packages/web/public/images/longcat.svg`
- `packages/web/worker/index.ts`
- `packages/web/src/utils/push-notification-policy.ts`

收益：

- 用户感知最直接
- 风险相对最低

## PR-2：安装包配置说明

包含：

- `.env.example`
- 安装 seed/template
- 相关默认路径展示

收益：

- 清理安装包可见说明中的猫化语言

## PR-3：启动文案与显性运行时残留

包含：

- 启动器/脚本的 `OfficeClaw` 日志文案源头
- 低风险、显性暴露的运行时文案

收益：

- 解决“OfficeClaw 已改名，但日志还叫 OfficeClaw”的割裂问题

---

## 10. 验收标准

本轮完成后，新的安装包应满足：

### 10.1 用户前端界面

- 不再显示猫头像
- 不再显示 `LongCat` 图形或名称

### 10.2 通知系统

- 默认通知标题不再是 `智能体来信`
- 默认通知 tag 不再是 `office-claw-default`
- 新通知决策 tag 不再使用 `cat-decision-`

### 10.3 安装包配置与说明

- `.env` 或安装模板中不再出现“和猫聊天”“猫调用”“智能体咖啡环境配置”等文案
- 默认展示路径不再出现 `.office-claw`

### 10.4 启动与运行文案

- 启动日志不再出现 `OfficeClaw - Windows Startup`
- 启动日志不再出现 `OfficeClaw started!`

---

## 11. 本轮之后仍允许存在的内容

为了避免范围失控，以下内容在本轮结束后仍允许保留：

- 内部 `catId` / `CatId` / `createCatId`
- `@office-claw/*` 包名
- 仅存在于源码但不进包的开发文档中的猫词汇
- 仅存在于测试中的猫词汇
- 纯内部 API/存储语义，只要不会显性暴露给最终用户

---

## 12. 一句话结论

这轮不是“全仓去猫化”，而是：

**把最终安装包里用户能看到、安装包使用者能看到、运行时会显性暴露出来的猫元素清掉；不进入包、不对外暴露的内部猫元素，本轮不动。**
