# DARE CLI PyInstaller 打包

这个目录提供了与 `vendor/jiuwenclaw` 同风格的 PyInstaller 打包入口，用于生成独立的 `dare` 可执行文件。

## 产物

- Windows: `dist/dare.exe`
- macOS / Linux: `dist/dare`

## 快速开始

在 `vendor/dare-cli/` 目录下执行：

```powershell
.\scripts\build-exe.ps1
```

或直接运行 PyInstaller：

```bash
python -m pip install -r requirements.txt pyinstaller
python -m PyInstaller scripts/dare.spec
```

## 打包内容

- 入口：`scripts/dare_exe_entry.py`
- 代码：`client/` 与 `dare_framework/`
- 示例文件：`client/examples/*`
- 运行所需 metadata：`anthropic`、`openai`、`langchain-openai`、`langchain-core` 等

## 运行时说明

- 可执行文件仍然从外部文件系统读取 `.dare/config.json`、workspace 下的 `.dare/` 目录、脚本文件和 MCP 配置。
- `client/examples/` 中的示例会被一并打入包内，方便做首跑验证。
- 若后续新增通过 `__import__` 或延迟导入加载的模块，需要同步更新 `scripts/dare.spec` 的 `hiddenimports`。
