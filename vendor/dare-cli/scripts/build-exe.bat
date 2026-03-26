@echo off
setlocal

REM DARE CLI 打包 exe 脚本
REM 用法: scripts\build-exe.bat  或双击运行

cd /d "%~dp0\.."

set "BUILD_PYTHON=.build-venv\Scripts\python.exe"

echo === DARE CLI 打包 exe ===
echo 项目目录: %cd%
echo.

if not exist "requirements.txt" (
  echo 错误: 未找到 requirements.txt
  exit /b 1
)

echo [1/2] 安装 Python 依赖...
where uv >nul 2>nul
if %ERRORLEVEL% EQU 0 (
  if not exist "%BUILD_PYTHON%" (
    call uv venv .build-venv || goto :error
  )
  call uv pip install --python "%BUILD_PYTHON%" -r requirements.txt pyinstaller || goto :error
) else (
  if not exist "%BUILD_PYTHON%" (
    python -m venv .build-venv || goto :error
  )
  call "%BUILD_PYTHON%" -m pip install --upgrade pip setuptools wheel || goto :error
  call "%BUILD_PYTHON%" -m pip install -r requirements.txt pyinstaller || goto :error
)

echo.
echo [2/2] 执行 PyInstaller 打包...
call "%BUILD_PYTHON%" -m PyInstaller scripts\dare.spec || goto :error

echo.
echo === 打包完成 ===
echo 主程序: %cd%\dist\dare.exe
exit /b 0

:error
echo.
echo 打包失败，退出码: %ERRORLEVEL%
exit /b %ERRORLEVEL%
