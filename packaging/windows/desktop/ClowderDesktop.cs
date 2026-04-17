using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class Program
{[DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetProcessDPIAware();[DllImport("shcore.dll", SetLastError = true)]
    private static extern int SetProcessDpiAwareness(int awareness);

    private const string InstanceMutexName = @"Local\OfficeClaw.WebView2Desktop";
    private const string ActivationEventName = @"Local\OfficeClaw.WebView2Desktop.Activate";

    private static void EnableHighDpi()
    {
        try
        {
            // PROCESS_PER_MONITOR_DPI_AWARE = 2
            SetProcessDpiAwareness(2);
        }
        catch
        {
            // Fallback for Windows 7 / early Win8
            try { SetProcessDPIAware(); } catch { }
        }
    }

    [STAThread]
    private static void Main()
    {
        EnableHighDpi();

        EventWaitHandle activationEvent;
        try
        {
            activationEvent = EventWaitHandle.OpenExisting(ActivationEventName);
        }
        catch (WaitHandleCannotBeOpenedException)
        {
            activationEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ActivationEventName);
        }

        using (activationEvent)
        {
            bool createdNew;
            using (var mutex = new Mutex(true, InstanceMutexName, out createdNew))
            {
                if (!createdNew)
                {
                    activationEvent.Set();
                    return;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new LauncherForm(activationEvent));
            }
        }
    }
}

internal sealed class LauncherForm : Form
{
    // =========================================================
    // API Imports & Constants
    // =========================================================
    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    private static extern bool GetWindowPlacement(IntPtr hWnd, ref WINDOWPLACEMENT lpwndpl);[DllImport("user32.dll")]
    private static extern bool SetWindowPlacement(IntPtr hWnd, [In] ref WINDOWPLACEMENT lpwndpl);

    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern int SendMessage(IntPtr hWnd, int Msg, int wParam, int lParam);

    // DWM API 用于恢复系统边框阴影
    [DllImport("dwmapi.dll")]
    private static extern int DwmExtendFrameIntoClientArea(IntPtr hWnd, ref MARGINS pMarInset);

    // User32 API 用于获取显示器工作区（防最大化遮挡任务栏）
    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint dwFlags);

    [DllImport("user32.dll")]
    private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int nIndex);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    private const int SW_RESTORE = 9;
    private const int SW_SHOWMINIMIZED = 2;
    private const int WM_NCLBUTTONDOWN = 0xA1;
    private const int WM_NCCALCSIZE = 0x0083;
    private const int HTCAPTION = 0x2;
    private const int SWP_NOMOVE = 0x0002;
    private const int SWP_NOSIZE = 0x0001;
    private const int SWP_NOZORDER = 0x0004;
    private const int SWP_NOACTIVATE = 0x0010;
    private const int SWP_FRAMECHANGED = 0x0020;
    private const int SM_CXSIZEFRAME = 32;
    private const int SM_CYSIZEFRAME = 33;
    private const int SM_CXPADDEDBORDER = 92;
    private const int TopResizeHitInset = 2;
    private const uint MONITOR_DEFAULTTONEAREST = 2;

    private const string WindowMinimizeMessage = "window.minimize";
    private const string WindowToggleMaximizeMessage = "window.toggleMaximize";
    private const string WindowCloseMessage = "window.close";
    private const string WindowSyncStateMessage = "window.syncState";
    private const string WindowStartDragMessage = "window.startDrag";
    private const string WindowStateMessageType = "window.state";

    [StructLayout(LayoutKind.Sequential)]
    internal struct TRACKMOUSEEVENT
    {
        public int cbSize;
        public uint dwFlags;
        public IntPtr hwndTrack;
        public uint dwHoverTime;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WINDOWPLACEMENT
    {
        public int length;
        public int flags;
        public int showCmd;
        public POINT ptMinPosition;
        public POINT ptMaxPosition;
        public RECT rcNormalPosition;
    }[StructLayout(LayoutKind.Sequential)]
    private struct MARGINS
    {
        public int cxLeftWidth;
        public int cxRightWidth;
        public int cyTopHeight;
        public int cyBottomHeight;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MONITORINFO
    {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct NCCALCSIZE_PARAMS
    {
        public RECT rcNewWindow;
        public RECT rcOldWindow;
        public RECT rcClient;
        public IntPtr lppos;
    }

    private readonly object _logLock = new object();
    private readonly NotifyIcon _notifyIcon;
    private readonly EventWaitHandle _activationEvent;
    private readonly RegisteredWaitHandle _activationWaitHandle;
    private readonly string _projectRoot;
    private readonly string _logFilePath;
    private readonly string _runtimeStatePath;
    private Process _serviceHostProcess;
    private bool _serviceStartedByLauncher;
    private bool _mainWebViewShown;
    private bool _exitRequested;
    private bool _trayHintShown;
    private bool _isHiddenToTray;
    private bool _hasTrayRestorePlacement;
    private WINDOWPLACEMENT _trayRestorePlacement;
    private string _frontendUrl;
    private WebView2 _splashWebView;
    private WebView2 _webView;

    public LauncherForm(EventWaitHandle activationEvent)
    {
        _activationEvent = activationEvent;
        _activationWaitHandle = ThreadPool.RegisterWaitForSingleObject(
            _activationEvent,
            (_, __) => RestoreFromExternalActivation(),
            null,
            Timeout.Infinite,
            false
        );
        _projectRoot = ResolveProjectRoot();
        _logFilePath = Path.Combine(_projectRoot, "logs", "desktop-launcher.log");
        _runtimeStatePath = Path.Combine(_projectRoot, ".office-claw", "run", "windows", "runtime-state.json");
        Directory.CreateDirectory(Path.GetDirectoryName(_logFilePath) ?? _projectRoot);
        _frontendUrl = BuildFrontendUrl();

        // [功能 2] 保留任务栏预览窗口的标题和图标
        Text = "OfficeClaw";
        ShowIcon = true;
        // 保持 Sizable 边框类型以保留原生 Resize 与缩放动画
        FormBorderStyle = FormBorderStyle.Sizable;

        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(960, 640);
        ClientSize = new Size(1440, 960);
        WindowState = FormWindowState.Maximized;
        BackColor = Color.FromArgb(255, 248, 242);
        Icon = ResolveAppIcon();
        _notifyIcon = CreateNotifyIcon();
        _trayRestorePlacement = CreateEmptyWindowPlacement();
        Resize += (_, __) => PublishWindowState();

        Shown += async (_, __) => await InitializeAsync();
        FormClosing += OnFormClosing;
        FormClosed += (_, __) => DisposeNotifyIcon();
    }

    protected override CreateParams CreateParams
    {
        get
        {
            return base.CreateParams;
        }
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WM_NCCALCSIZE && m.WParam != IntPtr.Zero)
        {
            var nccsp = (NCCALCSIZE_PARAMS)Marshal.PtrToStructure(m.LParam, typeof(NCCALCSIZE_PARAMS));

            if (WindowState == FormWindowState.Maximized)
            {
                // [功能 4] 最大化时不覆盖任务栏：将客户端大小严格限制在显示器工作区
                IntPtr monitor = MonitorFromWindow(Handle, MONITOR_DEFAULTTONEAREST);
                if (monitor != IntPtr.Zero)
                {
                    var monitorInfo = new MONITORINFO();
                    monitorInfo.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
                    if (GetMonitorInfo(monitor, ref monitorInfo))
                    {
                        nccsp.rcNewWindow = monitorInfo.rcWork;
                        Marshal.StructureToPtr(nccsp, m.LParam, false);
                        m.Result = IntPtr.Zero;
                        return;
                    }
                }
            }
            else
            {
                // 保留系统 resize frame，只裁掉 caption 主体，顶部只留约 1px。
                var frameX = GetSystemMetrics(SM_CXSIZEFRAME) + GetSystemMetrics(SM_CXPADDEDBORDER);
                var frameY = GetSystemMetrics(SM_CYSIZEFRAME) + GetSystemMetrics(SM_CXPADDEDBORDER);
                nccsp.rcNewWindow.Left += frameX;
                nccsp.rcNewWindow.Right -= frameX;
                nccsp.rcNewWindow.Bottom -= frameY;
                nccsp.rcNewWindow.Top += TopResizeHitInset;
                Marshal.StructureToPtr(nccsp, m.LParam, false);
                m.Result = IntPtr.Zero;
                return;
            }
        }

        base.WndProc(ref m);
    }
    // =========================================================
    // 恢复窗口阴影
    // =========================================================
    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        try
        {
            // [功能 3] 保留系统默认边框阴影：向客户区内侵入 1 像素，DWM 将借此渲染原生阴影
            var margins = new MARGINS { cxLeftWidth = 1, cxRightWidth = 1, cyTopHeight = 1, cyBottomHeight = 1 };
            DwmExtendFrameIntoClientArea(Handle, ref margins);
        }
        catch (Exception ex)
        {
            AppendLog("Failed to extend frame for drop shadow: " + ex.Message);
        }
    }

    private async Task InitializeAsync()
    {
        try
        {
            // 初始化启动页 WebView2
            await InitializeSplashWebViewAsync().ConfigureAwait(true);

            AppendLog("Launcher boot started.");

            if (!await IsFrontendReadyAsync().ConfigureAwait(true))
            {
                AppendLog("Starting local services...");
                // 删除旧的 runtime state 文件，避免读取到上次运行的错误端口
                try
                {
                    if (File.Exists(_runtimeStatePath))
                    {
                        File.Delete(_runtimeStatePath);
                        AppendLog("Cleared stale runtime state.");
                    }
                }
                catch (Exception ex)
                {
                    AppendLog("Warning: Could not delete stale runtime state: " + ex.Message);
                }
                StartManagedServices();
                _serviceStartedByLauncher = true;
            }
            else
            {
                AppendLog("Frontend already running - reusing existing services.");
            }

            await WaitForFrontendAsync(TimeSpan.FromMinutes(2)).ConfigureAwait(true);

            await InitializeWebViewAsync().ConfigureAwait(true);
            AppendLog("Desktop window ready.");
        }
        catch (Exception ex)
        {
            AppendLog("Launcher failed: " + ex);
            MessageBox.Show(
                this,
                ex.Message + Environment.NewLine + Environment.NewLine + "See log: " + _logFilePath,
                "OfficeClaw",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
            RequestExit();
        }
    }

    private static string ResolveProjectRoot()
    {
        return AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
    }

    private string BuildFrontendUrl()
    {
        // 不在构造函数读取 runtime state，因为可能是上次运行遗留的旧数据
        // 正确的 URL 会在 WaitForFrontendAsync() 轮询时从新写入的 runtime state 刷新
        var port = ReadPortFromEnv("FRONTEND_PORT", 3003);
        return "http://127.0.0.1:" + port + "/";
    }

    private Icon ResolveAppIcon()
    {
        try
        {
            var icoPath = Path.Combine(_projectRoot, "assets", "app.ico");
            if (File.Exists(icoPath))
            {
                return new Icon(icoPath);
            }
            return Icon.ExtractAssociatedIcon(Application.ExecutablePath) ?? SystemIcons.Application;
        }
        catch
        {
            return SystemIcons.Application;
        }
    }

    private NotifyIcon CreateNotifyIcon()
    {
        var contextMenu = new ContextMenuStrip();
        contextMenu.ShowImageMargin = false;
        contextMenu.Items.Add("打开 OfficeClaw", null, (_, __) => RestoreFromExternalActivation());
        contextMenu.Items.Add("退出", null, (_, __) => RequestExit());

        var notifyIcon = new NotifyIcon
        {
            Text = "OfficeClaw",
            Visible = true,
            Icon = Icon ?? SystemIcons.Application,
            ContextMenuStrip = contextMenu,
        };
        notifyIcon.DoubleClick += (_, __) => RestoreFromExternalActivation();
        return notifyIcon;
    }

    private void DisposeNotifyIcon()
    {
        _activationWaitHandle.Unregister(null);
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
    }

    private void OnFormClosing(object sender, FormClosingEventArgs eventArgs)
    {
        if (!_exitRequested && eventArgs.CloseReason == CloseReason.UserClosing)
        {
            eventArgs.Cancel = true;
            ShowCloseConfirmationDialog();
            return;
        }

        _notifyIcon.Visible = false;

        // StopManagedServices is now called asynchronously in RequestExit()
        // to improve user experience (window closes immediately, services stop in background)
    }

    private void ShowCloseConfirmationDialog()
    {
        if (InvokeRequired)
        {
            BeginInvoke((Action)ShowCloseConfirmationDialog);
            return;
        }

        using (var dialog = new CloseConfirmationDialog())
        {
            var result = dialog.ShowDialog(this);
            if (result == DialogResult.OK)
            {
                if (dialog.ShouldMinimize)
                {
                    HideToTray();
                }
                else
                {
                    RequestExit();
                }
            }
        }
    }

    private void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs eventArgs)
    {
        string message;
        try
        {
            message = eventArgs.TryGetWebMessageAsString();
        }
        catch (Exception ex)
        {
            AppendLog("Failed reading WebView2 message: " + ex.Message);
            return;
        }

        HandleWindowMessage(message);
    }

    private void HandleWindowMessage(string message)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            return;
        }

        switch (message)
        {
            case WindowMinimizeMessage:
                WindowState = FormWindowState.Minimized;
                PublishWindowState();
                return;
            case WindowToggleMaximizeMessage:
                ToggleMaximize();
                return;
            case WindowCloseMessage:
                ShowCloseConfirmationDialog();
                return;
            case WindowSyncStateMessage:
                PublishWindowState();
                return;
            case WindowStartDragMessage:
                StartWindowDrag();
                return;
            default:
                AppendLog("Ignoring unknown WebView2 message: " + message);
                return;
        }
    }

    private void RefreshNativeFrame()
    {
        if (!IsHandleCreated)
        {
            return;
        }

        SetWindowPos(
            Handle,
            IntPtr.Zero,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED
        );
    }

    private void StartWindowDrag()
    {
        if (InvokeRequired)
        {
            BeginInvoke((Action)StartWindowDrag);
            return;
        }

        if (!IsHandleCreated)
        {
            return;
        }

        if (WindowState == FormWindowState.Maximized)
        {
            // 获取当前鼠标位置
            POINT cursorPos;
            if (!GetCursorPos(out cursorPos))
            {
                return;
            }

            // 获取最大化窗口的位置
            RECT maxWindowRect;
            if (!GetWindowRect(Handle, out maxWindowRect))
            {
                return;
            }

            // 获取窗口的 WINDOWPLACEMENT，其中包含还原后的尺寸
            var placement = CreateEmptyWindowPlacement();
            if (!GetWindowPlacement(Handle, ref placement))
            {
                return;
            }

            // 使用 rcNormalPosition 获取还原后的窗口尺寸（这是窗口记忆的尺寸，不会累积变化）
            int normalWidth = placement.rcNormalPosition.Right - placement.rcNormalPosition.Left;
            int normalHeight = placement.rcNormalPosition.Bottom - placement.rcNormalPosition.Top;

            // 计算鼠标在最大化窗口中的相对位置（从左上角开始）
            int relativeX = cursorPos.X - maxWindowRect.Left;
            int relativeY = cursorPos.Y - maxWindowRect.Top;

            // 计算最大化窗口的尺寸
            int maxWidth = maxWindowRect.Right - maxWindowRect.Left;
            int maxHeight = maxWindowRect.Bottom - maxWindowRect.Top;

            // 按比例缩放鼠标的相对位置到还原后的窗口
            // 这样可以保持鼠标在窗口中的相对位置不变
            double scaleX = (double)normalWidth / maxWidth;
            double scaleY = (double)normalHeight / maxHeight;

            int adjustedRelativeX = (int)(relativeX * scaleX);
            int adjustedRelativeY = (int)(relativeY * scaleY);

            // 计算新窗口位置，让鼠标保持在相同的相对位置
            int newX = cursorPos.X - adjustedRelativeX;
            int newY = cursorPos.Y - adjustedRelativeY;

            // 确保窗口不会移出屏幕
            IntPtr monitor = MonitorFromWindow(Handle, MONITOR_DEFAULTTONEAREST);
            if (monitor != IntPtr.Zero)
            {
                var monitorInfo = new MONITORINFO();
                monitorInfo.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
                if (GetMonitorInfo(monitor, ref monitorInfo))
                {
                    // 限制在工作区内
                    if (newX < monitorInfo.rcWork.Left)
                    {
                        newX = monitorInfo.rcWork.Left;
                    }
                    if (newY < monitorInfo.rcWork.Top)
                    {
                        newY = monitorInfo.rcWork.Top;
                    }
                    if (newX + normalWidth > monitorInfo.rcWork.Right)
                    {
                        newX = monitorInfo.rcWork.Right - normalWidth;
                    }
                    if (newY + normalHeight > monitorInfo.rcWork.Bottom)
                    {
                        newY = monitorInfo.rcWork.Bottom - normalHeight;
                    }
                }
            }

            // 还原窗口
            WindowState = FormWindowState.Normal;
            RefreshNativeFrame();

            // 设置窗口新位置（保持原有尺寸）
            SetWindowPos(Handle, IntPtr.Zero, newX, newY, normalWidth, normalHeight, SWP_NOZORDER | SWP_NOACTIVATE);
        }

        ReleaseCapture();
        SendMessage(Handle, WM_NCLBUTTONDOWN, HTCAPTION, 0);
    }

    private void ToggleMaximize()
    {
        if (WindowState == FormWindowState.Maximized)
        {
            WindowState = FormWindowState.Normal;
            RefreshNativeFrame();
        }
        else
        {
            WindowState = FormWindowState.Maximized;
        }

        PublishWindowState();
    }

    private void PublishWindowState()
    {
        if (InvokeRequired)
        {
            BeginInvoke((Action)PublishWindowState);
            return;
        }

        var isMaximized = WindowState == FormWindowState.Maximized ? "true" : "false";
        var isMinimized = WindowState == FormWindowState.Minimized ? "true" : "false";
        var canMaximize = MaximizeBox ? "true" : "false";
        var payload =
            "{\"type\":\"" + WindowStateMessageType + "\",\"payload\":{\"isMaximized\":" + isMaximized + ",\"isMinimized\":" + isMinimized + ",\"canMaximize\":" + canMaximize + "}}";

        try
        {
            if (_splashWebView != null && !_splashWebView.IsDisposed && _splashWebView.CoreWebView2 != null)
            {
                _splashWebView.CoreWebView2.PostWebMessageAsJson(payload);
            }

            if (_webView != null && !_webView.IsDisposed && _webView.CoreWebView2 != null)
            {
                _webView.CoreWebView2.PostWebMessageAsJson(payload);
            }
        }
        catch (Exception ex)
        {
            AppendLog("Failed posting WebView2 window state: " + ex.Message);
        }
    }

    private static WINDOWPLACEMENT CreateEmptyWindowPlacement()
    {
        return new WINDOWPLACEMENT
        {
            length = Marshal.SizeOf(typeof(WINDOWPLACEMENT))
        };
    }

    private void CaptureTrayRestorePlacement()
    {
        if (!IsHandleCreated)
        {
            return;
        }

        var placement = CreateEmptyWindowPlacement();
        if (!GetWindowPlacement(Handle, ref placement))
        {
            return;
        }

        if (placement.showCmd == SW_SHOWMINIMIZED)
        {
            placement.showCmd = SW_RESTORE;
        }

        _trayRestorePlacement = placement;
        _hasTrayRestorePlacement = true;
    }

    private void RestoreFromTrayPlacement()
    {
        if (!_hasTrayRestorePlacement)
        {
            ShowWindow(Handle, SW_RESTORE);
            return;
        }

        var placement = _trayRestorePlacement;
        if (placement.showCmd == SW_SHOWMINIMIZED)
        {
            placement.showCmd = SW_RESTORE;
        }

        SetWindowPlacement(Handle, ref placement);
    }

    private void HideToTray()
    {
        if (InvokeRequired)
        {
            BeginInvoke((Action)HideToTray);
            return;
        }

        CaptureTrayRestorePlacement();

        _isHiddenToTray = true;
        ShowInTaskbar = false;
        WindowState = FormWindowState.Minimized;
        Hide();
        _notifyIcon.Visible = true;
        PublishWindowState();
        if (!_trayHintShown)
        {
            _notifyIcon.ShowBalloonTip(
                2500,
                "OfficeClaw",
                "OfficeClaw 仍在后台运行，右键托盘图标可退出。",
                ToolTipIcon.Info
            );
            _trayHintShown = true;
        }
    }

    private void RestoreFromTray()
    {
        if (InvokeRequired)
        {
            BeginInvoke((Action)RestoreFromTray);
            return;
        }

        _isHiddenToTray = false;
        ShowInTaskbar = true;
        Show();
        RestoreFromTrayPlacement();
        SetForegroundWindow(Handle);
        Activate();
        PublishWindowState();
    }


    private void RestoreFromExternalActivation()
    {
        if (InvokeRequired)
        {
            BeginInvoke((Action)RestoreFromExternalActivation);
            return;
        }

        if (_isHiddenToTray)
        {
            RestoreFromTray();
            return;
        }

        if (WindowState == FormWindowState.Minimized)
        {
            ShowInTaskbar = true;
            ShowWindow(Handle, SW_RESTORE);
            SetForegroundWindow(Handle);
            PublishWindowState();
            return;
        }

        if (!Visible)
        {
            Show();
        }

        ShowInTaskbar = true;
        Activate();
        PublishWindowState();
    }

    private void RequestExit()
    {
        if (IsDisposed)
        {
            return;
        }

        if (InvokeRequired)
        {
            BeginInvoke((Action)RequestExit);
            return;
        }

        if (_exitRequested)
        {
            return;
        }

        _exitRequested = true;

        // Hide window immediately for better user experience
        // Services will be stopped asynchronously in background
        Hide();
        _notifyIcon.Visible = false;

        // Start stopping services asynchronously (fire-and-forget)
        // The PowerShell process will continue running even after this app exits
        StopManagedServicesAsync();

        // Close window immediately
        Close();
    }

    private int ReadPortFromEnv(string key, int fallback)
    {
        try
        {
            var envPath = Path.Combine(_projectRoot, ".env");
            if (!File.Exists(envPath))
            {
                return fallback;
            }

            foreach (var rawLine in File.ReadAllLines(envPath))
            {
                var line = rawLine.Trim();
                if (line.Length == 0 || line.StartsWith("#", StringComparison.Ordinal))
                {
                    continue;
                }

                var separatorIndex = line.IndexOf('=');
                if (separatorIndex <= 0)
                {
                    continue;
                }

                var candidateKey = line.Substring(0, separatorIndex).Trim();
                if (!string.Equals(candidateKey, key, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var value = line.Substring(separatorIndex + 1).Trim().Trim('"').Trim('\'');
                int port;
                if (int.TryParse(value, out port) && port > 0)
                {
                    return port;
                }
            }
        }
        catch (Exception ex)
        {
            AppendLog("Failed reading .env: " + ex.Message);
        }

        return fallback;
    }

    private bool TryRefreshFrontendUrlFromRuntimeState()
    {
        string runtimeUrl;
        if (TryReadRuntimeStateValue("FrontendUrl", out runtimeUrl) && !string.IsNullOrWhiteSpace(runtimeUrl))
        {
            _frontendUrl = runtimeUrl.Trim();
            return true;
        }

        string runtimePort;
        if (TryReadRuntimeStateValue("WebPort", out runtimePort))
        {
            int port;
            if (int.TryParse(runtimePort, out port) && port > 0)
            {
                _frontendUrl = "http://127.0.0.1:" + port + "/";
                return true;
            }
        }

        return false;
    }

    private bool TryReadRuntimeStateValue(string key, out string value)
    {
        value = null;
        try
        {
            if (!File.Exists(_runtimeStatePath))
            {
                return false;
            }

            var content = File.ReadAllText(_runtimeStatePath);
            var pattern =
                "\"" + Regex.Escape(key) + "\"\\s*:\\s*(?:\"(?<text>(?:\\\\.|[^\"])*)\"|(?<number>\\d+)|null)";
            var match = Regex.Match(content, pattern);
            if (!match.Success)
            {
                return false;
            }

            if (match.Groups["text"].Success)
            {
                value = Regex.Unescape(match.Groups["text"].Value);
                return true;
            }

            if (match.Groups["number"].Success)
            {
                value = match.Groups["number"].Value;
                return true;
            }
        }
        catch (Exception ex)
        {
            AppendLog("Failed reading runtime state: " + ex.Message);
        }

        return false;
    }

    private void StartManagedServices()
    {
        var startScript = Path.Combine(_projectRoot, "scripts", "start-windows.ps1");
        if (!File.Exists(startScript))
        {
            throw new FileNotFoundException("Missing startup script: " + startScript);
        }

        var info = new ProcessStartInfo
        {
            FileName = "powershell.exe",
            Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + startScript + "\" -Quick",
            WorkingDirectory = _projectRoot,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };

        _serviceHostProcess = new Process
        {
            StartInfo = info,
            EnableRaisingEvents = true,
        };

        _serviceHostProcess.OutputDataReceived += (_, eventArgs) =>
        {
            if (!string.IsNullOrEmpty(eventArgs.Data))
            {
                AppendLog("[start] " + eventArgs.Data);
            }
        };

        _serviceHostProcess.ErrorDataReceived += (_, eventArgs) =>
        {
            if (!string.IsNullOrEmpty(eventArgs.Data))
            {
                AppendLog("[start:err] " + eventArgs.Data);
            }
        };

        _serviceHostProcess.Exited += (_, __) =>
        {
            AppendLog("Service host exited with code " + _serviceHostProcess.ExitCode + ".");
        };

        if (!_serviceHostProcess.Start())
        {
            throw new InvalidOperationException("Failed to start local services.");
        }

        _serviceHostProcess.BeginOutputReadLine();
        _serviceHostProcess.BeginErrorReadLine();
        AppendLog("Started service host via start-windows.ps1.");
    }

    private async Task WaitForFrontendAsync(TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (DateTime.UtcNow < deadline)
        {
            TryRefreshFrontendUrlFromRuntimeState();
            if (await IsFrontendReadyAsync().ConfigureAwait(true))
            {
                return;
            }

            if (_serviceStartedByLauncher && _serviceHostProcess != null && _serviceHostProcess.HasExited)
            {
                throw new InvalidOperationException(
                    "Local services exited before the UI became ready. Check " + _logFilePath + " for details."
                );
            }

            await Task.Delay(1000).ConfigureAwait(true);
        }

        throw new TimeoutException("Timed out waiting for the frontend at " + _frontendUrl);
    }

    private Task<bool> IsFrontendReadyAsync()
    {
        return Task.Run(() =>
        {
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(_frontendUrl);
                request.Method = "GET";
                request.Timeout = 1500;
                request.ReadWriteTimeout = 1500;
                request.AllowAutoRedirect = true;
                using (var response = (HttpWebResponse)request.GetResponse())
                {
                    return (int)response.StatusCode < 500;
                }
            }
            catch
            {
                return false;
            }
        });
    }

    private async Task InitializeSplashWebViewAsync()
    {
        var userDataFolder = Path.Combine(_projectRoot, ".office-claw", "webview2");
        Directory.CreateDirectory(userDataFolder);

        _splashWebView = new WebView2
        {
            Dock = DockStyle.Fill,
            CreationProperties = new CoreWebView2CreationProperties
            {
                UserDataFolder = userDataFolder,
            },
        };

        Controls.Add(_splashWebView);

        await _splashWebView.EnsureCoreWebView2Async().ConfigureAwait(true);

        var settings = _splashWebView.CoreWebView2.Settings;
        settings.IsStatusBarEnabled = false;
        settings.AreDevToolsEnabled = true;
        settings.AreDefaultContextMenusEnabled = false;
        settings.IsZoomControlEnabled = false;
        settings.AreBrowserAcceleratorKeysEnabled = false;
        settings.IsPinchZoomEnabled = false;
        settings.IsPasswordAutosaveEnabled = false;
        settings.IsGeneralAutofillEnabled = false;
        settings.IsSwipeNavigationEnabled = false;

        _splashWebView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;

        var splashHtmlPath = Path.Combine(_projectRoot, "assets", "splash.html");
        if (File.Exists(splashHtmlPath))
        {
            _splashWebView.Source = new Uri("file:///" + splashHtmlPath.Replace("\\", "/"));
        }
        else
        {
            AppendLog("Warning: splash.html not found at " + splashHtmlPath);
        }

        PublishWindowState();
    }

    private async Task InitializeWebViewAsync()
    {
        var userDataFolder = Path.Combine(_projectRoot, ".office-claw", "webview2");
        Directory.CreateDirectory(userDataFolder);

        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            CreationProperties = new CoreWebView2CreationProperties
            {
                UserDataFolder = userDataFolder,
            },
        };

        Controls.Add(_webView);
        if (_splashWebView != null && !_splashWebView.IsDisposed)
        {
            _webView.SendToBack();
        }

        await _webView.EnsureCoreWebView2Async().ConfigureAwait(true);

        await _webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
            "(function(){" +
            "var LOGIN_STYLE_ID='clawder-login-hide';" +
            "var EXTERNAL_STYLE_ID='clawder-external-window-controls-style';" +
            "var EXTERNAL_ROOT_ID='clawder-external-window-controls';" +
            "var HEADER_BAR_ID='clawder-huawei-header-bar';" +
            "var MSG_MIN='window.minimize';" +
            "var MSG_MAX='window.toggleMaximize';" +
            "var MSG_CLOSE='window.close';" +
            "var MSG_SYNC='window.syncState';" +
            "var MSG_DRAG='window.startDrag';" +
            "function getBridge(){return window.chrome&&window.chrome.webview?window.chrome.webview:null;}" +
            "function post(msg){try{var b=getBridge();if(b&&b.postMessage)b.postMessage(msg);}catch(_){}}" +
            "function isLocalHost(){" +
            "try{" +
            "var host=(window.location&&window.location.hostname?window.location.hostname:'').toLowerCase();" +
            "if(!host)return false;" +
            "return host==='127.0.0.1'||host==='localhost'||host==='::1'||host==='[::1]';" +
            "}catch(_){return true;}" +
            "}" +
            "function isHuaweicloud(){" +
            "try{" +
            "var host=(window.location&&window.location.hostname?window.location.hostname:'').toLowerCase();" +
            "if(!host)return false;" +
            "return /\\.huaweicloud\\.com$/i.test(host);" +
            "}catch(_){return false;}" +
            "}" +
            "function ensureLoginCss(){" +
            "if(document.getElementById(LOGIN_STYLE_ID))return;" +
            "var style=document.createElement('style');" +
            "style.id=LOGIN_STYLE_ID;" +
            "var target=document.head||document.documentElement;" +
            "if(target)target.appendChild(style);" +
            "}" +
            "function ensureExternalControlsCss(){" +
            "if(document.getElementById(EXTERNAL_STYLE_ID))return;" +
            "var style=document.createElement('style');" +
            "style.id=EXTERNAL_STYLE_ID;" +
            "style.textContent='"
            + "#'+HEADER_BAR_ID+'{position:fixed;top:0;left:0;right:0;height:36px;z-index:2147483647;"
            + "background:transparent;display:flex;align-items:center;justify-content:flex-end;"
            + "font-family:Segoe UI,Arial,sans-serif;-webkit-app-region:drag;app-region:drag;"
            + "user-select:none;-webkit-user-select:none;}"
            + "#'+HEADER_BAR_ID+' .clawder-header-controls{-webkit-app-region:no-drag;app-region:no-drag;"
            + "display:flex;align-items:center;padding-right:12px;}"
            + "#'+HEADER_BAR_ID+' button{appearance:none;-webkit-appearance:none;width:36px;height:36px;border:none;"
            + "background:transparent;color:#434343;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;"
            + "transition:background-color .15s ease,color .15s ease;-webkit-app-region:no-drag;app-region:no-drag;}"
            + "#'+HEADER_BAR_ID+' button:hover{background:rgba(0,0,0,.08);color:#1f1f1f}"
            + "#'+HEADER_BAR_ID+' button[data-role=close]:hover{background:#e5484d;color:#fff}"
            + "#'+HEADER_BAR_ID+' button:focus-visible{outline:2px solid #2563eb;outline-offset:-2px}"
            + "#'+HEADER_BAR_ID+' svg{width:20px;height:20px;pointer-events:none}"
            + "#'+HEADER_BAR_ID+' .clawder-restore{display:none}"
            + "#'+HEADER_BAR_ID+'[data-maximized=true] .clawder-max{display:none}"
            + "#'+HEADER_BAR_ID+'[data-maximized=true] .clawder-restore{display:block}"
            + "#clawder-external-window-controls{position:fixed;top:0;right:0;z-index:2147483647;display:flex;align-items:center;"
            + "background:rgba(255,255,255,.85);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);"
            + "border:1px solid rgba(0,0,0,.08);border-top:none;border-right:none;border-bottom-left-radius:10px;"
            + "overflow:hidden;font-family:Segoe UI,Arial,sans-serif}"
            + "#clawder-external-window-controls button{appearance:none;-webkit-appearance:none;width:38px;height:30px;border:none;"
            + "background:transparent;color:#434343;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;"
            + "transition:background-color .15s ease,color .15s ease}"
            + "#clawder-external-window-controls button:hover{background:rgba(0,0,0,.08);color:#1f1f1f}"
            + "#clawder-external-window-controls button[data-role=close]:hover{background:#e5484d;color:#fff}"
            + "#clawder-external-window-controls button:focus-visible{outline:2px solid #2563eb;outline-offset:-2px}"
            + "#clawder-external-window-controls svg{width:20px;height:20px;pointer-events:none}"
            + "#clawder-external-window-controls .clawder-restore{display:none}"
            + "#clawder-external-window-controls[data-maximized=true] .clawder-max{display:none}"
            + "#clawder-external-window-controls[data-maximized=true] .clawder-restore{display:block}"
            + "';" +
            "var target=document.head||document.documentElement;" +
            "if(target)target.appendChild(style);" +
            "}" +
            "function setMaximizedState(isMax){" +
            "var header=document.getElementById(HEADER_BAR_ID);" +
            "if(header){header.setAttribute('data-maximized',isMax?'true':'false');"
            + "var maxBtn=header.querySelector('button[data-role=maximize]');"
            + "if(maxBtn){maxBtn.title=isMax?'还原':'最大化';maxBtn.setAttribute('aria-label',isMax?'还原':'最大化');}}" +
            "var root=document.getElementById(EXTERNAL_ROOT_ID);" +
            "if(!root)return;" +
            "root.setAttribute('data-maximized',isMax?'true':'false');" +
            "var maxBtn=root.querySelector('button[data-role=maximize]');" +
            "if(maxBtn){maxBtn.title=isMax?'还原':'最大化';maxBtn.setAttribute('aria-label',isMax?'还原':'最大化');}" +
            "}" +
            "function createHeaderBar(){" +
            "var bridge=getBridge();" +
            "if(!bridge)return;" +
            "if(!isHuaweicloud())return;" +
            "ensureExternalControlsCss();" +
            "if(document.getElementById(HEADER_BAR_ID))return;" +
            "var header=document.createElement('div');" +
            "header.id=HEADER_BAR_ID;" +
            "header.setAttribute('data-maximized','false');" +
            "header.innerHTML='" +
            "<div class=\"clawder-header-controls\">"
            + "<button type=\"button\" data-role=\"minimize\" title=\"最小化\" aria-label=\"最小化\">"
            + "<svg viewBox=\"0 0 16 16\" fill=\"none\"><path d=\"M4 8H12\" stroke=\"currentColor\" stroke-width=\"1.2\" stroke-linecap=\"round\"/></svg>"
            + "</button>"
            + "<button type=\"button\" data-role=\"maximize\" title=\"最大化\" aria-label=\"最大化\">"
            + "<svg class=\"clawder-max\" viewBox=\"0 0 16 16\" fill=\"none\"><rect x=\"4.25\" y=\"4.25\" width=\"7.5\" height=\"7.5\" rx=\"0.9\" stroke=\"currentColor\" stroke-width=\"1.2\"/></svg>"
            + "<svg class=\"clawder-restore\" viewBox=\"0 0 16 16\" fill=\"none\"><path d=\"M5.75 4.25H10.1C10.984 4.25 11.7 4.966 11.7 5.85V10.2\" stroke=\"currentColor\" stroke-width=\"1.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M10.25 5.75H5.9C5.016 5.75 4.3 6.466 4.3 7.35V11.1C4.3 11.984 5.016 12.7 5.9 12.7H10.25C11.134 12.7 11.85 11.984 11.85 11.1V7.35C11.85 6.466 11.134 5.75 10.25 5.75Z\" stroke=\"currentColor\" stroke-width=\"1.2\" stroke-linejoin=\"round\"/></svg>"
            + "</button>"
            + "<button type=\"button\" data-role=\"close\" title=\"关闭\" aria-label=\"关闭\">"
            + "<svg viewBox=\"0 0 16 16\" fill=\"none\"><path d=\"M5 5L11 11\" stroke=\"currentColor\" stroke-width=\"1.2\" stroke-linecap=\"round\"/><path d=\"M11 5L5 11\" stroke=\"currentColor\" stroke-width=\"1.2\" stroke-linecap=\"round\"/></svg>"
            + "</button>"
            + "</div>';" +
            "var parent=document.body||document.documentElement;" +
            "if(parent)parent.appendChild(header);" +
            "var minBtn=header.querySelector('button[data-role=minimize]');" +
            "var maxBtn=header.querySelector('button[data-role=maximize]');" +
            "var closeBtn=header.querySelector('button[data-role=close]');" +
            "if(minBtn)minBtn.addEventListener('click',function(e){e.stopPropagation();post(MSG_MIN);});" +
            "if(maxBtn)maxBtn.addEventListener('click',function(e){e.stopPropagation();post(MSG_MAX);});" +
            "if(closeBtn)closeBtn.addEventListener('click',function(e){e.stopPropagation();post(MSG_CLOSE);});" +
            "header.addEventListener('mousedown',function(e){if(e.target.closest('button'))return;post(MSG_DRAG);});" +
            "post(MSG_SYNC);" +
            "}" +
            "function ensureExternalControls(){" +
            "var bridge=getBridge();" +
            "if(!bridge){return;}" +
            "if(!isHuaweicloud()){" +
            "var oldRoot=document.getElementById(EXTERNAL_ROOT_ID);" +
            "if(oldRoot&&oldRoot.parentNode)oldRoot.parentNode.removeChild(oldRoot);" +
            "var oldHeader=document.getElementById(HEADER_BAR_ID);" +
            "if(oldHeader&&oldHeader.parentNode)oldHeader.parentNode.removeChild(oldHeader);" +
            "return;" +
            "}" +
            "}" +
            "function bindStateListener(){" +
            "var bridge=getBridge();" +
            "if(!bridge||!bridge.addEventListener||window.__clawderExternalWindowControlsBound)return;" +
            "window.__clawderExternalWindowControlsBound=true;" +
            "bridge.addEventListener('message',function(event){" +
            "var data=event?event.data:null;" +
            "if(!data||typeof data!=='object')return;" +
            "if(data.type!=='window.state')return;" +
            "var payload=data.payload||{};" +
            "setMaximizedState(!!payload.isMaximized);" +
            "});" +
            "}" +
            "function boot(){" +
            "ensureLoginCss();" +
            "bindStateListener();" +
            "createHeaderBar();" +
            "ensureExternalControls();" +
            "}" +
            "if(document.readyState==='loading'){" +
            "document.addEventListener('DOMContentLoaded',boot,{once:true});" +
            "}else{" +
            "boot();" +
            "}" +
            "})();"
        ).ConfigureAwait(true);

        var settings = _webView.CoreWebView2.Settings;
        settings.IsStatusBarEnabled = false;
        settings.AreDevToolsEnabled = true;
        // 屏蔽右键菜单，但保留键盘快捷键（Ctrl+C 复制、Ctrl+V 粘贴、Ctrl+A 全选等）
        settings.AreDefaultContextMenusEnabled = false;
        settings.IsZoomControlEnabled = false;
        settings.AreBrowserAcceleratorKeysEnabled = false;
        settings.IsPinchZoomEnabled = false;
        settings.IsPasswordAutosaveEnabled = false;
        settings.IsGeneralAutofillEnabled = false;
        settings.IsSwipeNavigationEnabled = false;

        _webView.CoreWebView2.NewWindowRequested += OnNewWindowRequested;
        _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
        _webView.CoreWebView2.ProcessFailed += (_, eventArgs) =>
        {
            AppendLog("WebView2 process failed: " + eventArgs.ProcessFailedKind);
        };
        _webView.CoreWebView2.NavigationCompleted += async (_, eventArgs) =>
        {
            PublishWindowState();
            if (!_mainWebViewShown && eventArgs.IsSuccess)
            {
                RevealMainWebView();
            }

            if (!_mainWebViewShown && !eventArgs.IsSuccess)
            {
                AppendLog("Main WebView navigation failed before splash handoff: " + eventArgs.WebErrorStatus);
            }

            if (eventArgs.IsSuccess)
            {
                await InjectLoginCssAsync().ConfigureAwait(true);
            }
        };
        _webView.Source = new Uri(_frontendUrl);
    }

    private void RevealMainWebView()
    {
        if (InvokeRequired)
        {
            BeginInvoke((Action)RevealMainWebView);
            return;
        }

        if (_mainWebViewShown)
        {
            return;
        }

        _mainWebViewShown = true;
        _webView.BringToFront();

        if (_splashWebView != null && !_splashWebView.IsDisposed)
        {
            Controls.Remove(_splashWebView);
            _splashWebView.Dispose();
            _splashWebView = null;
        }
    }

    private async Task InjectLoginCssAsync()
    {
        if (_webView == null || _webView.IsDisposed || _webView.CoreWebView2 == null)
        {
            return;
        }

        try
        {
            var huaweiScript =
                "(function(){" +
                "var urls={" +
                "'注册':'https://id5.cloud.huawei.com/UnifiedIDMPortal/portal/userRegister/regbyemail.html?themeName=red&access_type=offline&clientID=103493351&loginChannel=88000000&loginUrl=https%3A%2F%2Fauth.huaweicloud.com%2Fauthui%2Flogin.html%23&casLoginUrl=https%3A%2F%2Fauth.huaweicloud.com%2Fauthui%2FcasLogin&service=https%3A%2F%2Fauth.huaweicloud.com%2Fauthui%2FcasLogin&countryCode=th&scope=https%3A%2F%2Fwww.huawei.com%2Fauth%2Faccount%2Funified.profile+https%3A%2F%2Fwww.huawei.com%2Fauth%2Faccount%2Frisk.idstate&reqClientType=88&state=8d71793cbfd845e38ed4b62fc6801a8a&lang=zh-cn'," +
                "'忘记密码':'https://id5.cloud.huawei.com/UnifiedIDMPortal/portal/resetPwd/forgetbyid.html?reqClientType=88&loginChannel=88000000&regionCode=th&loginUrl=https%3A%2F%2Fauth.huaweicloud.com%2Fauthui%2Flogin.html%23%2FhwIDLogin&lang=zh-cn&themeName=lightred&clientID=103493351&service=https%3A%2F%2Fauth.huaweicloud.com%2Fauthui%2FcasLogin%3Fservice%3Dhttps%253A%252F%252Fversatile.cn-north-4.myhuaweicloud.com%252Fv1%252Fclaw%252Fcas%252Flogin%252Fcallback&refererPage=unified_login&srcScenID=6000014&state=3873d9b02024477f910a0c9585fa53ad#/forgetPwd/forgetbyid'," +
                "'忘记账号名':'https://reg.huaweicloud.com/registerui/cn/index.html#/account/forgotName'" +
                "};" +
                "function isHuaweicloud(){try{var h=location.hostname;return h&&/\\.huaweicloud\\.com$/i.test(h)}catch(e){return false}}" +
                "function replaceSpans(){if(!isHuaweicloud())return;Object.keys(urls).forEach(function(text){var result=document.evaluate('//span[contains(@class,\"hwid-vertical-align\") and normalize-space(text())=\"'+text+'\"]',document,null,XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,null);for(var i=0;i<result.snapshotLength;i++){var s=result.snapshotItem(i);if(s.tagName==='A')continue;var linkUrl=urls[text];var parent=s.parentNode;var hwidLinkAncestor=null;while(parent&&parent!==document){if(parent.classList&&parent.classList.contains('hwid-link')){hwidLinkAncestor=parent;break}parent=parent.parentNode}if(hwidLinkAncestor){var p=s.parentNode;while(p&&p!==hwidLinkAncestor.parentNode){(function(el,url){el.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();window.open(url,'_blank','noopener,noreferrer')},true)})(p,linkUrl);p=p.parentNode}}var a=document.createElement('a');a.href=linkUrl;a.className=s.className;a.textContent=s.textContent;a.style.cssText='font-size:14px;color:#000;';a.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();window.open(this.href,'_blank','noopener,noreferrer')});a.addEventListener('mouseenter',function(){this.style.color='#526ecc'});a.addEventListener('mouseleave',function(){this.style.color='#000'});s.parentNode.replaceChild(a,s)}})}" +
                "replaceSpans();" +
                "function fixPrivacyLinks(){if(!isHuaweicloud())return;var container=document.querySelector('.privacyMsg');if(!container)return;var links=container.querySelectorAll('a');for(var i=0;i<links.length;i++){var a=links[i];a.addEventListener('click',function(e){e.preventDefault();window.open(this.href,'_blank','noopener,noreferrer')})}}" +
                "fixPrivacyLinks();" +
                "function hideElements(){if(!isHuaweicloud())return;var idp=document.getElementById('idpLinkDiv');if(idp)idp.style.display='none';var eChannel=document.getElementById('eChannelLinkDiv');if(eChannel)eChannel.style.display='none';var vmall=document.getElementById('vmallLinkDiv');if(vmall)vmall.style.display='none';var idpLogin=document.getElementById('idpLoginLinkDiv');if(idpLogin)idpLogin.style.display='none';var intervals=document.querySelectorAll('#hwAccountLinkDiv ~ .intervalDiv');for(var i=0;i<intervals.length;i++){intervals[i].style.display='none'}}" +
                "hideElements();" +
                "function fixForgetPwdLink(){if(!isHuaweicloud())return;var container=document.querySelector('.forgetPwdLink');if(!container)return;var forgetPwdUrl='https://auth.huaweicloud.com/authui/login.html?locale=zh-cn&UserType=e&service=https%3A%2F%2Fversatile.cn-north-4.myhuaweicloud.com%2Fv1%2Fclaw%2Fcas%2Flogin%2Fcallback#/fpwd';var links=container.querySelectorAll('a');for(var i=0;i<links.length;i++){var a=links[i];if(a.textContent.trim()==='忘记密码'){a.className='loginBottomColor';a.removeAttribute('ng-click');a.href=forgetPwdUrl;a.addEventListener('click',function(e){e.preventDefault();e.stopImmediatePropagation();window.open(this.href,'_blank','noopener,noreferrer')},true);break}}var spans=container.querySelectorAll('span');for(var i=0;i<spans.length;i++){var s=spans[i];if(s.textContent.trim()==='忘记密码'){var a=document.createElement('a');a.href=forgetPwdUrl;a.textContent='忘记密码';a.style.cssText='font-size:14px;color:rgba(0,0,0,.5);';a.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();window.open(this.href,'_blank','noopener,noreferrer')});a.addEventListener('mouseenter',function(){this.style.color='#526ecc';this.style.textDecoration='none'});a.addEventListener('mouseleave',function(){this.style.color='rgba(0,0,0,.5)'});s.parentNode.replaceChild(a,s);break}}}" +
                "fixForgetPwdLink();" +
                "function styleLoginAdv(){if(!isHuaweicloud())return;var container=document.getElementById('loginAdv');if(!container)return;var img=document.getElementById('loginAdImgDefault');if(img)img.style.marginRight='20px';var links=container.querySelectorAll('a');for(var i=0;i<links.length;i++){var a=links[i];a.removeAttribute('href');a.removeAttribute('target')}}" +
                "styleLoginAdv();" +
                "if(document.readyState!=='complete'){document.addEventListener('DOMContentLoaded',function(){replaceSpans();fixPrivacyLinks();hideElements();fixForgetPwdLink();styleLoginAdv()})}" +
                "new MutationObserver(function(){replaceSpans();fixPrivacyLinks();hideElements();fixForgetPwdLink();styleLoginAdv()}).observe(document.documentElement,{childList:true,subtree:true});" +
                "})();";
            await _webView.CoreWebView2.ExecuteScriptAsync(huaweiScript).ConfigureAwait(true);
        }
        catch (Exception ex)
        {
            AppendLog("Failed to inject Huawei register link script: " + ex.Message);
        }
    }

    private void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs eventArgs)
    {
        eventArgs.Handled = true;
        try
        {
            Process.Start(new ProcessStartInfo(eventArgs.Uri) { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            AppendLog("Failed to open external link: " + ex.Message);
        }
    }

    private void StopManagedServices()
    {
        try
        {
            var stopScript = Path.Combine(_projectRoot, "scripts", "stop-windows.ps1");
            if (File.Exists(stopScript))
            {
                var stopInfo = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + stopScript + "\"",
                    WorkingDirectory = _projectRoot,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };

                using (var stopProcess = Process.Start(stopInfo))
                {
                    if (stopProcess != null && !stopProcess.WaitForExit(15000))
                    {
                        stopProcess.Kill();
                    }
                }
            }
        }
        catch (Exception ex)
        {
            AppendLog("Failed stopping services cleanly: " + ex.Message);
        }
        finally
        {
            try
            {
                if (_serviceHostProcess != null && !_serviceHostProcess.HasExited)
                {
                    _serviceHostProcess.Kill();
                    _serviceHostProcess.WaitForExit(5000);
                }
            }
            catch (Exception ex)
            {
                AppendLog("Failed terminating service host: " + ex.Message);
            }
        }
    }

    /// <summary>
    /// Stops managed services asynchronously without blocking the UI.
    /// The PowerShell process will continue running even after this application exits.
    /// </summary>
    private void StopManagedServicesAsync()
    {
        try
        {
            var stopScript = Path.Combine(_projectRoot, "scripts", "stop-windows.ps1");
            if (File.Exists(stopScript))
            {
                AppendLog("Starting stop-windows.ps1 in background...");

                // Start PowerShell process without waiting
                // It will continue running even after this app exits
                var stopInfo = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + stopScript + "\"",
                    WorkingDirectory = _projectRoot,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                };

                Process.Start(stopInfo);
            }

            // Kill serviceHostProcess immediately if it's still running
            // This is a fallback in case stop-windows.ps1 takes too long
            if (_serviceHostProcess != null && !_serviceHostProcess.HasExited)
            {
                AppendLog("Terminating service host process...");
                _serviceHostProcess.Kill();
            }
        }
        catch (Exception ex)
        {
            AppendLog("Failed starting stop script: " + ex.Message);
        }
    }

    private void AppendLog(string message)
    {
        lock (_logLock)
        {
            File.AppendAllText(
                _logFilePath,
                DateTime.Now.ToString("u") + " " + message + Environment.NewLine,
                Encoding.UTF8
            );
        }
    }
}

internal sealed class CloseConfirmationDialog : Form
{
    private readonly RadioButton _minimizeRadio;
    private readonly RadioButton _exitRadio;

    public bool ShouldMinimize
    {
        get { return _minimizeRadio.Checked; }
    }

    public CloseConfirmationDialog()
    {
        Text = "OfficeClaw";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterParent;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        AutoScaleMode = AutoScaleMode.Font;

        var outerTable = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 3,
        };
        outerTable.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        outerTable.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        outerTable.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        outerTable.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));

        var contentPanel = new Panel
        {
            AutoSize = true,
            MinimumSize = new Size(280, 0),
        };

        var innerFlow = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            AutoSize = true,
            Parent = contentPanel,
        };

        var promptLabel = new Label
        {
            Text = "关闭窗口时，您希望如何处理？",
            AutoSize = true,
            Margin = new Padding(0, 0, 0, 12),
        };
        innerFlow.Controls.Add(promptLabel);

        _minimizeRadio = new RadioButton
        {
            Text = "最小化到托盘（继续运行）",
            AutoSize = true,
            Checked = true,
            Margin = new Padding(0, 0, 0, 6),
        };
        innerFlow.Controls.Add(_minimizeRadio);

        _exitRadio = new RadioButton
        {
            Text = "直接退出（关闭应用）",
            AutoSize = true,
            Margin = new Padding(0, 0, 0, 16),
        };
        innerFlow.Controls.Add(_exitRadio);

        var okButton = new Button
        {
            Text = "确定",
            DialogResult = DialogResult.OK,
            AutoSize = true,
            MinimumSize = new Size(75, 25),
            Margin = new Padding(0, 0, 8, 0),
        };

        var cancelButton = new Button
        {
            Text = "取消",
            DialogResult = DialogResult.Cancel,
            AutoSize = true,
            MinimumSize = new Size(75, 25),
            Margin = new Padding(0),
        };

        var buttonPanel = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.LeftToRight,
            AutoSize = true,
            Margin = new Padding(0),
        };
        buttonPanel.Controls.Add(okButton);
        buttonPanel.Controls.Add(cancelButton);

        innerFlow.Controls.Add(buttonPanel);

        outerTable.Controls.Add(contentPanel, 0, 1);

        Controls.Add(outerTable);

        AcceptButton = okButton;
        CancelButton = cancelButton;

        Load += (_, __) =>
        {
            contentPanel.Width = Math.Max(280, innerFlow.PreferredSize.Width + 30);
            innerFlow.Left = (contentPanel.Width - innerFlow.PreferredSize.Width) / 2;
            innerFlow.Top = 0;

            var dialogWidth = contentPanel.Width + 40;
            var dialogHeight = innerFlow.PreferredSize.Height + 60;
            ClientSize = new Size(dialogWidth, dialogHeight);
        };
    }
}
