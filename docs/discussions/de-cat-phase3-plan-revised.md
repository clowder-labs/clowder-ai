# 第三轮去猫化实施计划（Phase 3 - 修订版）

> 日期：2026-04-12
> 目标：收口前两轮遗留的运行时路径、skills 目录、打包暴露面与历史双轨问题，消除 `.cat-cafe` / `.office-claw`、`cat-cafe-skills/` / `office-claw-skills/`、`catcafe_*` / 新前缀并存。
> 关联文档：
> - `docs/discussions/de-cat-remediation.md`
> - `docs/discussions/de-cat-remediation-phase2.md`

---

## 0. 结论先行

第三轮不是“把 `cat-cafe-skills/` 直接删掉”，也不是“只改 4 个路径文件”。

当前问题是三类残留叠加：

1. 生产代码仍在读写旧路径。
2. 打包链路与测试仍默认旧目录名。
3. 历史运行时数据与 skills 资产仍双轨并存。

同时要明确一个前提：

**skills 是否有用，不能只看源码里有没有直接 import / 字符串引用。**

agent 会扫描 skills 目录、manifest、symlink 挂载目录，并按触发词和目录内容动态使用 skill。某个 skill 没有被 TypeScript 代码直接引用，**不代表它无用**。

因此第三轮必须分开处理：

1. **代码路径收口**：让新运行不再写出旧路径/旧前缀。
2. **skills 资产迁移**：谨慎处理 `cat-cafe-skills/` 中仍有价值的内容，尤其 `pptx-craft-simple`。
3. **打包与安装器同步**：避免安装包继续带出旧目录名。
4. **运行时数据迁移/兼容**：处理用户目录和项目目录中的历史双轨状态。

---

## 1. 当前现状

结合前两轮文档和当前代码，现状可分为“已完成”和“未收口”两部分。

### 1.1 已完成

前两轮中大量面向用户的文案和默认值已经去猫化，包括但不限于：

1. `.env.example` 已切到 `OfficeClaw`、`.office-claw`、`agents` 文案。
2. Web Worker 默认通知标题已改为 `新消息`，默认 tag 已改为 `office-claw-default`。
3. 通知策略已兼容 `office-decision-`，并保留 `cat-decision-` 兼容识别。
4. `CAT_CONFIGS` 的用户可见名称已切到“办公智能体 / 通用智能体 / 编码智能体”。
5. 第一轮文档中的大量系统提示词去猫化已经落地。

### 1.2 未收口

当前仍存在的第三轮问题：

1. 生产代码仍读写 `.cat-cafe`：
   - `packages/api/src/domains/cats/services/skillhub/SkillPaths.ts`
   - `packages/api/src/infrastructure/connectors/ConnectorOwnerStore.ts`
   - `packages/api/src/domains/cats/services/skillhub/SkillInstallManager.ts`
   - `packages/api/src/routes/skills.ts`

2. 生产代码仍生成 `catcafe_*` 会话前缀：
   - `packages/api/src/domains/cats/services/agents/providers/RelayClawAgentService.ts`

3. 仓库根目录同时存在：
   - `cat-cafe-skills/`
   - `office-claw-skills/`

4. 用户目录同时存在：
   - `C:\Users\xuruoqian\.cat-cafe`
   - `C:\Users\xuruoqian\.office-claw`

5. 安装器/构建链路仍有旧目录名假设：
   - `packages/api/test/windows-offline-installer.test.js` 仍断言 `cat-cafe-skills`
   - 需要同步核对 `scripts/build-windows-installer.mjs` 的历史逻辑与产物行为

6. API 返回给前端的路径文案仍可能暴露旧路径：
   - `.cat-cafe/skills/...`

---

## 2. 第三轮目标边界

### 2.1 本轮必须完成

1. 新运行不再创建新的 `.cat-cafe/...` 项目级路径。
2. 新运行不再创建新的 `catcafe_*` sessionId。
3. 新安装包和运行时主目录不再依赖 `cat-cafe-skills/` 作为正式技能目录。
4. `cat-cafe-skills/` 中仍有价值的 skills 内容完成迁移或明确归档。
5. 前端/API/安装器不再向用户暴露旧路径字符串。

### 2.2 本轮不追求

1. 全仓内部命名彻底去猫化，例如 `catId`、`CatId`、`/api/cats`。
2. 全部历史文档、测试名、feature 文件一次性重命名。
3. 所有 runtime 协议字段、包名、vendor 目录名的一次性大迁移。

这轮的核心是：

**消灭仍会影响真实运行、打包结果、技能扫描、用户可见路径和历史状态迁移的旧轨。**

---

## 3. 风险分层

### 3.1 P0：必须先做，否则第三轮名义完成但效果不成立

1. 代码仍写 `.cat-cafe` / `catcafe_*`。
2. `cat-cafe-skills/` 仍含有效 skills 资产，不能粗暴删除。
3. 打包链路若不改，安装包仍可能继续带出旧目录名。

### 3.2 P1：高优先级，建议与 P0 同 PR 或紧邻执行

1. API 返回值中的旧路径文案。
2. 测试与安装器断言仍锁死旧名称。
3. 运行时历史目录迁移策略未定义，导致双轨会持续并存。

### 3.3 P2：中优先级，可在主链路稳定后跟进

1. 历史文档中的旧目录名说明。
2. 辅助脚本、审计材料、迁移说明等文档同步。

---

## 4. skills 资产判断原则

### 4.1 基本原则

对于 `cat-cafe-skills/` 中的内容，判断是否需要保留/迁移，**不能只看代码直接引用**，还要看：

1. 是否会被 agent 扫描目录发现。
2. 是否在 manifest / bootstrap / skill 索引中有定义。
3. 是否是面向 agent 的运行时知识或流程资产。
4. 是否被已有产品设计明确要求保留。

### 4.2 `pptx-craft` 最终结论

基于提交历史与当前目录现状，本轮采用以下结论：

1. `office-claw-skills/pptx-craft` 是 **正式主 skill 入口**，后续应作为唯一正式维护版本。
2. `office-claw-skills/pptx-craft` 当前并不完整：其主 `SKILL.md` 声明依赖 `planner / designer / outline-research`，并引用 `html-to-pptx`，但这些目录当前缺失。
3. `cat-cafe-skills/pptx-craft` 中的 `designer / planner / outline-research / html-to-pptx / assets` 不是可随意删除的旧垃圾，而是 **后续补入旧目录、但未成功收敛进 office 目录的有效依赖资产**。
4. `cat-cafe-skills/pptx-craft-simple` 是后续新增的一套候选实现，**应保留**，但当前不能原样上线，因为它的 `name`、内部路径和自我引用仍指向 `pptx-craft`，会造成命名与路径冲突。
5. 因此 `pptx-craft` 与 `pptx-craft-simple` 的处理方式不同：
   - `pptx-craft`：以 `office-claw-skills/pptx-craft` 为主，吸收 `cat-cafe-skills/pptx-craft` 中缺失依赖后继续保留。
   - `pptx-craft-simple`：迁入 `office-claw-skills/` 后先做标准化，再作为第二个正式 skill 暴露。

### 4.3 `pptx-craft` 提交历史证据摘要

为避免后续再次误判，这里记录与本结论直接相关的关键提交时间线：

1. `8918d07b` `feat: add pptx-craft skill`
   - 最早创建 `cat-cafe-skills/pptx-craft`
   - 当时仍是较早版本，只包含主 `SKILL.md`、`scripts/svg_to_pptx`、基础样式等
   - 尚未出现今天看到的 `designer / planner / outline-research / html-to-pptx / assets` 完整子模块树

2. `dda7ac93` `refresh pptx-craft (#204)`
   - 继续更新的仍是 `cat-cafe-skills/pptx-craft`
   - 重点是脚本与导出链路调整，并非完整多模块版本

3. `55721e54` `feat(F140): Phase M-5a — rename cat-cafe-skills/ to office-claw-skills/`
   - 这是去猫化 rename 提交
   - 最终落入 `office-claw-skills/pptx-craft/` 的只有主 `SKILL.md`、`package.json`、`scripts/analysis|check|fix|utils`、`styles`
   - **没有**完整带过去 `designer / planner / outline-research / html-to-pptx / assets`

4. `4bfe7ca9` `提交新版本pptxskills版本`
   - 在旧目录 `cat-cafe-skills/` 侧新增 `pptx-craft-simple/`
   - 同时大幅补充 `cat-cafe-skills/pptx-craft/`，加入：
     - `designer/`
     - `planner/`
     - `outline-research/`
     - `html-to-pptx/`
     - `assets/`
   - 这些新增内容并没有同步收敛到 `office-claw-skills/pptx-craft/`

5. 因此当前状态不是单纯“rename 漏了一个目录”，而是：
   - 去猫化分支迁走了一版较早的 `pptx-craft`
   - 随后其他人又在 `main` 上向旧目录补充了新版依赖和 `pptx-craft-simple`
   - 最终 rebase/merge 后形成：
     - `office-claw-skills/pptx-craft` 成为正式入口，但缺依赖
     - `cat-cafe-skills/pptx-craft` 保留了后来补入的依赖资产
     - `cat-cafe-skills/pptx-craft-simple` 保留了后来新增的候选实现

这一证据链直接决定了本轮的处理策略：

1. 不能删除 `cat-cafe-skills/pptx-craft`，因为它承载了正式主 skill 缺失的依赖资产。
2. 不能原样迁移 `pptx-craft-simple`，因为它虽然是新增有效实现，但尚未完成独立命名和路径标准化。
3. 最终应在资产吸收与标准化完成后，彻底删除 `cat-cafe-skills/`。

### 4.4 因此本轮对 skills 的原则

1. 不直接删除 `cat-cafe-skills/`。
2. 先迁移确定需要保留的内容。
3. 再让代码/打包链路切换到 `office-claw-skills/`。
4. 最后再决定 `cat-cafe-skills/` 是归档、兼容保留，还是删除。

---

## 5. Phase 3 实施拆分

第三轮建议拆成 4 个子阶段，按依赖顺序执行。

### Phase 3A：生产代码路径收口

目标：新运行不再写旧路径、旧前缀。

#### 3A.1 技能目录与用户技能安装路径

文件：`packages/api/src/domains/cats/services/skillhub/SkillPaths.ts`

当前：

- 官方技能目录：`cat-cafe-skills`
- 用户技能目录：`.cat-cafe/skills`

改为：

- 官方技能目录：`office-claw-skills`
- 用户技能目录：`.office-claw/skills`

要求：

1. 新路径改为正式默认值。
2. 是否需要兼容读取旧目录，需单独决策：
   - 若兼容：只读旧目录，写入新目录。
   - 若不兼容：提供迁移脚本和明确操作说明。

#### 3A.2 Connector owner 持久化路径

文件：`packages/api/src/infrastructure/connectors/ConnectorOwnerStore.ts`

当前：`join(hostRoot, '.cat-cafe', OWNER_FILENAME)`

改为：`join(hostRoot, '.office-claw', OWNER_FILENAME)`

要求：

1. 新写入路径只能是 `.office-claw`。
2. 如要兼容旧文件，可先读旧路径再迁移写回新路径。

#### 3A.3 Skill 安装返回值

文件：`packages/api/src/domains/cats/services/skillhub/SkillInstallManager.ts`

当前返回：`.cat-cafe/skills/${localName}`

改为：`.office-claw/skills/${localName}`

说明：

这不是纯内部实现，而是会回传给前端/调用方的可见路径。

#### 3A.4 Skills 路由返回值

文件：`packages/api/src/routes/skills.ts`

当前返回：`.cat-cafe/skills/${skillName}`

改为：`.office-claw/skills/${skillName}`

#### 3A.5 RelayClaw session 前缀

文件：`packages/api/src/domains/cats/services/agents/providers/RelayClawAgentService.ts`

当前：`this.config.channelId ?? 'catcafe'`

改为：

- 优先方案：`this.config.channelId ?? 'officeclaw'`
- 备选方案：`this.config.channelId ?? 'clowder'`

建议：优先用 `officeclaw`，与现有品牌/目录命名一致。

要求：

1. 新 sessionId 不再生成 `catcafe_*`。
2. 旧 sessionId 仍可读取，不强制重命名历史目录。

#### 3A.6 风险分析

1. 风险：路径默认值切换后，部分逻辑仍只读取旧目录，导致新安装 skill、connector owner 或 session 数据“写到新目录，读还在旧目录”，表现为功能偶发失效。
   - 触发条件：只改写入路径，不核对所有读取路径与 fallback 逻辑。
   - 缓解措施：每改一个默认路径，必须同步检查读取路径、fallback 顺序、测试断言和 API 返回值。

2. 风险：前端或调用方缓存了 `.cat-cafe/...` 路径格式，路径返回值切换后出现展示异常、跳转失效或错误提示。
   - 触发条件：仅修改后端写入路径，不更新接口返回值和相关断言。
   - 缓解措施：把 `SkillInstallManager.ts` 和 `routes/skills.ts` 的返回值视为协议层变更，联动测试和前端路径展示逻辑一起核对。

3. 风险：session 前缀切换后，新旧 session 混用，若某些列表、过滤器或通知策略只认旧前缀，可能导致新会话不可见或被错误分类。
   - 触发条件：把 `catcafe` 改成新前缀，但不检查消费方的前缀识别规则。
   - 缓解措施：同步核对 `relayclaw-agent-service` 相关测试、通知策略、前端过滤规则和任何 sessionId 前缀判断逻辑。

4. 风险：若直接强制迁移历史 session 命名，可能破坏已有索引、磁盘目录和人工排查习惯。
   - 触发条件：将“新前缀”误解为“必须批量重命名旧目录”。
   - 缓解措施：明确本阶段只要求“新写入改用新前缀”，旧数据只读兼容，不做历史批量重命名。

### Phase 3B：skills 资产迁移

目标：把仍有价值的 skills 内容迁到 `office-claw-skills/`，为后续移除旧目录铺路。

#### 3B.1 `pptx-craft`：补齐后保留

正式位置：`office-claw-skills/pptx-craft/`

当前问题：

1. 这是去猫化后保留下来的正式目录。
2. 但它缺少主 `SKILL.md` 已声明或引用的依赖模块。

必须迁入的内容来源：

- `cat-cafe-skills/pptx-craft/designer/`
- `cat-cafe-skills/pptx-craft/planner/`
- `cat-cafe-skills/pptx-craft/outline-research/`
- `cat-cafe-skills/pptx-craft/html-to-pptx/`
- `cat-cafe-skills/pptx-craft/assets/`

目标：对应迁入 `office-claw-skills/pptx-craft/`

处理原则：

1. `office-claw-skills/pptx-craft` 作为唯一正式主版本保留。
2. `cat-cafe-skills/pptx-craft` 不再作为正式 skill 并存，而是作为回补来源被吸收。
3. 迁移完成后，必须核对 `office-claw-skills/pptx-craft/SKILL.md` 中声明的依赖与实际目录一致。

#### 3B.2 `pptx-craft-simple`：标准化后上线

来源：`cat-cafe-skills/pptx-craft-simple/`

目标：`office-claw-skills/pptx-craft-simple/`

原因：

1. 它是后续新增的一套有效实现，不能删除。
2. 但它当前不能原样迁入正式目录，因为其 `SKILL.md` frontmatter 仍使用 `name: pptx-craft`，内部大量路径与说明也仍指向 `pptx-craft/...`。
3. 如果原样迁移，会与正式主 skill `pptx-craft` 产生命名、路径和扫描语义冲突。

必须执行的标准化动作：

1. 迁入 `office-claw-skills/pptx-craft-simple/`
2. 将主 `SKILL.md` 的 `name` 改为 `pptx-craft-simple`
3. 修正内部所有仍写死为 `pptx-craft/...` 的路径说明、脚本调用和子 skill 引用
4. 在 `office-claw-skills/manifest.yaml` 中正式注册 `pptx-craft-simple`
5. 核对 `BOOTSTRAP.md`、manifest、目录结构三者一致

处理原则：

1. `pptx-craft-simple` 应保留并上线。
2. 但必须在完成标准化后上线，不能原样复制后直接投入使用。

#### 3B.3 `cat-cafe-skills/` 最终处置

`cat-cafe-skills/` 的最终目标是 **彻底删除**，但前提是完成内容收敛。

正确顺序：

1. 先把 `pptx-craft` 需要的依赖模块回补到 `office-claw-skills/pptx-craft/`
2. 再把 `pptx-craft-simple` 迁入 `office-claw-skills/` 并完成标准化
3. 再让代码、manifest、BOOTSTRAP、打包链路全部只依赖 `office-claw-skills/`
4. 验证功能和扫描结果后，删除 `cat-cafe-skills/`

这意味着：

1. 短期不能删。
2. 中期要作为资产来源参与收敛。
3. 最终不应在主分支长期保留 `.backup`、`.archive` 或并存目录。

本轮不建议把 `cat-cafe-skills/` 直接加入 `.gitignore` 后作为本地孤儿目录长期存在。

推荐顺序：

1. 先迁移并标准化必须内容。
2. 再切换代码与打包链路。
3. 再根据验证结果二选一：
   - 方案 1：短期临时保留 `cat-cafe-skills/` 作为过渡目录，但不再被正式路径使用。
   - 方案 2：验证完成后直接删除旧目录。

不推荐：

1. 一开始就简单 `mv cat-cafe-skills cat-cafe-skills.backup`
2. 仅靠 `.gitignore` 管理归档目录

原因：

1. 它会绕开打包/测试/代码链路的真实修复。
2. 容易形成“本地能跑、仓库定义不清”的灰色状态。
3. 会掩盖 `pptx-craft` 与 `pptx-craft-simple` 尚未真正收敛的问题。

#### 3B.4 风险分析

1. 风险：`pptx-craft` 回补时如果只迁目录、不核对主 `SKILL.md` 的依赖声明和脚本引用，可能出现“目录看起来全了，但实际仍跑不通”的假完成。
   - 触发条件：只按文件夹名复制，不检查 `SKILL.md` 中对 `planner / designer / outline-research / html-to-pptx / assets` 的引用。
   - 缓解措施：迁移完成后逐项核对依赖声明、脚本路径、样式路径和产物链路，确认引用闭环。

2. 风险：`pptx-craft-simple` 原样迁移会与 `pptx-craft` 在扫描层发生冲突，表现为名称碰撞、错误触发、加载到错误 skill。
   - 触发条件：保留 `name: pptx-craft` 或内部仍大量自引用 `pptx-craft/...`。
   - 缓解措施：将标准化视为迁移的组成部分，而不是后续可选优化；未完成标准化前，不将其记为“已上线”。

3. 风险：回补 `cat-cafe-skills/pptx-craft` 资产时，如果无差别整体覆盖 `office-claw-skills/pptx-craft`，可能把去猫化后已修正的内容覆盖回旧状态。
   - 触发条件：使用粗粒度目录覆盖，而非按缺失模块回补。
   - 缓解措施：只迁缺失模块和必要资产，不覆盖已经存在的 `office-claw-skills/pptx-craft/SKILL.md`、`styles/`、`scripts/` 等现有主版本内容，必要时逐目录比对后合并。

4. 风险：过早删除 `cat-cafe-skills/` 会直接丢失未收敛资产，且此类损失在代码搜索中不一定立刻暴露。
   - 触发条件：未完成 skill 扫描验证、manifest/BOOTSTRAP 对齐和功能测试就删除旧目录。
   - 缓解措施：把删除旧目录放到整个 Phase 3 的最后一步，并以验收标准而不是主观判断作为删除前置条件。

5. 风险：只根据“代码直接引用”来判断 skill 是否可删，会误删 agent 运行时扫描依赖的内容。
   - 触发条件：把技能目录当成普通源码目录，只做 grep 不做扫描/加载验证。
   - 缓解措施：任何 skill 删除或迁移都必须经过目录扫描结果、manifest、BOOTSTRAP 和真实触发场景四重验证。

### Phase 3C：打包与安装器同步

目标：安装包不再继续带出旧目录名和旧路径假设。

#### 3C.1 Windows 安装器测试

文件：`packages/api/test/windows-offline-installer.test.js`

当前仍断言：`cat-cafe-skills`

改为：`office-claw-skills`

#### 3C.2 安装器构建脚本

文件：`scripts/build-windows-installer.mjs`

当前代码中正式的 managed top-level path 已是 `office-claw-skills`，但仍需确认：

1. 无其他历史拷贝逻辑继续复制 `cat-cafe-skills/`
2. 最终 bundle 不会同时打入两个目录
3. 产物文档同步说明新目录名

#### 3C.3 相关测试同步

至少核对：

1. `packages/api/test/skills-route.test.js`
2. `packages/api/test/callback-skill-routes.test.js`
3. `packages/api/test/relayclaw-agent-service.test.js`

需要更新的断言包括：

1. `.cat-cafe/skills/...` → `.office-claw/skills/...`
2. `catcafe_*` → 新 session 前缀

#### 3C.4 风险分析

1. 风险：仓库代码已切换到 `office-claw-skills`，但安装器或离线包仍然复制 `cat-cafe-skills/`，最终交付物继续带旧目录。
   - 触发条件：只改源码和测试，不实际检查打包脚本与产物清单。
   - 缓解措施：除单元测试外，必须增加一次对最终 bundle 内容的检查，确认不会同时打入两个 skills 目录。

2. 风险：测试修改不完整，导致本地代码通过但 CI 或安装器链路在其他平台仍引用旧路径。
   - 触发条件：只改最直接的一个测试文件，遗漏 callback、route、agent service 等相关断言。
   - 缓解措施：将路径类断言和 session 前缀类断言作为一次性全局收敛项处理，而不是按报错逐个修补。

3. 风险：安装器文档、脚本和测试不一致，会让后续维护者误把 `cat-cafe-skills/` 当成仍被支持的目录。
   - 触发条件：只改构建逻辑，不改文档和说明。
   - 缓解措施：同步更新安装器脚本说明、产物约定和相关注释，消除“代码已切、文档未切”的二义性。

### Phase 3D：运行时数据迁移与兼容

目标：解决你现在看到的双目录并存问题。

#### 3D.1 项目级目录迁移

范围：项目根目录下

- `.cat-cafe/`
- `.office-claw/`

策略建议：

1. 若旧目录仅存历史数据：迁移必要文件后停止使用旧目录。
2. 若旧目录中仍有运行时活跃文件：先完成代码切换，再做一次性迁移。

#### 3D.2 用户级目录迁移

范围：用户目录下

- `C:\Users\xuruoqian\.cat-cafe`
- `C:\Users\xuruoqian\.office-claw`

重点：

1. 不要求粗暴删除旧目录。
2. 先定义哪些内容要迁：
   - skills
   - connector owner
   - profile/secrets
   - runtime 缓存
   - proxy/upstream 配置
3. 明确“哪些文件迁，哪些文件保留历史只读”。

#### 3D.3 历史 session 与历史数据

1. 旧的 `catcafe_*` session 目录不要求重命名。
2. 重点是：新运行不再生成新 `catcafe_*`。
3. 对历史数据只需保证可读，不必强制回写。

#### 3D.4 风险分析

1. 风险：迁移脚本或人工迁移时误把运行时缓存、配置、用户技能和敏感信息混在一起处理，造成配置丢失或环境污染。
   - 触发条件：未区分“必须迁移的数据”和“可丢弃缓存”。
   - 缓解措施：迁移前先分类列清单，至少区分 skills、owner、配置、缓存、历史 session 五类，再决定逐类动作。

2. 风险：用户目录和项目目录双轨同时存在时，如果迁移顺序错误，可能刚迁完又被旧代码继续写回 `.cat-cafe`。
   - 触发条件：先清理历史目录，后修改代码默认路径。
   - 缓解措施：必须先完成 Phase 3A 的代码收口，再执行任何一次性迁移或清理。

3. 风险：直接删除历史目录会让问题短期“看起来干净”，但一旦回退或需要排障，缺少历史证据和旧配置来源。
   - 触发条件：把迁移等同于清空旧目录。
   - 缓解措施：迁移阶段先以“停止新写入 + 明确保留策略”为主，删除动作在验证稳定后单独执行。

4. 风险：若把旧 session、旧 owner 文件、旧 skill 安装目录一并强制重命名，可能破坏外部工具、日志检索和历史问题定位。
   - 触发条件：追求目录表面一致性，忽略历史可读性。
   - 缓解措施：本阶段只做新路径收口和必要迁移，不做全量历史改名；历史数据保留可读性优先。

---

## 6. 推荐 PR 拆分

### PR-1：代码路径收口

包含：

1. `SkillPaths.ts`
2. `ConnectorOwnerStore.ts`
3. `SkillInstallManager.ts`
4. `routes/skills.ts`
5. `RelayClawAgentService.ts`
6. 对应测试

收益：

1. 新运行立即停止写旧路径/旧前缀。
2. 为后续迁移提供稳定目标路径。

### PR-2：skills 资产迁移

包含：

1. `pptx-craft-simple` 迁入 `office-claw-skills/`
2. 视验证结果补充 `pptx-craft` 子模块
3. BOOTSTRAP / manifest / 相关 skill 索引同步

收益：

1. 保住仍有价值的 skill 资产。
2. 避免粗暴删除导致能力丢失。

### PR-3：打包与安装器同步

包含：

1. Windows installer 相关测试/文档/脚本
2. 确认最终产物不再包含旧目录名

收益：

1. 从最终交付物层面消除双轨。

### PR-4：运行时迁移与清理

包含：

1. 迁移脚本或迁移说明
2. 用户目录/项目目录的数据迁移策略
3. 可选的旧目录清理

收益：

1. 解决你当前机器上的并存问题。
2. 防止用户继续看到 `.cat-cafe` 与 `.office-claw` 并存。

---

## 7. 实施顺序

推荐严格按以下顺序执行：

1. Phase 3A：代码路径收口
2. 跑测试，确认新写路径与新 session 前缀生效
3. Phase 3B：迁移 `pptx-craft-simple`
4. 测试 `pptx-craft` / `pptx-craft-simple` 两个版本
5. 如有必要，再迁移 `pptx-craft` 子模块
6. Phase 3C：同步安装器/打包链路
7. 验证最终 bundle
8. Phase 3D：执行一次性迁移/清理
9. 最后再决定是否删除 `cat-cafe-skills/`

---

## 8. 验收标准

### 8.1 代码与接口层

- [ ] 生产代码默认路径不再写 `.cat-cafe/skills`
- [ ] 生产代码默认官方技能目录不再指向 `cat-cafe-skills`
- [ ] API 返回给前端的本地 skill 路径不再出现 `.cat-cafe`
- [ ] 新 sessionId 不再以 `catcafe_` 开头

### 8.2 skills 层

- [ ] `office-claw-skills/` 中存在 `pptx-craft`
- [ ] `office-claw-skills/` 中存在 `pptx-craft-simple`
- [ ] agent 扫描 skill 列表时，两个版本都可见或符合预期
- [ ] 若 `pptx-craft` 仍声明子模块依赖，则目录结构与声明一致

### 8.3 打包层

- [ ] Windows offline installer 测试通过
- [ ] 最终 bundle 不再把 `cat-cafe-skills/` 当正式运行目录
- [ ] 安装包中默认路径说明不再出现旧 skills 目录名

### 8.4 运行时层

- [ ] 新运行只写 `.office-claw`
- [ ] 历史 `.cat-cafe` 数据不再被继续增量写入
- [ ] 用户目录双轨状态已有明确迁移或保留策略

---

## 9. 不建议的做法

以下做法本轮不建议采用：

1. 直接删除 `cat-cafe-skills/`
2. 仅凭“代码搜不到引用”判定某个 skill 无用
3. 先把 `cat-cafe-skills/` 重命名到 `.backup/` 再慢慢想后续
4. 不改测试与打包链路，只在本地手动挪目录
5. 强制重命名所有历史 `catcafe_*` session 目录

---

## 10. 一句话结论

第三轮的正确打开方式不是“删旧目录”，而是：

**先让新代码和新安装包只走 `office-claw` 主路径，再把 `cat-cafe-skills/` 中仍有价值的 skills 资产安全迁移过去，最后处理历史双轨数据。**

其中 `pptx-craft-simple` 按当前分析结论属于**必须迁移**项，`pptx-craft` 子模块属于**按运行时能力验证决定是否补迁**项。

---

**文档版本**：v3.0
**修订依据**：当前代码现状 + `workspace/pptx-craft-version-analysis.md`
**执行建议**：按 `代码收口 -> skills 迁移 -> 打包同步 -> 运行时迁移` 四段式推进
