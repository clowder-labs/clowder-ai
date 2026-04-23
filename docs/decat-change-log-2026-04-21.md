# 2026-04-21 OfficeClaw 去猫改造变更清单

## 已完成

- 基线确认到 `origin/codex/decoupling-main-replay-20260421` 对应提交 `acc9a16`
- Workspace 包作用域统一为 `@office-claw/*`
- 顶层项目名统一为 `office-claw` / `OfficeClaw`
- 主要工程文件、安装器、桌面壳、发布元数据名改为 OfficeClaw 体系
- 多个 tracked 文件完成重命名
- 大量文档、脚本、前端文案、测试样例完成前两轮中性化清理
- 保留了 `jiuwenclaw` 相关包名、目录名、import 路径、可执行名、运行时目录名

## 关键工程调整

- `package.json`
  - 根包名保持为 `office-claw`
  - 根脚本切换到 `scripts/init-office-claw.sh`
  - `pnpm --filter` 目标切换到 `@office-claw/api`
- `packages/*/package.json`
  - 旧 workspace scope 统一为 `@office-claw/*`
- `packages/api/src/utils/cat-cafe-root.ts` -> `packages/api/src/utils/office-claw-root.ts`
- `scripts/init-cafe.sh` -> `scripts/init-office-claw.sh`
- `packaging/windows/desktop/OfficeClawDesktop.cs`、`packaging/windows/desktop/OfficeClawDesktop.manifest`
- `packaging/macos/desktop/OfficeClawDesktop.swift`、`packaging/macos/desktop/OfficeClaw.entitlements`
- 旧发布配置引用统一调整为 `.office-claw-release.json`
- macOS bundle 标识改为：
  - `CFBundleName = OfficeClaw`
  - `CFBundleDisplayName = OfficeClaw`
  - `CFBundleExecutable = OfficeClaw`
  - `CFBundleIdentifier = ai.officeclaw.desktop`

## 代表性修改范围

- 顶层文档
  - `README.md`
  - `README.en.md`
  - `SETUP.md`
  - `SETUP.zh-CN.md`
  - `SECURITY.md`
  - `TRADEMARKS.md`
  - `CLAUDE.md`
  - `AGENTS.md`
  - `GEMINI.md`
- 重点包
  - `packages/api`
  - `packages/web`
  - `packages/core`
  - `packages/shared`
  - `packages/mcp-server`
  - `packages/plugin-api`
  - `packages/provider-a2a`
  - `packages/provider-echo`
- 工程与打包
  - `scripts/*`
  - `packaging/*`
  - `macos/*`
- 文档
  - `docs/*`

## 验证结果

- `pnpm install`：通过
- `pnpm build`：通过

## 当前仍存在的残留

以下残留在本轮结束时仍存在，未达到“grep 仅剩允许项”的严格目标：

- 大量测试基线仍保留历史展示名与 mention 文案
  - 主要集中在：
    - `packages/api/test/**`
    - `packages/web/src/**/__tests__/**`
- 少量入口和辅助脚本仍有旧品牌文案残留
  - 例如：
    - `.env.example`
    - `CODEOWNERS`
    - 部分 `scripts/*-api.py`
- 少量历史说明文档仍在记录旧术语作为整改对象示例
  - 例如：
    - `docs/discussions/de-cat-remediation*.md`
    - 部分 `docs/features/*.md`

## 明确保留项

以下内容按要求保留，不应作为本轮去猫残留处理：

- `vendor/jiuwenclaw/**`
- `.jiuwenclaw` 路径
- `jiuwenclaw` 包名、目录名、import、可执行名、运行时目录
- `.office-claw/` 这类运行时数据目录说明

## 后续建议

如果要满足“最终 grep 只剩允许保留项”的严格标准，下一轮应专门处理：

1. `packages/api/test/**` 的历史 fixture 与断言
2. `packages/web/src/**/__tests__/**` 的展示名、mention、快照与说明字符串
3. `.env.example`、`CODEOWNERS`、少量 `scripts/*-api.py` 的品牌残留
4. `docs/features/**` 与 `docs/discussions/**` 中作为历史整改对象留下的旧术语

本轮优先保证了工程命名收口和可构建性，未继续做会大规模扰动测试语义的全量测试基线重写。
