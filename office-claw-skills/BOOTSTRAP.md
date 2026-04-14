# OfficeClaw Skills Bootstrap

<EXTREMELY_IMPORTANT>
你已加载 OfficeClaw Skills。路由规则定义在 `manifest.yaml`。

## Skills 列表（23 个）

### 办公套件

| Skill | 触发场景 |
|-------|----------|
| `minimax-docx` | 专业 DOCX 生成、编辑、套模板与结构化排版 |
| `minimax-pdf` | 高视觉质量 PDF 生成、填表与重设计 |
| `minimax-xlsx` | Excel / CSV / TSV 创建、分析、零损编辑与校验 |
| `official-doc-formatter` | 按国标公文规范格式化 Word 文档 |
| `pptx-craft` | 多阶段研究、规划、生成一体化 PPT 流程 |
| `smart-report-automation` | Excel 报表自动化与办公文档批量格式转换 |
| `meeting-autopilot-pro` | 会议全生命周期准备、记录、跟进与行动项追踪 |
| `feishu-calendar-official` | 飞书日历、日程、参会人与忙闲管理 |
| `feishu-meeting` | 通过飞书 API 创建和安排会议 |
| `tencent-meeting` | 腾讯会议创建、查询、取消、录制与转写管理 |
| `email-manager` | 邮件发送、查收、回复、标记与多邮箱管理 |
| `feishu-task` | 飞书任务与任务清单管理 |
| `feishu-perm-transfer` | 飞书文档/表格权限转移与批量协作管理 |
| `android-native-dev` | Android 原生开发、Compose/UI 与构建排障 |
| `frontend-dev` | 高质感前端页面、动效、素材与转化文案 |
| `fullstack-dev` | 全栈应用、API、认证、实时能力与集成 |
| `daily-briefing` | 每日销售简报、优先级和会前准备 |
| `knowledge-organizer-xiaping` | 文章/笔记整理、归档、摘要与同步 |
| `lidan-writing-framework` | 用七步框架把复杂概念写清楚 |
| `canned-responses-review` | 常见法务询问模板回复与升级识别 |
| `three-layer-memory` | OpenClaw 三层持久化记忆方案 |
| `gif-sticker-maker` | 将照片生成 4 张 GIF 表情贴纸 |
| `minimax-multimodal-toolkit` | MiniMax 语音、音乐、视频、图片与媒体处理 |

## 说明

- 当前官方清单以 `office-claw-skills/` 顶层目录中的实际 skill 为准。
- `pptx-craft/designer`、`pptx-craft/planner`、`pptx-craft/outline-research` 是 `pptx-craft` 内部模块，不在本目录中单独注册。
- `BOOTSTRAP.md` 负责分类速览，`manifest.yaml` 负责路由与元数据。

### 参考文件（`refs/`，按需读取）

| 文件 | 内容 |
|------|------|
| `refs/bug-diagnosis-capsule.md` | Bug 诊断胶囊与排障套路 |
| `refs/chatgpt-browser-automation.md` | ChatGPT 浏览器自动化参考 |
| `refs/cicd-tracking.md` | CI/CD 跟踪与状态整理 |
| `refs/claude-ai-browser-automation.md` | Claude 浏览器自动化参考 |
| `refs/feature-doc-template.md` | Feature 文档模板 |
| `refs/gemini-browser-automation.md` | Gemini 浏览器自动化参考 |
| `refs/mcp-callbacks.md` | HTTP callback API 参考 |
| `refs/mcp-tool-description-standard.md` | MCP 工具描述规范 |
| `refs/pr-template.md` | PR 模板 |
| `refs/requirements-checklist-template.md` | 需求点 checklist 模板 |
| `refs/review-request-template.md` | Review 请求信模板 |
| `refs/rich-blocks.md` | Rich block 创建指南 |
| `refs/shared-rules.md` | 通用协作规则与约束 |
| `openai-whisper-cn` | 本地语音转文字、音频转录、会议录音转文本 |

## 关键规则

1. **Skill 适用就必须使用。**
2. **`manifest.yaml` 是触发、路由、描述的单一真相源。**
3. **`BOOTSTRAP.md` 只维护官方 skills 的分类速览，不承载实现细节。**
4. **`refs/` 是参考材料，不是独立 skill。**
5. **新增或修改 skill 时，必须同时同步目录、`manifest.yaml` 与 `BOOTSTRAP.md`。**

## 使用方式

- **Claude**: Skills 自动触发（`~/.claude/skills/`）
- **Codex**: 读取对应 `SKILL.md` 后执行
- **Gemini**: Skills 自动触发（`~/.gemini/skills/`）

## 新增/修改 skill

1. 在 `{skills-dir}/{name}/` 创建或更新 `SKILL.md`
2. 在 `manifest.yaml` 添加或更新路由条目
3. 在 `BOOTSTRAP.md` 将 skill 放入正确分类
4. 保持顶层目录、注册表与说明文档一致
5. 运行校验，确认目录、注册表与 refs 一致

IF A SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.
</EXTREMELY_IMPORTANT>
