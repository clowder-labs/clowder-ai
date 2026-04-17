# PR #108 遗留问题

## 高优先级

### 6. 缺乏 TypeScript 类型

**问题描述**：
所有新增的 `.js` 文件都是纯 JavaScript，没有类型定义（除了 `woff2.d.ts`）。

**影响**：
- 跳过了项目的 TypeScript 严格模式检查
- 增加了维护难度和出错风险

**建议方案**：
- 将 `.js` 文件改为 `.ts`
- 或至少添加 JSDoc 类型注解
- 或添加 `.d.ts` 声明文件

---

### 7. 缺少测试

**问题描述**：
新增了约 4700 行核心逻辑代码，但没有任何测试文件。

**应测试的模块**：
- `converter/slide.js` — DOM 解析逻辑
- `utils.js` — 颜色解析、字体处理
- `embed-fonts/` — 字体嵌入处理

**建议方案**：
- 添加 Vitest 单元测试
- 优先测试核心转换逻辑和字体嵌入功能

---

### 10. 字体嵌入逻辑中缺少错误隔离

**问题描述**：
字体注册失败时错误被捕获并继续，但整个字体嵌入过程可能部分成功、部分失败。

**风险**：
- 最终生成的 PPTX 文件可能损坏但没有明确警告

**建议方案**：
- 添加字体嵌入完整性校验
- 在生成失败时给出明确提示
- 或回退到无字体嵌入模式

---

### 11. `slide.js` 单文件过大

**问题描述**：
`converter/slide.js` 约 1918 行，单文件过大。

**影响**：
- 难以阅读和维护
- 不利于代码审查
- 增加合并冲突概率

**建议拆分方案**：
- `converter/slide-core.js` — 核心转换逻辑
- `converter/slide-text.js` — 文本处理、行内元素
- `converter/slide-shapes.js` — 形状、背景、边框
- `converter/slide-icons.js` — 图标处理（FontAwesome 等）
- `converter/slide-lists.js` — 列表处理

---

### 12. 生成的 output 目录位置不准确

**问题描述**：
`scripts/convert.js` 中输出路径的确定逻辑存在问题：
- 不指定输出路径时，文件直接保存到当前工作目录，可能导致文件散落各处
- 用户可能期望有固定的 output 目录，但实际没有统一管理
- 路径解析使用 `resolve()` 但缺少对相对路径基准目录的处理

**建议方案**：
- 统一默认输出到 `./output/` 目录
- 确保路径解析基于输入文件所在目录而非 CWD
- 添加路径校验和目录自动创建逻辑

---

### 13. Node 环境下 icon（图标）无法被转成 PPTX

**问题描述**：
在纯 Node.js 环境下（非 Playwright 浏览器），FontAwesome 等图标无法正常转换为 PPTX 元素。

**根本原因**：
- 图标处理依赖 `html2canvas` 渲染，而 html2canvas 需要浏览器 DOM API
- `getBoundingClientRect()`、`getComputedStyle()` 等 DOM API 在 Node.js 中不可用
- `@fortawesome/fontawesome-svg-core` 等图标库依赖浏览器环境

**当前状态**：
- 通过 Playwright 无头浏览器运行时可以正常工作
- 纯 Node.js 直接调用核心转换函数时图标会丢失

**建议方案**：
- 使用 SVG 解析替代 html2canvas 进行图标渲染
- 或在 Node 环境下将图标转为独立图片文件后嵌入
- 或为 Node 环境提供专用的图标处理适配器

---

## 已解决

- ~~**问题 1**：`exportToPptx` 重复定义~~ — 已合并为单一定义
- ~~**问题 2**：大量 `console.log` 调试语句~~ — 已清理，仅保留合理的 error/warn
- ~~**问题 5**：iframe `sandbox` 属性过于宽松~~ — `artifact-viewer.tsx` 已移除
- ~~**问题 8**：`renameTTFInPlace` 缓冲区越界风险~~ — 已添加 `Math.min` 边界检查
- ~~**问题 9**：`exportIframeRefs` 竞态条件~~ — 相关代码已移除

## 待确认

- **问题 3**：`.gitignore` 添加 `pnpm-lock.yaml` — 需确认项目根目录 .gitignore 是否已修正
- **问题 11（备注）**：`@xmldom/xmldom` 在浏览器环境不必要 — 代码中已找不到引用，待确认
