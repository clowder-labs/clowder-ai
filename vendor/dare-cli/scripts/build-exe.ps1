# DARE CLI 打包 exe 脚本
# 用法: .\scripts\build-exe.ps1  或  pwsh -File scripts\build-exe.ps1

$ErrorActionPreference = "Stop"

function Resolve-UvCommand {
    $command = Get-Command uv -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -ErrorAction SilentlyContinue
    if ($command -and (Test-Path $command)) {
        return $command
    }
    return $null
}

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$BuildVenv = Join-Path $ProjectRoot ".build-venv"
$BuildPython = Join-Path $BuildVenv "Scripts\python.exe"
$RequirementsFile = Join-Path $ProjectRoot "requirements.txt"
$DistExe = Join-Path $ProjectRoot "dist\dare.exe"
$UvCommand = Resolve-UvCommand

Set-Location $ProjectRoot

Write-Host "=== DARE CLI 打包 exe ===" -ForegroundColor Cyan
Write-Host "项目目录: $ProjectRoot`n" -ForegroundColor Gray

if (-not (Test-Path $RequirementsFile)) {
    throw "依赖文件不存在: $RequirementsFile"
}

Write-Host "[1/2] 安装 Python 依赖..." -ForegroundColor Yellow
if ($UvCommand) {
    if (-not (Test-Path $BuildPython)) {
        & $UvCommand venv $BuildVenv
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    & $UvCommand pip install --python $BuildPython -r $RequirementsFile pyinstaller
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
    if (-not (Test-Path $BuildPython)) {
        python -m venv $BuildVenv
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    & $BuildPython -m pip install --upgrade pip setuptools wheel
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & $BuildPython -m pip install -r $RequirementsFile pyinstaller
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "`n[2/2] 执行 PyInstaller 打包..." -ForegroundColor Yellow
& $BuildPython -m PyInstaller "scripts\dare.spec"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "`n=== 打包完成 ===" -ForegroundColor Green
Write-Host "主程序: $DistExe" -ForegroundColor Green
