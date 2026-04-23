---
feature_ids: []
topics: [cat, cafe, skills]
doc_kind: decision
created: 2026-02-26
---

# ADR-009: OfficeClaw Skills 分发策略

> 状态：已决策
> 日期：2026-02-10
> 决策者：用户 + Claude

## 背景

OfficeClaw Skills 是从 Superpowers 改进而来的协作规则 skills，需要让各智能体都能加载。

### 问题

1. 三只猫读取 skills 的位置不同
2. 当前 `.claude/skills/` 被 gitignored，无法提交到 repo
3. 需要让 skills 在任何项目中都能加载（用户级）

## 调研结果

### 三猫 Skills 目录

| 猫 | 用户级（全局） | 项目级 | 当前状态 |
|----|----------------|--------|----------|
| Claude | `~/.claude/skills/` | `.claude/skills/` | 用户级不存在 |
| Codex | `~/.codex/skills/` | `.codex/skills/`? | 用户级存在，有 20+ skills |
| Gemini | `~/.gemini/skills/` | `.gemini/skills/` | 用户级不存在 |

### 来源

- Claude: [Extend Claude with skills](https://code.claude.com/docs/en/skills)
- Codex: `~/.codex/skills/` 和 `~/.codex/superpowers/` 实际存在
- Gemini: [Agent Skills | Gemini CLI](https://geminicli.com/docs/cli/skills/)

## 决策

### 1. 源目录（Git 追踪）

创建 `office-claw-skills/` 作为源目录：

```
office-claw/
└── office-claw-skills/           # ← Git 追踪的源目录
    ├── merge-approval-gate/
    │   └── SKILL.md
    ├── spec-compliance-check/
    │   └── SKILL.md
    ├── cross-cat-handoff/
    │   └── SKILL.md
    ├── office-claw-requesting-review/
    │   └── SKILL.md
    ├── office-claw-receiving-review/
    │   └── SKILL.md
    └── feat-discussion/
        └── SKILL.md
```

### 2. Symlink 到用户级 Skills 目录

让三只猫在**任何项目**都能加载这些 skills：

```bash
# 源目录绝对路径
SOURCE=/path/to/project-skills

# Claude 用户级（每个 skill 单独 symlink）
mkdir -p ~/.claude/skills
for skill in "$SOURCE"/*/; do
  ln -sf "$skill" ~/.claude/skills/$(basename "$skill")
done

# Codex 用户级
for skill in "$SOURCE"/*/; do
  ln -sf "$skill" ~/.codex/skills/$(basename "$skill")
done

# Gemini 用户级
mkdir -p ~/.gemini/skills
for skill in "$SOURCE"/*/; do
  ln -sf "$skill" ~/.gemini/skills/$(basename "$skill")
done
```

**重要**：必须为每个 skill 创建单独的 symlink，不能用目录级 symlink（Claude Code 不会递归扫描子目录）。

### 3. 为什么选择用户级而非项目级

1. **任何项目都能用**：OfficeClaw 的协作规则应该对各智能体在任何项目都生效
2. **单一来源**：源文件在 `office-claw-skills/`，symlink 到三个用户级目录
3. **易于更新**：更新源文件，三只猫自动同步
4. **可开源分享**：`office-claw-skills/` 在 git 里，别人可以 clone 后自己 symlink

## 实施步骤

```bash
# 1. 创建源目录
mkdir -p office-claw-skills

# 2. 移动现有 skills（从 .claude/skills/）
mv .claude/skills/merge-approval-gate office-claw-skills/
mv .claude/skills/spec-compliance-check office-claw-skills/
mv .claude/skills/cross-cat-handoff office-claw-skills/
mv .claude/skills/office-claw-requesting-review office-claw-skills/
mv .claude/skills/office-claw-receiving-review office-claw-skills/
mv .claude/skills/feat-discussion office-claw-skills/

# 3. 创建用户级 symlinks
mkdir -p ~/.claude/skills ~/.gemini/skills
ln -s $(pwd)/office-claw-skills ~/.claude/skills/office-claw-skills
ln -s $(pwd)/office-claw-skills ~/.codex/skills/office-claw-skills
ln -s $(pwd)/office-claw-skills ~/.gemini/skills/office-claw-skills
```

## Tradeoff

### 选择了
- 用户级 symlink（全局生效）
- 单一源目录（易于维护）

### 放弃了
- 项目级 skills（需要每个项目都配置）
- 复制而非 symlink（多份维护困难）

## 否决理由（P0.5 回填）

- **备选方案 A**：仅保留项目级 skills（不做用户级分发）
  - 不选原因：每个项目都要重复配置，三猫跨项目协作规则无法稳定复用。
- **备选方案 B**：把 skill 文件复制到三套用户目录（不使用 symlink）
  - 不选原因：会形成多份副本并导致版本漂移，后续维护成本高且容易失配。
- **备选方案 C**：目录级单个 symlink（不按 skill 粒度链接）
  - 不选原因：部分客户端不会递归扫描子目录，可能出现“已链接但不可加载”的隐性故障。

**不做边界**：本轮不引入自动安装器和跨机器同步脚本，先以单一源目录 + 用户级链接为基线。

## 相关文档
