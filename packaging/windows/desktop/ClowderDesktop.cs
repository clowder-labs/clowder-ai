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
            TryRefreshFrontendUrlFromRuntimeState();

            if (!await IsFrontendReadyAsync().ConfigureAwait(true))
            {
                AppendLog("Starting local services...");
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
        if (TryRefreshFrontendUrlFromRuntimeState())
        {
            return _frontendUrl;
        }

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
        StopManagedServices();
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
            WindowState = FormWindowState.Normal;
            RefreshNativeFrame();
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
        ShowInTaskbar = true;
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
        settings.AreDevToolsEnabled = false;
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

        Controls.Clear();
        if (_splashWebView != null && !_splashWebView.IsDisposed)
        {
            _splashWebView.Dispose();
            _splashWebView = null;
        }
        Controls.Add(_webView);

        await _webView.EnsureCoreWebView2Async().ConfigureAwait(true);

        var settings = _webView.CoreWebView2.Settings;
        settings.IsStatusBarEnabled = false;
        settings.AreDevToolsEnabled = false;
        // Keep native context menu so selection copy works in desktop WebView2.
        settings.AreDefaultContextMenusEnabled = true;
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
        _webView.CoreWebView2.NavigationCompleted += (_, __) => PublishWindowState();
        _webView.Source = new Uri(_frontendUrl);
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
    private readonly Button _okButton;
    private readonly Button _cancelButton;

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
        ClientSize = new Size(320, 140);
        AutoScaleMode = AutoScaleMode.Font;

        var promptLabel = new Label
        {
            Text = "关闭窗口时，您希望如何处理？",
            Location = new Point(12, 12),
            Size = new Size(296, 20),
        };

        _minimizeRadio = new RadioButton
        {
            Text = "最小化到托盘（继续运行）",
            Location = new Point(24, 40),
            Size = new Size(280, 24),
            Checked = true,
        };

        _exitRadio = new RadioButton
        {
            Text = "直接退出（关闭应用）",
            Location = new Point(24, 68),
            Size = new Size(280, 24),
        };

        _okButton = new Button
        {
            Text = "确定",
            DialogResult = DialogResult.OK,
            Location = new Point(140, 100),
            Size = new Size(80, 28),
        };

        _cancelButton = new Button
        {
            Text = "取消",
            DialogResult = DialogResult.Cancel,
            Location = new Point(228, 100),
            Size = new Size(80, 28),
        };

        Controls.Add(promptLabel);
        Controls.Add(_minimizeRadio);
        Controls.Add(_exitRadio);
        Controls.Add(_okButton);
        Controls.Add(_cancelButton);

        AcceptButton = _okButton;
        CancelButton = _cancelButton;
    }
}