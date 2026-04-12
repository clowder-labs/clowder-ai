# PR #108 遗留问题

## 高优先级

### 4. 外部 CDN 依赖存在风险

**问题描述**：
- `embed-fonts/woff2.js:28` 硬编码了 `unpkg.com` CDN URL
- `embed-fonts/utils.js:5-7` 动态加载 `fonteditor-core` 从 unpkg

**风险**：
- unpkg 在中国大陆可能不稳定
- 没有离线回退方案
- 运行时从 CDN 动态加载代码有安全风险（供应链攻击）

**建议方案**：
- 将字体文件打包到项目中
- 或使用项目自己的 CDN
- 添加离线回退机制

---

### 5. 安全：iframe `sandbox` 属性过于宽松

**问题描述**：
`artifact-viewer.tsx:164` 设置：
```jsx
sandbox="allow-same-origin allow-scripts"
```

`allow-same-origin` + `allow-scripts` 的组合基本等于没有沙箱保护。

**风险**：
- 嵌入的内容可以通过 JS 移除 sandbox 属性
- 如果 `page.html` 包含用户生成的内容，这可能是一个 XSS 向量

**建议方案**：
- 移除 `allow-same-origin`
- 或使用更严格的沙箱配置
- 或对 `page.html` 进行严格的内容审查

---

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

### 9. `exportIframeRefs` 的竞态条件

**问题描述**：
`artifact-viewer.tsx:69-76` 中的 Promise 等待逻辑：
```js
await new Promise<void>((resolve) => {
  exportResolveRef.current = resolve;
  if (exportIframeRefs.current.size >= pages.length) {
    resolve();
  }
});
```

**风险**：
- 如果 React 重渲染导致 `pages.length` 变化，可能导致提前 resolve 或永远不 resolve

**建议方案**：
- 增加超时机制（如 30 秒超时）
- 或使用更可靠的状态管理方式

---

### 10. 字体嵌入逻辑中缺少错误隔离

**问题描述**：
`pptxgenjs.js:35-52` 中，如果单个字体注册失败，错误被捕获并继续，但整个字体嵌入过程可能部分成功、部分失败。

**风险**：
- 最终生成的 PPTX 文件可能损坏但没有明确警告

**建议方案**：
- 添加字体嵌入完整性校验
- 在生成失败时给出明确提示
- 或回退到无字体嵌入模式

---

### 11. `slide.js` 单文件过大

**问题描述**：
`converter/slide.js` 约 1933 行，单文件过大。

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

## 备注

以下问题已在审查中指出但未列入本文件：
- 问题 1：`exportToPptx` 重复定义 — 需重构
- 问题 2：大量 `console.log` 调试语句 — 需清理
- 问题 3：`.gitignore` 添加 `pnpm-lock.yaml` — 需移除（**已确认是误操作，必须修复**）
- 问题 8：`renameTTFInPlace` 缓冲区越界风险 — 需添加边界检查
- 问题 11：`@xmldom/xmldom` 在浏览器环境不必要 — 可移除
