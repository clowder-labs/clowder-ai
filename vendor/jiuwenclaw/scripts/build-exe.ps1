# JiuwenClaw 打包 exe 脚本
# 用法: .\scripts\build-exe.ps1  或  pwsh -File scripts\build-exe.ps1

$ErrorActionPreference = "Stop"

function Resolve-UvCommand {
    $candidates = @(
        (Get-Command uv -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue),
        "$env:USERPROFILE\AppData\Roaming\360se6\Application\components\Node\python\uv.exe"
    ) | Where-Object { $_ }
    foreach ($candidate in $candidates | Select-Object -Unique) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }
    return $null
}

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$WebDir = Join-Path $ProjectRoot "jiuwenclaw\web"
$DistExe = Join-Path $ProjectRoot "dist\jiuwenclaw.exe"
$BuildVenv = Join-Path $ProjectRoot ".build-venv"
$BuildPython = Join-Path $BuildVenv "Scripts\python.exe"
$UvCommand = Resolve-UvCommand

Set-Location $ProjectRoot

Write-Host "=== JiuwenClaw 打包 exe ===" -ForegroundColor Cyan
Write-Host "项目目录: $ProjectRoot`n" -ForegroundColor Gray

if (-not (Test-Path $WebDir)) {
    throw "前端目录不存在: $WebDir"
}

# 1. 安装依赖
if ($UvCommand) {
    Write-Host "[1/3] 安装 Python 依赖 (uv sync --extra dev)..." -ForegroundColor Yellow
    & $UvCommand sync --extra dev
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $PythonCommand = @($UvCommand, "run", "python")
    $PyInstallerCommand = @($UvCommand, "run", "pyinstaller")
} else {
    Write-Host "[1/3] 安装 Python 依赖 (venv + pip)..." -ForegroundColor Yellow
    if (-not (Test-Path $BuildPython)) {
        python -m venv $BuildVenv
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    & $BuildPython -m pip install --upgrade pip setuptools wheel
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $BuildPython -m pip install -e ".[dev]"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    $PythonCommand = @($BuildPython)
    $PyInstallerCommand = @($BuildPython, "-m", "PyInstaller")
}

# 2. 构建前端
Write-Host "`n[2/3] 构建前端 (jiuwenclaw/web)..." -ForegroundColor Yellow
Push-Location $WebDir
try {
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    npm run build
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

# 3. 执行 PyInstaller 打包
Write-Host "`n[3/3] 执行 PyInstaller 打包..." -ForegroundColor Yellow
& $PyInstallerCommand[0] @($PyInstallerCommand[1..($PyInstallerCommand.Length - 1)]) "scripts\jiuwenclaw.spec"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n=== 打包完成 ===" -ForegroundColor Green
Write-Host "主程序: $DistExe" -ForegroundColor Green
