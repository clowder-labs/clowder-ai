---
feature_ids: [F140]
doc_kind: migration-guide
created: 2026-04-11
---

# 迁移指南：cat-cafe → OfficeClaw

本文档面向之前运行 cat-cafe 品牌版本的开发者，说明如何升级到 OfficeClaw（去品牌化首发版本）。

## 变更对照表

| 旧 | 新 |
|--------|-------|
| `~/.cat-cafe/` | `~/.office-claw/` |
| `.cat-cafe/`（项目级） | `.office-claw/` |
| `cat-config.json` | `office-claw-config.json` |
| `cat-template.json` | `office-claw-template.json` |
| `cat-catalog.json` | `office-claw-catalog.json` |
| `cat-cafe-skills/` | `office-claw-skills/` |
| `CAT_CAFE_*` 环境变量 | `OFFICE_CLAW_*` |
| `X-Cat-Cafe-User` HTTP 头 | `X-Office-Claw-User` |
| MCP server `cat-cafe-*` | `office-claw-*` |

## 快速开始

### 方案 A：全新安装（推荐）

1. 运行清理脚本移除旧数据：

   ```bash
   # 预览将被删除的内容
   bash scripts/clean-legacy-env.sh --dry-run

   # 执行清理
   bash scripts/clean-legacy-env.sh
   ```

2. 正常启动 OfficeClaw — 首次运行时会自动创建 `~/.office-claw/`。

3. 如需重新配置 API Key：

   ```bash
   node scripts/install-auth-config.mjs modelarts-preset apply \
     --project-dir . --api-key "<your-api-key>"
   ```

### 方案 B：手动迁移

如果需要保留已有数据（provider profiles、catalog）：

```bash
# 移动全局配置目录
mv ~/.cat-cafe ~/.office-claw

# 移动项目级配置目录
mv .cat-cafe .office-claw

# 重命名配置文件
mv cat-config.json office-claw-config.json
mv cat-template.json office-claw-template.json

# 重命名 catalog 文件
mv ~/.office-claw/cat-catalog.json ~/.office-claw/office-claw-catalog.json 2>/dev/null
mv .office-claw/cat-catalog.json .office-claw/office-claw-catalog.json 2>/dev/null
```

然后重建 skill 符号链接：

```bash
# 删除旧符号链接
rm -rf .claude/skills .codex/skills .gemini/skills

# OfficeClaw 会在下次创建会话时自动重建
```

## 环境变量

所有 `CAT_CAFE_*` 环境变量已重命名为 `OFFICE_CLAW_*`。
启动时旧名称仍然生效（自动迁移，带废弃警告），但建议更新 `.env` 文件：

```bash
# 旧 → 新
CAT_CAFE_USER_ID → OFFICE_CLAW_USER_ID
CAT_CAFE_HOOK_TOKEN → OFFICE_CLAW_HOOK_TOKEN
CAT_CAFE_SKIP_AUTH → OFFICE_CLAW_SKIP_AUTH
# 完整列表见 packages/api/src/config/env-registry.ts
```

## HTTP 头

前端已改为发送 `X-Office-Claw-User`（替代 `X-Cat-Cafe-User`）。
后端同时接受新旧两种头（新头优先），过渡期内保持向后兼容。

## MCP Server 名称

`capabilities.json` 中的 MCP server 注册名会在首次读取时自动迁移，无需手动操作。

## 开发期：双分支并行验证

在 main 分支仍在运行的情况下验证 feat/de-cat，**无需移动或删除 `~/.cat-cafe/`**。
两个分支使用独立的数据目录，互不干扰：

| 分支 | 数据目录 | 配置文件 |
|--------|---------------|-------------|
| main | `~/.cat-cafe/` | `cat-config.json` |
| feat/de-cat | `~/.office-claw/` | `office-claw-config.json` |

在 feat/de-cat worktree 目录中直接启动即可：

```bash
cd /path/to/feat-de-cat-worktree
pnpm start:direct
```

`~/.office-claw/` 和 catalog 会在首次运行时自动创建。
除非缺少 provider profiles，否则无需运行 `install-auth-config.mjs`。

## Windows

在 Windows 上通过 Git Bash 或 PowerShell 执行清理：

```powershell
# PowerShell
Remove-Item -Recurse -Force "$env:USERPROFILE\.cat-cafe" -ErrorAction SilentlyContinue
Remove-Item -Force "cat-config.json" -ErrorAction SilentlyContinue
Remove-Item -Force "cat-template.json" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "cat-cafe-skills" -ErrorAction SilentlyContinue
```

Windows 安装包（`build-windows-installer.mjs`）会在构建过程中自动处理路径更新。
