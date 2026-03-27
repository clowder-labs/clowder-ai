Unicode True
RequestExecutionLevel user
SetCompress off

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"

; --------------- Visual assets ---------------
; Place these files under packaging\windows\assets\:
;   app.ico              — 256x256 multi-res icon
;   welcome.bmp          — 164x314 px, 24-bit BMP (welcome & finish left panel)
;   header.bmp           — 150x57  px, 24-bit BMP (directory & instfiles header)
!define ASSETS_DIR "${__FILEDIR__}\assets"

!define MUI_ICON   "${ASSETS_DIR}\app.ico"
!define MUI_UNICON "${ASSETS_DIR}\app.ico"

!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP       "${ASSETS_DIR}\header.bmp"
!define MUI_HEADERIMAGE_RIGHT

; --------------- Abort warning ---------------
!define MUI_ABORTWARNING
!define MUI_ABORTWARNING_TEXT "确定要取消安装 ${APP_NAME} 吗？"

!ifndef APP_VERSION
!define APP_VERSION "0.0.0"
!endif

!ifndef PAYLOAD_TAR
!error "PAYLOAD_TAR define is required"
!endif

!ifndef OUTPUT_EXE
!define OUTPUT_EXE "OfficeClaw-windows-x64-setup.exe"
!endif

!define APP_NAME "OfficeClaw"
!define COMPANY_KEY "ClowderLabs"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
!define INSTALL_KEY "Software\${COMPANY_KEY}\${APP_NAME}"
!define STARTMENU_DIR "$SMPROGRAMS\${APP_NAME}"
!define DEFAULT_INSTALL_DIR "$LOCALAPPDATA\Programs\${APP_NAME}"

Name "${APP_NAME}"
OutFile "${OUTPUT_EXE}"
InstallDir "${DEFAULT_INSTALL_DIR}"
InstallDirRegKey HKCU "${INSTALL_KEY}" "InstallDir"
BrandingText "${APP_NAME} Offline Installer"
ShowInstDetails show
ShowUninstDetails nevershow

; --------------- Welcome page (custom nsDialogs, no left bitmap) ---------------
Page custom WelcomePageCreate

; --------------- Directory page ---------------
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE VerifyInstallDirLeave
!insertmacro MUI_PAGE_DIRECTORY

; --------------- Install page ---------------
!insertmacro MUI_PAGE_INSTFILES

; --------------- Finish page ---------------
!define MUI_FINISHPAGE_TITLE "安装完成"
!define MUI_FINISHPAGE_TEXT "${APP_NAME} 已成功安装到您的计算机。$\r$\n$\r$\n点击「完成」退出安装向导。"
!define MUI_FINISHPAGE_RUN "$INSTDIR\OfficeClaw.exe"
!define MUI_FINISHPAGE_RUN_TEXT "立即启动 ${APP_NAME}"
!define MUI_FINISHPAGE_NOREBOOTSUPPORT
!insertmacro MUI_PAGE_FINISH

; --------------- Uninstaller pages ---------------
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; --------------- Language ---------------
!insertmacro MUI_LANGUAGE "SimpChinese"

Var WelcomeDialog

Function WelcomePageCreate
  !insertmacro MUI_HEADER_TEXT "欢迎安装 ${APP_NAME}" "本向导将引导您完成 ${APP_NAME} v${APP_VERSION} 的安装"
  nsDialogs::Create 1018
  Pop $WelcomeDialog
  ${If} $WelcomeDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 80% "欢迎使用 ${APP_NAME} v${APP_VERSION} 安装向导。$\r$\n$\r$\n${APP_NAME} 是一套开箱即用的本地 AI 运行环境，安装完成后即可使用。$\r$\n$\r$\n本安装包包含以下组件：$\r$\n  - Node.js 运行时$\r$\n  - Python 运行时$\r$\n  - Redis 数据库$\r$\n  - Web 管理界面$\r$\n  - MCP Server$\r$\n$\r$\n点击「下一步」选择安装位置。"
  Pop $0

  nsDialogs::Show
FunctionEnd

Function .onInit
  SetShellVarContext current
FunctionEnd

Function un.onInit
  SetShellVarContext current
FunctionEnd

Function .onVerifyInstDir
  StrLen $0 $INSTDIR
  ${If} $0 > 200
    Abort
  ${EndIf}
FunctionEnd

Function VerifyInstallDirLeave
  StrLen $0 $INSTDIR
  ${If} $0 > 200
    MessageBox MB_ICONEXCLAMATION|MB_OK "安装路径过长（$0 字符），请选择较短的路径。"
    Abort
  ${EndIf}
FunctionEnd

; Force-kill every process whose executable lives under $INSTDIR.
; Uses env var to pass the path safely (avoids quoting issues with spaces/parens).
!macro _ForceKillInstalledProcesses
  ; Kill by matching executable path under $INSTDIR
  System::Call 'Kernel32::SetEnvironmentVariable(t "OFFICECLAW_INSTDIR", t "$INSTDIR")i'
  nsExec::ExecToLog '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "Get-Process | Where-Object { $$_.Path -and $$_.Path.StartsWith($$env:OFFICECLAW_INSTDIR, [System.StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force -ErrorAction SilentlyContinue"'
  Pop $0
  ; Fallback: kill desktop launcher by image name in case Path was inaccessible
  nsExec::ExecToLog 'taskkill /F /IM OfficeClaw.exe'
  Pop $0
  Sleep 1500
!macroend

Function CloseRunningServices
  !insertmacro _ForceKillInstalledProcesses
FunctionEnd

Function un.CloseRunningServices
  !insertmacro _ForceKillInstalledProcesses
FunctionEnd

; Delete all managed dirs/files in $INSTDIR, preserving user-data (.cat-cafe, data, logs, .env, cat-config.json).
; Uses cmd /c rd /s /q for speed — handles tens of thousands of files near-instantly.
!macro _CleanupManagedPayload
  nsExec::ExecToLog 'cmd /c rd /s /q "$INSTDIR\packages"'
  Pop $0
  nsExec::ExecToLog 'cmd /c rd /s /q "$INSTDIR\tools"'
  Pop $0
  nsExec::ExecToLog 'cmd /c rd /s /q "$INSTDIR\vendor"'
  Pop $0
  nsExec::ExecToLog 'cmd /c rd /s /q "$INSTDIR\scripts"'
  Pop $0
  nsExec::ExecToLog 'cmd /c rd /s /q "$INSTDIR\docs"'
  Pop $0
  nsExec::ExecToLog 'cmd /c rd /s /q "$INSTDIR\cat-cafe-skills"'
  Pop $0
  nsExec::ExecToLog 'cmd /c rd /s /q "$INSTDIR\installer-seed"'
  Pop $0
  Delete "$INSTDIR\.clowder-release.json"
  Delete "$INSTDIR\.env.example"
  Delete "$INSTDIR\package.json"
  Delete "$INSTDIR\pnpm-lock.yaml"
  Delete "$INSTDIR\pnpm-workspace.yaml"
  Delete "$INSTDIR\README.md"
  Delete "$INSTDIR\SETUP.md"
  Delete "$INSTDIR\LICENSE"
  Delete "$INSTDIR\AGENTS.md"
  Delete "$INSTDIR\CLA.md"
  Delete "$INSTDIR\CLAUDE.md"
  Delete "$INSTDIR\GEMINI.md"
  Delete "$INSTDIR\SECURITY.md"
  Delete "$INSTDIR\CONTRIBUTING.md"
  Delete "$INSTDIR\MAINTAINERS.md"
  Delete "$INSTDIR\TRADEMARKS.md"
  Delete "$INSTDIR\biome.json"
  Delete "$INSTDIR\tsconfig.base.json"
  Delete "$INSTDIR\.npmrc"
  Delete "$INSTDIR\cat-template.json"
!macroend

Function CleanupManagedPayload
  !insertmacro _CleanupManagedPayload
FunctionEnd

Function un.CleanupManagedPayload
  !insertmacro _CleanupManagedPayload
FunctionEnd

Function WriteShellShortcuts
  CreateDirectory "${STARTMENU_DIR}"
  CreateShortCut "${STARTMENU_DIR}\Start ${APP_NAME}.lnk" "$INSTDIR\OfficeClaw.exe" "" "$INSTDIR\OfficeClaw.exe"
  CreateShortCut "${STARTMENU_DIR}\Stop ${APP_NAME}.lnk" "$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" '-NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\scripts\stop-windows.ps1"' "$INSTDIR\scripts\stop-windows.ps1"
  CreateShortCut "${STARTMENU_DIR}\Uninstall ${APP_NAME}.lnk" "$INSTDIR\uninstall.exe"
  CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\OfficeClaw.exe" "" "$INSTDIR\OfficeClaw.exe"
FunctionEnd

Function WriteUninstallRegistry
  WriteRegStr HKCU "${INSTALL_KEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "Clowder Labs"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
FunctionEnd

Section "Install"
  Call CloseRunningServices
  CreateDirectory "$INSTDIR"
  Call CleanupManagedPayload

  ; Extract payload tar to a temp location then unpack via Windows tar.exe
  DetailPrint "正在释放安装文件..."
  SetOutPath "$INSTDIR"
  File "${PAYLOAD_TAR}"
  DetailPrint "正在解压安装文件..."
  nsExec::ExecToLog '"$WINDIR\System32\tar.exe" -xzf "$INSTDIR\payload.tar.gz" -C "$INSTDIR"'
  Pop $0
  Delete "$INSTDIR\payload.tar.gz"

  CreateDirectory "$INSTDIR\data"
  CreateDirectory "$INSTDIR\logs"
  CreateDirectory "$INSTDIR\.cat-cafe"

  IfFileExists "$INSTDIR\.env" +2 0
    CopyFiles /SILENT "$INSTDIR\.env.example" "$INSTDIR\.env"
  IfFileExists "$INSTDIR\cat-config.json" +2 0
    CopyFiles /SILENT "$INSTDIR\installer-seed\cat-config.json" "$INSTDIR\cat-config.json"

  ; Add firewall rules so Windows does not prompt user when node.exe listens on a port
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${APP_NAME} Node.js"'
  Pop $0
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="${APP_NAME} Node.js" dir=in action=allow program="$INSTDIR\tools\node\node.exe" enable=yes profile=any'
  Pop $0

  WriteUninstaller "$INSTDIR\uninstall.exe"
  Call WriteShellShortcuts
  Call WriteUninstallRegistry
SectionEnd

Var RemoveUserData

Section "Uninstall"
  Call un.CloseRunningServices

  Delete "${STARTMENU_DIR}\Start ${APP_NAME}.lnk"
  Delete "${STARTMENU_DIR}\Stop ${APP_NAME}.lnk"
  Delete "${STARTMENU_DIR}\Uninstall ${APP_NAME}.lnk"
  RMDir "${STARTMENU_DIR}"
  Delete "$DESKTOP\${APP_NAME}.lnk"

  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  DeleteRegKey HKCU "${INSTALL_KEY}"

  ; Remove firewall rule
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="${APP_NAME} Node.js"'
  Pop $0

  ; Ask user whether to remove user data
  MessageBox MB_YESNO|MB_ICONQUESTION "是否同时删除用户数据（配置、数据库、日志）？$\r$\n$\r$\n选择「否」将保留 data、logs、.cat-cafe、.env 和 cat-config.json。" IDYES +3
    StrCpy $RemoveUserData "0"
    Goto +2
    StrCpy $RemoveUserData "1"

  ; Remove entire install dir via cmd rd for speed
  Delete "$INSTDIR\uninstall.exe"
  ${If} $RemoveUserData == "1"
    nsExec::ExecToLog 'cmd /c rd /s /q "$INSTDIR"'
    Pop $0
  ${Else}
    Call un.CleanupManagedPayload
    RMDir "$INSTDIR"
  ${EndIf}
SectionEnd
