#!/usr/bin/env bash
# clean-legacy-env.sh — 清理旧版 cat-cafe 环境数据
#
# 从 cat-cafe 品牌版升级到 OfficeClaw 时运行此脚本。
# 它会删除旧的配置和数据目录，让新版本从干净状态启动。
#
# 用法:
#   bash scripts/clean-legacy-env.sh [--dry-run]
#
# 完整迁移指南见 docs/migration-from-cat-cafe.md

set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "[dry-run] 不会删除任何文件，仅展示将被清理的内容。"
  echo
fi

removed=0

remove_item() {
  local path="$1"
  local desc="$2"
  if [[ -e "$path" || -L "$path" ]]; then
    if $DRY_RUN; then
      echo "  [将删除] $path  ($desc)"
    else
      rm -rf "$path"
      echo "  [已删除] $path  ($desc)"
    fi
    ((removed++))
  fi
}

echo "=== OfficeClaw 旧环境清理 ==="
echo

# 1. 全局用户数据目录
echo "1. 全局配置目录 (~/.cat-cafe/)"
remove_item "$HOME/.cat-cafe" "provider profiles、model profiles、catalog"

# 2. 项目级数据目录（当前工作目录）
echo "2. 项目级配置目录 (.cat-cafe/)"
remove_item ".cat-cafe" "项目级 catalog 和 profiles"

# 3. 旧配置文件
echo "3. 旧配置文件"
remove_item "cat-config.json" "智能体配置（已替换为 office-claw-config.json）"
remove_item "cat-template.json" "智能体模板（已替换为 office-claw-template.json）"

# 4. 旧 skills 目录
echo "4. 旧 skills 目录"
remove_item "cat-cafe-skills" "skills（已替换为 office-claw-skills/）"

# 5. 旧 MCP 配置（含旧 server 名称，启动时会自动重建）
echo "5. 旧 MCP 配置"
remove_item ".mcp.json" "Claude MCP 配置（启动时自动重建）"

# 6. 过时的 skill 符号链接
echo "6. 过时的 skill 符号链接"
for agent_dir in .claude .codex .gemini; do
  skills_dir="$agent_dir/skills"
  if [[ -d "$skills_dir" ]]; then
    find "$skills_dir" -maxdepth 1 -type l | while read -r link; do
      target=$(readlink "$link" 2>/dev/null || true)
      if [[ "$target" == *"cat-cafe-skills"* ]]; then
        remove_item "$link" "指向旧 cat-cafe-skills 的符号链接"
      fi
    done
  fi
done

echo
if [[ $removed -eq 0 ]]; then
  echo "无需清理 — 未发现旧版 cat-cafe 残留。"
else
  if $DRY_RUN; then
    echo "共 $removed 项将被删除。去掉 --dry-run 参数执行实际清理。"
  else
    echo "共 $removed 项已清理。"
    echo
    echo "后续步骤："
    echo "  1. 启动 OfficeClaw — 首次运行时会自动创建 ~/.office-claw/"
    echo "  2. 如需重新配置 API Key，运行 install-auth-config.mjs"
    echo "  详见 docs/migration-from-cat-cafe.md"
  fi
fi
