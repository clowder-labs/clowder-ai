# OfficeClaw Skills Bootstrap

<EXTREMELY_IMPORTANT>
你已加载 OfficeClaw Skills。路由规则定义在 `manifest.yaml`。

## Skills 列表（5 个）
 
### 文档处理

| Skill | 触发场景 |
|-------|----------|
| `pdf` | 读取/合并/拆分/加密/OCR PDF 文件 |
| `docx` | 创建/编辑 Word 文档（.docx） |
| `xlsx` | 创建/编辑/读取电子表格（.xlsx/.csv） |
| `pptx-craft`        | 创建/编辑/读取演示文稿（.pptx） |
| `pptx-craft-simple`        | 创建/编辑/读取演示文稿（.pptx） |

### 生活与会议

| Skill | 触发场景 |
|-------|----------|
| `meeting-autopilot-pro` | 会议全生命周期（准备/笔记/跟进） |

### 参考文件（refs/，按需读取）

| 文件 | 内容 |
|------|------|
| `refs/shared-rules.md` | 协作规则（单一真相源） |
| `refs/decision-matrix.md` | 决策权漏斗矩阵 |
| `refs/commit-signatures.md` | 智能体签名表 + @ 句柄 |
| `refs/pr-template.md` | PR 模板 + 云端 review 触发模板 |
| `refs/review-request-template.md` | Review 请求信模板 |
| `refs/vision-evidence-workflow.md` | 前端截图/录屏证据流程（B1） |
| `refs/requirements-checklist-template.md` | 需求点 checklist 模板（B3） |
| `refs/mcp-callbacks.md` | HTTP callback API 参考 |
| `refs/rich-blocks.md` | Rich block 创建指南 |

## 关键规则

1. **Skill 适用就必须加载，没有选择**
2. **完整流程见 `docs/SOP.md`**
3. **三条铁律**：Redis production Redis (sacred) / 同一个体不能 self-review / 不能冒充其他智能体
4. **共用规则在 `refs/shared-rules.md`**（不在各智能体文件里重复）
5. **Reviewer 选择是动态匹配**（`docs/SOP.md` 配对规则），禁止写死 reviewer 人选

## 使用方式

- **Claude**: Skills 自动触发（`~/.claude/skills/`）
- **Codex**: 手动加载 `cat ~/.codex/skills/{skill-name}/SKILL.md`
- **Gemini**: Skills 自动触发（`~/.gemini/skills/`）

## 新增/修改 skill

1. 在 `{skills-dir}/{name}/` 创建 SKILL.md
2. 在 `manifest.yaml` 添加路由条目
3. 创建 symlink：`ln -s .../{skills-dir}/{name} ~/.{claude,codex,gemini}/skills/{name}`（OpenCode 读 `~/.claude/`，自动覆盖）
4. 运行 `pnpm check:skills` 验证

IF A SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.
</EXTREMELY_IMPORTANT>
