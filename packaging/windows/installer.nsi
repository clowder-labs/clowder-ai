Unicode True
RequestExecutionLevel user
ManifestDPIAware true
SetCompress off

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

; --------------- Visual assets ---------------
; Place these files under packaging\windows\assets\:
;   app.ico              — 256x256 multi-res icon
!define ASSETS_DIR "${__FILEDIR__}\assets"

!define MUI_ICON   "${ASSETS_DIR}\app.ico"
!define MUI_UNICON "${ASSETS_DIR}\app.ico"

; Font size setting (use Segoe UI for clearer Win11/DPI rendering)
SetFont "Segoe UI" 9

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
!define AUTOSTART_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define AUTOSTART_VALUE "${APP_NAME}"
!define STARTMENU_DIR "$SMPROGRAMS\${APP_NAME}"
!define DEFAULT_INSTALL_DIR "$LOCALAPPDATA\Programs\${APP_NAME}"

Name "${APP_NAME}"
OutFile "${OUTPUT_EXE}"
InstallDir "${DEFAULT_INSTALL_DIR}"
InstallDirRegKey HKCU "${INSTALL_KEY}" "InstallDir"
BrandingText "${APP_NAME} Offline Installer"
ShowInstDetails show
ShowUninstDetails nevershow

Var SelectedInstallDir
Var ExistingInstallDir

; --------------- License page (custom nsDialogs) ---------------
Page custom LicensePageCreate LicensePageLeave

; --------------- Welcome page (custom nsDialogs, no left bitmap) ---------------
Page custom WelcomePageCreate

; --------------- Directory page ---------------
Page custom DirectoryPageCreate VerifyInstallDirLeave

; --------------- Options page ---------------
Page custom OptionsPageCreate OptionsPageLeave

; --------------- Install page ---------------
!insertmacro MUI_PAGE_INSTFILES

; --------------- Finish page (custom nsDialogs, no left bitmap) ---------------
Page custom FinishPageCreate FinishPageLeave

; --------------- Uninstaller pages ---------------
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; --------------- Language ---------------
!insertmacro MUI_LANGUAGE "SimpChinese"

Var LicenseDialog
Var AgreeRadio
Var DisagreeRadio
Var NextButton
Var WelcomeDialog
Var DirectoryDialog
Var DirectoryInput
Var DirectoryBrowseButton
Var OptionsDialog
Var StartMenuShortcutCheckbox
Var DesktopShortcutCheckbox
Var AutoStartCheckbox
Var FinishDialog
Var FinishLaunchCheckbox
Var CreateStartMenuShortcut
Var CreateDesktopShortcut
Var EnableAutoStart
Var DetectedRunningProcesses

; Check if OfficeClaw-related processes are running
; Returns "1" in $R0 if running, "0" otherwise
Function CheckOfficeClawRunning
  StrCpy $R0 "0"

  ; Check OfficeClaw.exe
  nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq OfficeClaw.exe" 2>nul | find /I "OfficeClaw.exe"'
  Pop $0
  Pop $1
  ${If} $0 == 0
    StrCpy $R0 "1"
    Return
  ${EndIf}

  ; Check jiuwenclaw.exe (sidecar agent)
  nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq jiuwenclaw.exe" 2>nul | find /I "jiuwenclaw.exe"'
  Pop $0
  Pop $1
  ${If} $0 == 0
    StrCpy $R0 "1"
    Return
  ${EndIf}

  ; Check redis-server.exe
  nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq redis-server.exe" 2>nul | find /I "redis-server.exe"'
  Pop $0
  Pop $1
  ${If} $0 == 0
    StrCpy $R0 "1"
    Return
  ${EndIf}

  ; Check node.exe processes that belong to OfficeClaw (from installed dir)
  nsExec::ExecToStack '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "$$instDir = (Get-ItemProperty -Path \"HKCU:\Software\ClowderLabs\OfficeClaw\" -Name InstallDir -ErrorAction SilentlyContinue).InstallDir; if ($$instDir) { Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $$_.Path -and $$_.Path.StartsWith($$instDir, [System.StringComparison]::OrdinalIgnoreCase) } | Select-Object -First 1 }"'
  Pop $0
  Pop $1
  ${If} $1 != ""
    StrCpy $R0 "1"
    Return
  ${EndIf}

  ; Check python.exe processes that belong to OfficeClaw (from installed dir tools\python or vendor\.venv)
  nsExec::ExecToStack '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "$$instDir = (Get-ItemProperty -Path \"HKCU:\Software\ClowderLabs\OfficeClaw\" -Name InstallDir -ErrorAction SilentlyContinue).InstallDir; if ($$instDir) { Get-Process -Name python,pythonw -ErrorAction SilentlyContinue | Where-Object { $$_.Path -and $$_.Path.StartsWith($$instDir, [System.StringComparison]::OrdinalIgnoreCase) } | Select-Object -First 1 }"'
  Pop $0
  Pop $1
  ${If} $1 != ""
    StrCpy $R0 "1"
    Return
  ${EndIf}

  ; Check processes whose command line contains 'jiuwenclaw' (case-insensitive)
  nsExec::ExecToStack '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "$$found = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $$_.CommandLine -and $$_.CommandLine -match \"jiuwenclaw\" } | Select-Object -First 1; if ($$found) { \"found\" }"'
  Pop $0
  Pop $1
  ${If} $1 == "found"
    StrCpy $R0 "1"
    Return
  ${EndIf}
FunctionEnd

Function LicensePageCreate
  !insertmacro MUI_HEADER_TEXT "许可协议" "继续安装前请阅读下列重要信息。$\r$\n请仔细阅读下列许可协议，您在继续安装前必须同意这些协议条款。"

  nsDialogs::Create 1018
  Pop $LicenseDialog
  ${If} $LicenseDialog == error
    Abort
  ${EndIf}

  GetDlgItem $NextButton $HWNDPARENT 1
  EnableWindow $NextButton 0

  ${NSD_CreateLabel} 0 10u 100% 12u "${APP_NAME}软件许可协议"
  Pop $0

  ${NSD_CreateLabel} 10u 25u 46u 10u "1.了解和同意"
  Pop $0

  ${NSD_CreateLink} 56u 25u 100% 10u "华为云隐私政策声明"
  Pop $1
  ${NSD_OnClick} $1 "OnPrivacyLinkClick"

  ${NSD_CreateLabel} 10u 40u 46uu 10u "2.了解和同意"
  Pop $0

  ${NSD_CreateLink} 56u 40u 100% 10u "AgentArts服务声明"
  Pop $1
  ${NSD_OnClick} $1 "OnServiceLinkClick"

  ${NSD_CreateRadioButton} 0 100u 100% 12u "我同意此协议(&A)"
  Pop $AgreeRadio
  ${NSD_Setfocus} $AgreeRadio

  ${NSD_OnClick} $AgreeRadio OnAgreementChanged

  ${NSD_CreateRadioButton} 0 115u 100% 12u "我不同意此协议(&D)"
  Pop $DisagreeRadio
  ${NSD_OnClick} $DisagreeRadio OnAgreementChanged

  nsDialogs::Show
FunctionEnd

Function OnPrivacyLinkClick
  Pop $0
  ExecShell "open" "https://www.huaweicloud.com/declaration/sa_prp.html"
FunctionEnd

Function OnServiceLinkClick
  Pop $0
  ExecShell "open" "https://www.huaweicloud.com/declaration/agentarts.html"
FunctionEnd

Function OnAgreementChanged
  Call UpdateNextButtonState
FunctionEnd

Function UpdateNextButtonState
  ${NSD_GetState} $AgreeRadio $0
  ${If} $0 == 1
    EnableWindow $NextButton 1
  ${Else}
    EnableWindow $NextButton 0
  ${EndIf}
FunctionEnd

Function LicensePageLeave
FunctionEnd

Function WelcomePageCreate
  !insertmacro MUI_HEADER_TEXT "欢迎安装 ${APP_NAME}" "本向导将引导您完成 ${APP_NAME} v${APP_VERSION} 的安装"
  nsDialogs::Create 1018
  Pop $WelcomeDialog
  ${If} $WelcomeDialog == error
    Abort
  ${EndIf}

  ${If} $ExistingInstallDir != ""
    ${NSD_CreateLabel} 0 0 100% 80% "欢迎使用 ${APP_NAME} v${APP_VERSION} 安装向导。$\r$\n$\r$\n已检测到本机已安装 ${APP_NAME}，本次将沿用现有安装目录进行更新。$\r$\n$\r$\n您下一步可以确认快捷方式和启动方式等安装选项。"
    Pop $0
  ${Else}
    ${NSD_CreateLabel} 0 0 100% 80% "欢迎使用 ${APP_NAME} v${APP_VERSION} 安装向导。$\r$\n$\r$\n${APP_NAME} 是一套开箱即用的本地 AI 运行环境，安装完成后即可使用。$\r$\n$\r$\n本安装包包含以下组件：$\r$\n  - Node.js 运行时$\r$\n  - Python 运行时$\r$\n  - Redis 数据库$\r$\n  - Web 管理界面$\r$\n  - MCP Server$\r$\n$\r$\n点击「下一步」选择安装位置。"
    Pop $0
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function OptionsPageCreate
  !insertmacro MUI_HEADER_TEXT "安装选项" "请选择快捷方式和启动方式"
  nsDialogs::Create 1018
  Pop $OptionsDialog
  ${If} $OptionsDialog == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "请选择 ${APP_NAME} 的安装附加选项。您后续也可以通过重新运行安装包修改这些设置。"
  Pop $0

  ${NSD_CreateCheckbox} 0 32u 100% 12u "创建开始菜单快捷方式"
  Pop $StartMenuShortcutCheckbox
  ${If} $CreateStartMenuShortcut == "1"
    ${NSD_Check} $StartMenuShortcutCheckbox
  ${EndIf}

  ${NSD_CreateCheckbox} 0 50u 100% 12u "创建桌面快捷方式"
  Pop $DesktopShortcutCheckbox
  ${If} $CreateDesktopShortcut == "1"
    ${NSD_Check} $DesktopShortcutCheckbox
  ${EndIf}

  ${NSD_CreateCheckbox} 0 68u 100% 12u "开机自动启动 ${APP_NAME}"
  Pop $AutoStartCheckbox
  ${If} $EnableAutoStart == "1"
    ${NSD_Check} $AutoStartCheckbox
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function OptionsPageLeave
  ${NSD_GetState} $StartMenuShortcutCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $CreateStartMenuShortcut "1"
  ${Else}
    StrCpy $CreateStartMenuShortcut "0"
  ${EndIf}

  ${NSD_GetState} $DesktopShortcutCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $CreateDesktopShortcut "1"
  ${Else}
    StrCpy $CreateDesktopShortcut "0"
  ${EndIf}

  ${NSD_GetState} $AutoStartCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $EnableAutoStart "1"
  ${Else}
    StrCpy $EnableAutoStart "0"
  ${EndIf}
FunctionEnd

Function FinishPageCreate
  !insertmacro MUI_HEADER_TEXT "安装完成" "${APP_NAME} 已成功安装"
  nsDialogs::Create 1018
  Pop $FinishDialog
  ${If} $FinishDialog == error
    Abort
  ${EndIf}

  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETTEXT} 0 "STR:完成"

  ${NSD_CreateLabel} 0 0 100% 60% "${APP_NAME} 已成功安装到您的计算机。$\r$\n$\r$\n点击「完成」退出安装向导。"
  Pop $0

  ${NSD_CreateCheckbox} 0 65% 100% 12u "立即启动 ${APP_NAME}"
  Pop $FinishLaunchCheckbox
  ${NSD_Check} $FinishLaunchCheckbox

  nsDialogs::Show
FunctionEnd

Function FinishPageLeave
  ${NSD_GetState} $FinishLaunchCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    Exec "$INSTDIR\OfficeClaw.exe"
  ${EndIf}
FunctionEnd

Function .onInit
  SetShellVarContext current
  Call ResolveExistingInstallDir
  Call ResolveInstallOptionDefaults
  ${If} $ExistingInstallDir != ""
    StrCpy $INSTDIR $ExistingInstallDir
    StrCpy $SelectedInstallDir $ExistingInstallDir
    MessageBox MB_ICONINFORMATION|MB_OK "检测到已安装的 ${APP_NAME}，本次安装将更新现有目录：$\r$\n$ExistingInstallDir$\r$\n$\r$\n如需更换安装位置，请先卸载当前版本。"
  ${Else}
    StrCpy $SelectedInstallDir $INSTDIR
  ${EndIf}

  ; Check if OfficeClaw is running
  Call CheckOfficeClawRunning
  ${If} $R0 == "1"
    MessageBox MB_ICONQUESTION|MB_YESNO "检测到 OfficeClaw 正在运行。$\r$\n$\r$\n继续安装需要关闭正在运行的 OfficeClaw 及相关进程。$\r$\n$\r$\n是否关闭进程并继续安装？$\r$\n$\r$\n选择「是」将关闭所有相关进程后继续安装。$\r$\n选择「否」将退出安装程序。" IDYES proceed_install
    Abort
  proceed_install:
    StrCpy $DetectedRunningProcesses "1"
  ${EndIf}
FunctionEnd

Function un.onInit
  SetShellVarContext current

  ; Check if OfficeClaw is running before uninstall
  Call un.CheckOfficeClawRunning
  ${If} $R0 == "1"
    MessageBox MB_ICONQUESTION|MB_YESNO "检测到 OfficeClaw 正在运行。$\r$\n$\r$\n卸载需要关闭正在运行的 OfficeClaw 及相关进程。$\r$\n$\r$\n是否关闭进程并继续卸载？$\r$\n$\r$\n选择「是」将关闭所有相关进程后继续卸载。$\r$\n选择「否」将退出卸载程序。" IDYES proceed_uninstall
    Abort
  proceed_uninstall:
  ${EndIf}
FunctionEnd

Function ResolveExistingInstallDir
  ReadRegStr $0 HKCU "${INSTALL_KEY}" "InstallDir"
  ${If} $0 == ""
    StrCpy $ExistingInstallDir ""
    Return
  ${EndIf}

  IfFileExists "$0\uninstall.exe" existing_install +2
  IfFileExists "$0\OfficeClaw.exe" existing_install 0
    StrCpy $ExistingInstallDir ""
    Return

existing_install:
  StrCpy $ExistingInstallDir $0
FunctionEnd

Function ResolveInstallOptionDefaults
  StrCpy $CreateStartMenuShortcut "1"
  StrCpy $CreateDesktopShortcut "1"
  StrCpy $EnableAutoStart "0"

  ${If} $ExistingInstallDir == ""
    Return
  ${EndIf}

  IfFileExists "${STARTMENU_DIR}\${APP_NAME}.lnk" +2 0
    StrCpy $CreateStartMenuShortcut "0"

  IfFileExists "$DESKTOP\${APP_NAME}.lnk" +2 0
    StrCpy $CreateDesktopShortcut "0"

  ReadRegStr $0 HKCU "${AUTOSTART_KEY}" "${AUTOSTART_VALUE}"
  ${If} $0 != ""
    StrCpy $EnableAutoStart "1"
  ${EndIf}
FunctionEnd

Function DirectoryPageCreate
  ${If} $ExistingInstallDir != ""
    StrCpy $INSTDIR $ExistingInstallDir
    StrCpy $SelectedInstallDir $ExistingInstallDir
    Abort
  ${EndIf}

  !insertmacro MUI_HEADER_TEXT "选择安装位置" "请选择 ${APP_NAME} 的安装目录"

  nsDialogs::Create 1018
  Pop $DirectoryDialog
  ${If} $DirectoryDialog == error
    Abort
  ${EndIf}

  ${If} $SelectedInstallDir == ""
    StrCpy $SelectedInstallDir "${DEFAULT_INSTALL_DIR}"
  ${Else}
    Call NormalizeSelectedInstallDir
  ${EndIf}

  StrCpy $INSTDIR $SelectedInstallDir

  ${NSD_CreateLabel} 0 0 100% 20u "请选择安装路径。若选择父目录，安装器会自动在其下创建 ${APP_NAME} 子目录。"
  Pop $0

  ${NSD_CreateText} 0 28u 78% 12u "$SelectedInstallDir"
  Pop $DirectoryInput

  ${NSD_CreateBrowseButton} 82% 27u 18% 14u "浏览..."
  Pop $DirectoryBrowseButton
  ${NSD_OnClick} $DirectoryBrowseButton OnDirectoryBrowseClicked

  nsDialogs::Show
FunctionEnd

Function OnDirectoryBrowseClicked
  ${If} $DirectoryInput == 0
    Return
  ${EndIf}

  ${NSD_GetText} $DirectoryInput $0
  nsDialogs::SelectFolderDialog "选择安装目录" $0
  Pop $0
  ${If} $0 == error
    Return
  ${EndIf}
  StrCpy $SelectedInstallDir $0
  Call NormalizeSelectedInstallDir
  StrCpy $INSTDIR $SelectedInstallDir
  ${NSD_SetText} $DirectoryInput $SelectedInstallDir
FunctionEnd

Function NormalizeSelectedInstallDir
  ${If} $ExistingInstallDir != ""
    Return
  ${EndIf}

  StrCpy $0 $SelectedInstallDir

trim_trailing_separator:
  StrLen $1 $0
  ${If} $1 <= 3
    Goto check_suffix
  ${EndIf}

  IntOp $2 $1 - 1
  StrCpy $3 $0 1 $2
  ${If} $3 == "\"
  ${OrIf} $3 == "/"
    StrCpy $0 $0 $2
    Goto trim_trailing_separator
  ${EndIf}

check_suffix:
  ${If} $0 == ""
    StrCpy $SelectedInstallDir "${DEFAULT_INSTALL_DIR}"
    Return
  ${EndIf}

  StrLen $1 "${APP_NAME}"
  StrLen $2 $0
  ${If} $2 >= $1
    IntOp $3 $2 - $1
    StrCpy $4 $0 "" $3
    ${If} $4 == "${APP_NAME}"
      ${If} $3 == 0
        StrCpy $SelectedInstallDir $0
        Return
      ${EndIf}

      IntOp $5 $3 - 1
      StrCpy $6 $0 1 $5
      ${If} $6 == "\"
      ${OrIf} $6 == "/"
        StrCpy $SelectedInstallDir $0
        Return
      ${EndIf}
    ${EndIf}
  ${EndIf}

  StrCpy $SelectedInstallDir "$0\${APP_NAME}"
FunctionEnd

Function VerifyInstallDirLeave
  ${If} $ExistingInstallDir != ""
    StrCpy $INSTDIR $ExistingInstallDir
    StrCpy $SelectedInstallDir $ExistingInstallDir
    Return
  ${EndIf}

  ${NSD_GetText} $DirectoryInput $SelectedInstallDir
  Call NormalizeSelectedInstallDir
  StrCpy $INSTDIR $SelectedInstallDir
  StrLen $0 $SelectedInstallDir
  ${If} $0 > 200
    MessageBox MB_ICONEXCLAMATION|MB_OK "安装路径过长（$0 字符），请选择较短的路径。"
    Abort
  ${EndIf}
  ${NSD_SetText} $DirectoryInput $SelectedInstallDir
FunctionEnd

; Force-kill every process related to installed OfficeClaw (launcher, node API, Redis, jiuwenclaw, python).
; Uses env var to pass the path safely (avoids quoting issues with spaces/parens).
; IMPORTANT: Uses registry InstallDir (old install path) for path-based kills, not $INSTDIR (new path).
; This ensures processes from previous installation are killed even when reinstalling to a different directory.
!macro _ForceKillInstalledProcesses
  ; 1. Kill desktop launcher by name only when it exists
  nsExec::ExecToLog 'cmd /c tasklist /FI "IMAGENAME eq OfficeClaw.exe" | find /I "OfficeClaw.exe" >nul && taskkill /F /IM OfficeClaw.exe >nul 2>&1'
  Pop $0
  ; 2. Kill jiuwenclaw.exe (sidecar agent) by name
  nsExec::ExecToLog 'cmd /c tasklist /FI "IMAGENAME eq jiuwenclaw.exe" | find /I "jiuwenclaw.exe" >nul && taskkill /F /IM jiuwenclaw.exe >nul 2>&1'
  Pop $0

  ; 3. Redis: try graceful shutdown via redis-cli first (preserves data), then force-kill if needed
  ReadRegStr $0 HKCU "${INSTALL_KEY}" "InstallDir"
  ${If} $0 != ""
    ; Try redis-cli shutdown save (graceful, preserves data)
    nsExec::ExecToLog 'cmd /c if exist "$0\tools\redis\redis-cli.exe" ( "$0\tools\redis\redis-cli.exe" -p 6399 shutdown save 2>nul ) else if exist "$0\vendor\redis\redis-cli.exe" ( "$0\vendor\redis\redis-cli.exe" -p 6399 shutdown save 2>nul )'
    Pop $1
    ; Check if Redis still running, force-kill if needed
    nsExec::ExecToLog 'cmd /c tasklist /FI "IMAGENAME eq redis-server.exe" | find /I "redis-server.exe" >nul && taskkill /F /IM redis-server.exe >nul 2>&1'
    Pop $1
  ${Else}
    ; No registry path, just force-kill by name
    nsExec::ExecToLog 'cmd /c tasklist /FI "IMAGENAME eq redis-server.exe" | find /I "redis-server.exe" >nul && taskkill /F /IM redis-server.exe >nul 2>&1'
    Pop $0
  ${EndIf}

  ; 4. Multi-round force kill (10 rounds, 5s interval each) - ensures all processes are killed
  ;    Total ~50s wait time, guarantees all processes terminated and file handles released
  ;    Round 1-10: Kill processes whose command line contains 'jiuwenclaw' and path-based matches
  nsExec::ExecToLog '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $$_.CommandLine -and $$_.CommandLine -match \"jiuwenclaw\" -and $$_.Name -notmatch \"setup\" } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"'
  Pop $0
  Sleep 5000

  nsExec::ExecToLog '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "$$instDir = (Get-ItemProperty -Path \"HKCU:\Software\ClowderLabs\OfficeClaw\" -Name InstallDir -ErrorAction SilentlyContinue).InstallDir; if ($$instDir) { Get-Process -Name node,python,pythonw -ErrorAction SilentlyContinue | Where-Object { $$_.Path -and $$_.Path.StartsWith($$instDir, [System.StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force -ErrorAction SilentlyContinue }"'
  Pop $0
  Sleep 5000

  nsExec::ExecToLog '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $$_.CommandLine -and $$_.CommandLine -match \"jiuwenclaw\" -and $$_.Name -notmatch \"setup\" } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"'
  Pop $0
  Sleep 5000

  nsExec::ExecToLog '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "$$instDir = (Get-ItemProperty -Path \"HKCU:\Software\ClowderLabs\OfficeClaw\" -Name InstallDir -ErrorAction SilentlyContinue).InstallDir; if ($$instDir) { Get-Process -ErrorAction SilentlyContinue | Where-Object { $$_.Path -and $$_.Path.StartsWith($$instDir, [System.StringComparison]::OrdinalIgnoreCase) -and $$_.ProcessName -notmatch \"setup\" } | Stop-Process -Force -ErrorAction SilentlyContinue }"'
  Pop $0
  Sleep 5000

  nsExec::ExecToLog '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $$_.CommandLine -and $$_.CommandLine -match \"jiuwenclaw\" -and $$_.Name -notmatch \"setup\" } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"'
  Pop $0
  Sleep 5000

  nsExec::ExecToLog '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "$$instDir = (Get-ItemProperty -Path \"HKCU:\Software\ClowderLabs\OfficeClaw\" -Name InstallDir -ErrorAction SilentlyContinue).InstallDir; if ($$instDir) { Get-Process -Name node,python,pythonw -ErrorAction SilentlyContinue | Where-Object { $$_.Path -and $$_.Path.StartsWith($$instDir, [System.StringComparison]::OrdinalIgnoreCase) } | Stop-Process -Force -ErrorAction SilentlyContinue }"'
  Pop $0
  Sleep 5000

  nsExec::ExecToLog '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $$_.CommandLine -and $$_.CommandLine -match \"jiuwenclaw\" -and $$_.Name -notmatch \"setup\" } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"'
  Pop $0
  Sleep 5000

  nsExec::ExecToLog '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "$$instDir = (Get-ItemProperty -Path \"HKCU:\Software\ClowderLabs\OfficeClaw\" -Name InstallDir -ErrorAction SilentlyContinue).InstallDir; if ($$instDir) { Get-Process -ErrorAction SilentlyContinue | Where-Object { $$_.Path -and $$_.Path.StartsWith($$instDir, [System.StringComparison]::OrdinalIgnoreCase) -and $$_.ProcessName -notmatch \"setup\" } | Stop-Process -Force -ErrorAction SilentlyContinue }"'
  Pop $0
  Sleep 5000

  nsExec::ExecToLog '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $$_.CommandLine -and $$_.CommandLine -match \"jiuwenclaw\" -and $$_.Name -notmatch \"setup\" } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"'
  Pop $0
  Sleep 5000

  nsExec::ExecToLog '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "$$instDir = (Get-ItemProperty -Path \"HKCU:\Software\ClowderLabs\OfficeClaw\" -Name InstallDir -ErrorAction SilentlyContinue).InstallDir; if ($$instDir) { Get-Process -ErrorAction SilentlyContinue | Where-Object { $$_.Path -and $$_.Path.StartsWith($$instDir, [System.StringComparison]::OrdinalIgnoreCase) -and $$_.ProcessName -notmatch \"setup\" } | Stop-Process -Force -ErrorAction SilentlyContinue }"'
  Pop $0
  Sleep 5000
!macroend

Function CloseRunningServices
  !insertmacro _ForceKillInstalledProcesses
FunctionEnd

Function un.CloseRunningServices
  !insertmacro _ForceKillInstalledProcesses
FunctionEnd

; Uninstall version of CheckOfficeClawRunning
Function un.CheckOfficeClawRunning
  StrCpy $R0 "0"

  ; Check OfficeClaw.exe
  nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq OfficeClaw.exe" 2>nul | find /I "OfficeClaw.exe"'
  Pop $0
  Pop $1
  ${If} $0 == 0
    StrCpy $R0 "1"
    Return
  ${EndIf}

  ; Check jiuwenclaw.exe (sidecar agent)
  nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq jiuwenclaw.exe" 2>nul | find /I "jiuwenclaw.exe"'
  Pop $0
  Pop $1
  ${If} $0 == 0
    StrCpy $R0 "1"
    Return
  ${EndIf}

  ; Check redis-server.exe
  nsExec::ExecToStack 'cmd /c tasklist /FI "IMAGENAME eq redis-server.exe" 2>nul | find /I "redis-server.exe"'
  Pop $0
  Pop $1
  ${If} $0 == 0
    StrCpy $R0 "1"
    Return
  ${EndIf}

  ; Check node.exe processes that belong to OfficeClaw (from installed dir)
  nsExec::ExecToStack '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "$$instDir = (Get-ItemProperty -Path \"HKCU:\Software\ClowderLabs\OfficeClaw\" -Name InstallDir -ErrorAction SilentlyContinue).InstallDir; if ($$instDir) { Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $$_.Path -and $$_.Path.StartsWith($$instDir, [System.StringComparison]::OrdinalIgnoreCase) } | Select-Object -First 1 }"'
  Pop $0
  Pop $1
  ${If} $1 != ""
    StrCpy $R0 "1"
    Return
  ${EndIf}

  ; Check python.exe processes that belong to OfficeClaw (from installed dir)
  nsExec::ExecToStack '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "$$instDir = (Get-ItemProperty -Path \"HKCU:\Software\ClowderLabs\OfficeClaw\" -Name InstallDir -ErrorAction SilentlyContinue).InstallDir; if ($$instDir) { Get-Process -Name python,pythonw -ErrorAction SilentlyContinue | Where-Object { $$_.Path -and $$_.Path.StartsWith($$instDir, [System.StringComparison]::OrdinalIgnoreCase) } | Select-Object -First 1 }"'
  Pop $0
  Pop $1
  ${If} $1 != ""
    StrCpy $R0 "1"
    Return
  ${EndIf}

  ; Check processes whose command line contains 'jiuwenclaw' (case-insensitive)
  nsExec::ExecToStack '"$WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "$$found = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $$_.CommandLine -and $$_.CommandLine -match \"jiuwenclaw\" } | Select-Object -First 1; if ($$found) { \"found\" }"'
  Pop $0
  Pop $1
  ${If} $1 == "found"
    StrCpy $R0 "1"
    Return
  ${EndIf}
FunctionEnd

; Delete all managed dirs/files in $INSTDIR, preserving user-data (.cat-cafe, data, logs, .env, cat-config.json).
; Uses cmd /c rd /s /q for speed — handles tens of thousands of files near-instantly.
!macro _CleanupManagedPayload
  nsExec::ExecToLog 'cmd /c if exist "$INSTDIR\packages" rd /s /q "$INSTDIR\packages"'
  Pop $0
  nsExec::ExecToLog 'cmd /c if exist "$INSTDIR\tools" rd /s /q "$INSTDIR\tools"'
  Pop $0
  nsExec::ExecToLog 'cmd /c if exist "$INSTDIR\vendor" rd /s /q "$INSTDIR\vendor"'
  Pop $0
  nsExec::ExecToLog 'cmd /c if exist "$INSTDIR\scripts" rd /s /q "$INSTDIR\scripts"'
  Pop $0
  nsExec::ExecToLog 'cmd /c if exist "$INSTDIR\docs" rd /s /q "$INSTDIR\docs"'
  Pop $0
  nsExec::ExecToLog 'cmd /c if exist "$INSTDIR\office-claw-skills" rd /s /q "$INSTDIR\office-claw-skills"'
  Pop $0
  nsExec::ExecToLog 'cmd /c if exist "$INSTDIR\installer-seed" rd /s /q "$INSTDIR\installer-seed"'
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
  Delete "$INSTDIR\office-claw-template.json"
  Delete "$INSTDIR\pnpm-workspace.yaml"
!macroend

Function CleanupManagedPayload
  !insertmacro _CleanupManagedPayload
FunctionEnd

Function un.CleanupManagedPayload
  !insertmacro _CleanupManagedPayload
FunctionEnd

Function WriteShellShortcuts
  ${If} $CreateStartMenuShortcut == "1"
    CreateDirectory "${STARTMENU_DIR}"
    CreateShortCut "${STARTMENU_DIR}\${APP_NAME}.lnk" "$INSTDIR\OfficeClaw.exe" "" "$INSTDIR\assets\app.ico"
    CreateShortCut "${STARTMENU_DIR}\Uninstall ${APP_NAME}.lnk" "$INSTDIR\uninstall.exe"
  ${Else}
    Delete "${STARTMENU_DIR}\${APP_NAME}.lnk"
    Delete "${STARTMENU_DIR}\Uninstall ${APP_NAME}.lnk"
    RMDir "${STARTMENU_DIR}"
  ${EndIf}

  ${If} $CreateDesktopShortcut == "1"
    CreateShortCut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\OfficeClaw.exe" "" "$INSTDIR\assets\app.ico"
  ${Else}
    Delete "$DESKTOP\${APP_NAME}.lnk"
  ${EndIf}
FunctionEnd

Function WriteAutoStartRegistry
  ${If} $EnableAutoStart == "1"
    WriteRegStr HKCU "${AUTOSTART_KEY}" "${AUTOSTART_VALUE}" '"$INSTDIR\OfficeClaw.exe"'
  ${Else}
    DeleteRegValue HKCU "${AUTOSTART_KEY}" "${AUTOSTART_VALUE}"
  ${EndIf}
FunctionEnd

Function WriteUninstallRegistry
  WriteRegStr HKCU "${INSTALL_KEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "huawei cloud"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\assets\app.ico"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
FunctionEnd

Section "Install"
  DetailPrint "正在准备安装环境..."
  StrCpy $INSTDIR $SelectedInstallDir

  ; If processes were detected in .onInit, close them now
  ${If} $DetectedRunningProcesses == "1"
    DetailPrint "正在关闭正在运行的 OfficeClaw 进程..."
    Call CloseRunningServices
  ${EndIf}

  CreateDirectory "$INSTDIR"
  Call CleanupManagedPayload
  DetailPrint "安装环境就绪..."

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
  CreateDirectory "$INSTDIR\.office-claw"

  IfFileExists "$INSTDIR\.env" +2 0
    CopyFiles /SILENT "$INSTDIR\.env.example" "$INSTDIR\.env"
  IfFileExists "$INSTDIR\office-claw-config.json" +2 0
    CopyFiles /SILENT "$INSTDIR\installer-seed\office-claw-config.json" "$INSTDIR\office-claw-config.json"

  ; 检查并安装 WebView2 运行时
  DetailPrint "正在检查 WebView2 运行时..."
  ; 检查 HKLM (per-machine) 注册表
  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" 0 webview2_installed
  
  ; 检查 HKCU (per-user) 注册表
  ReadRegStr $1 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $1 "" webview2_not_installed webview2_installed

webview2_not_installed:
  DetailPrint "正在安装 WebView2 运行时..."
  ; 使用 /silent /install 参数静默安装
  nsExec::ExecToLog '"$INSTDIR\tools\webview2\MicrosoftEdgeWebview2Setup.exe" /silent /install'
  Pop $0
  ; 验证安装结果
  ReadRegStr $2 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $2 "" webview2_install_failed webview2_installed

webview2_install_failed:
  DetailPrint "警告: WebView2 安装失败，桌面启动器可能无法使用"
  Goto webview2_done

webview2_installed:
  StrCmp $0 "" webview2_check_hkcu webview2_found
webview2_check_hkcu:
  StrCmp $1 "" webview2_not_found webview2_found
webview2_not_found:
  DetailPrint "WebView2 未安装"
  Goto webview2_done
webview2_found:
  DetailPrint "WebView2 已安装 (版本: $0$1)"
webview2_done:

  ; Run post-install configuration only for fresh installs.
  ; On overwrite installs, preserve an existing runtime catalog so user-created agents survive.
  IfFileExists "$INSTDIR\.cat-cafe\cat-catalog.json" init_config_skip 0
  DetailPrint "正在初始化配置..."
  nsExec::ExecToLog '"$INSTDIR\tools\node\node.exe" "$INSTDIR\scripts\install-auth-config.mjs" modelarts-preset apply --project-dir "$INSTDIR"'
  Pop $0
  Goto init_config_done
init_config_skip:
  DetailPrint "检测到现有运行时 catalog，跳过初始化配置以保留用户自定义 agent..."
init_config_done:

  WriteUninstaller "$INSTDIR\uninstall.exe"
  Call WriteShellShortcuts
  Call WriteAutoStartRegistry
  Call WriteUninstallRegistry
SectionEnd

Var RemoveUserData

Section "Uninstall"
  Call un.CloseRunningServices

  Delete "${STARTMENU_DIR}\${APP_NAME}.lnk"
  Delete "${STARTMENU_DIR}\Uninstall ${APP_NAME}.lnk"
  RMDir "${STARTMENU_DIR}"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  DeleteRegValue HKCU "${AUTOSTART_KEY}" "${AUTOSTART_VALUE}"

  DeleteRegKey HKCU "${UNINSTALL_KEY}"
  DeleteRegKey HKCU "${INSTALL_KEY}"
  DeleteRegKey /ifempty HKCU "Software\${COMPANY_KEY}"

  ; Skip firewall rule cleanup: user-level installs do not create the rule.

  ; Ask user whether to remove user data
  MessageBox MB_YESNO|MB_ICONQUESTION "是否同时删除所有用户数据？$\r$\n$\r$\n将删除：$\r$\n  · 安装目录下的配置、数据库、日志（.office-claw、data、logs、.env）$\r$\n  · 全局配置目录（$PROFILE\.office-claw）$\r$\n$\r$\n选择「否」将保留以上数据，但可能影响下次安装的配置初始化。" IDYES +3
    StrCpy $RemoveUserData "0"
    Goto +2
    StrCpy $RemoveUserData "1"

  ; Remove entire install dir via cmd rd for speed
  Delete "$INSTDIR\uninstall.exe"
  ${If} $RemoveUserData == "1"
    ; Remove install dir (includes .office-claw, data, logs, SQLite files)
    nsExec::ExecToLog 'cmd /c rd /s /q "$INSTDIR"'
    Pop $0
    ; Remove global user profiles (~/.office-claw) — provider keys, model profiles, project roots
    nsExec::ExecToLog 'cmd /c rd /s /q "$PROFILE\.office-claw"'
    Pop $0
  ${Else}
    Call un.CleanupManagedPayload
    RMDir "$INSTDIR"
  ${EndIf}
SectionEnd
