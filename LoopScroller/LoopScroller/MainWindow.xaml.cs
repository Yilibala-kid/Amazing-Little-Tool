using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using LoopScroller.Loaders;
using LoopScroller.Models;
using LoopScroller.Rendering;
using LoopScroller.Scrolling;
using Microsoft.Win32;

namespace LoopScroller;

public partial class MainWindow : Window
{
    private readonly ContentLoaderFactory _loaderFactory = new();
    private readonly DispatcherTimer _overlayTimer;
    private readonly DispatcherTimer _resizeTimer;
    private CancellationTokenSource? _loadCancellation;
    private CancellationTokenSource? _renderCancellation;
    private bool _isLoading;
    private DisplayDocument? _document;
    private TimeSpan? _lastRenderingTime;
    private bool _renderingSubscribed;
    private bool _closed;
    private bool _isPlaying = true;
    private bool _isFullscreen;
    private (WindowStyle Style, ResizeMode Resize, WindowState State, bool Topmost) _savedWindow;

    public MainWindow()
    {
        InitializeComponent();

        _overlayTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
        _overlayTimer.Tick += (_, _) => HideControls();

        _resizeTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(180) };
        _resizeTimer.Tick += async (_, _) =>
        {
            _resizeTimer.Stop();
            await RebuildLoopAsync();
        };

        Surface.RenderFailed += ShowRenderError;
        StateChanged += (_, _) => UpdateRenderingSubscription();
    }

    public async Task LoadFileAsync(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) return;
        CancelPending();
        if (!File.Exists(path))
        {
            ShowError("找不到指定的文件。");
            return;
        }

        using var request = new CancellationTokenSource();
        _loadCancellation = request;
        var cancellationToken = request.Token;
        _isLoading = true;

        LoadingText.Text = $"正在读取 {Path.GetFileName(path)}…";
        LoadingOverlay.Visibility = Visibility.Visible;
        StartStatusText.Text = string.Empty;

        try
        {
            var loader = _loaderFactory.GetLoader(path);
            if (loader is PptContentLoader)
                LoadingText.Text = $"正在通过 PowerPoint 转换 {Path.GetFileName(path)}…";
            var document = await Task.Run(() =>
            {
                var loaded = loader.Load(path, cancellationToken);
                ImageCache.Prepare(loaded, cancellationToken);
                return loaded;
            }, cancellationToken);
            cancellationToken.ThrowIfCancellationRequested();

            _document = document;
            Surface.Clear();
            PlayerTitle.Text = document.Title;
            ShowPlayer();
            EnterFullscreen();
            await Dispatcher.Yield(DispatcherPriority.Loaded);
            cancellationToken.ThrowIfCancellationRequested();
            _resizeTimer.Stop();
            await RebuildLoopAsync();
        }
        catch (OperationCanceledException)
        {
        }
        catch (Exception exception)
        {
            if (ReferenceEquals(_loadCancellation, request) && !cancellationToken.IsCancellationRequested)
                ShowError(GetFriendlyMessage(exception));
        }
        finally
        {
            if (ReferenceEquals(_loadCancellation, request))
            {
                _isLoading = false;
                LoadingOverlay.Visibility = Visibility.Collapsed;
                _loadCancellation = null;
                UpdateRenderingSubscription();
            }
        }
    }

    private void OpenFile_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog
        {
            Title = "选择要滚动显示的文件",
            Filter = ContentLoaderFactory.FileFilter,
            CheckFileExists = true,
            Multiselect = false
        };

        if (dialog.ShowDialog(this) == true)
        {
            _ = LoadFileAsync(dialog.FileName);
        }
    }

    private void ShowPlayer()
    {
        StartPage.Visibility = Visibility.Collapsed;
        PlayerPage.Visibility = Visibility.Visible;
        _isPlaying = true;
        PlayPauseButton.Content = "暂停";
        _lastRenderingTime = null;
    }

    private void ShowStartPage()
    {
        CancelPending();
        LoadingOverlay.Visibility = Visibility.Collapsed;
        _isLoading = false;
        ExitFullscreen();
        PlayerPage.Visibility = Visibility.Collapsed;
        StartPage.Visibility = Visibility.Visible;
        _isPlaying = false;
        HideControls();
        Surface.Clear();
        _document = null;
        UpdateRenderingSubscription();
    }

    private void CancelPending()
    {
        _loadCancellation?.Cancel();
        _loadCancellation = null; // Each asynchronous owner disposes its own source in finally.
        _renderCancellation?.Cancel();
        _renderCancellation = null;
        _resizeTimer.Stop();
    }

    private async Task RebuildLoopAsync()
    {
        if (_document is null || PlayerPage.Visibility != Visibility.Visible ||
            ScrollViewport.ActualWidth < 100 || ScrollViewport.ActualHeight < 100)
        {
            return;
        }

        _renderCancellation?.Cancel();
        using var request = new CancellationTokenSource();
        _renderCancellation = request;
        RenderedDocument? prepared = null;
        try
        {
            prepared = await RenderedDocument.CreateAsync(_document, ScrollViewport.ActualWidth, ZoomSlider.Value / 100d,
                VisualTreeHelper.GetDpi(Surface), request.Token);
            var anchor = Surface.Document?.CaptureAnchor(Surface.Offset) ?? (0, 0d);
            var offset = prepared.RestoreAnchor(anchor);
            await prepared.WarmAsync(prepared.ChunksIn(offset,
                ScrollViewport.ActualHeight + prepared.ChunkHeight * 2), request.Token);
            request.Token.ThrowIfCancellationRequested();
            // Old images kept playing during layout and prewarming. Capture the
            // latest position, including wheel input, immediately before the swap.
            anchor = Surface.Document?.CaptureAnchor(Surface.Offset) ?? (0, 0d);
            Surface.SetDocument(prepared, prepared.RestoreAnchor(anchor));
            prepared = null; // Surface owns the new worker and cache.
        }
        catch (OperationCanceledException) { }
        catch (Exception exception)
        {
            if (ReferenceEquals(_renderCancellation, request)) ShowRenderError(exception);
        }
        finally
        {
            prepared?.Dispose();
            if (ReferenceEquals(_renderCancellation, request)) _renderCancellation = null;
        }
    }

    private void UpdateRenderingSubscription()
    {
        bool needed = !_closed && _isPlaying && !_isLoading && _document is not null &&
            PlayerPage.Visibility == Visibility.Visible && WindowState != WindowState.Minimized;
        if (needed == _renderingSubscribed) return;
        if (needed) CompositionTarget.Rendering += CompositionTarget_Rendering;
        else CompositionTarget.Rendering -= CompositionTarget_Rendering;
        _renderingSubscribed = needed;
        _lastRenderingTime = null;
    }

    protected override void OnDpiChanged(DpiScale oldDpi, DpiScale newDpi)
    {
        base.OnDpiChanged(oldDpi, newDpi);
        ScheduleRebuild();
    }

    private void ScheduleRebuild()
    {
        if (_document is null || _closed) return;
        _renderCancellation?.Cancel();
        _resizeTimer.Stop();
        _resizeTimer.Start();
    }

    private void CompositionTarget_Rendering(object? sender, EventArgs e)
    {
        if (e is not RenderingEventArgs renderingArgs)
        {
            return;
        }

        if (_lastRenderingTime is null)
        {
            _lastRenderingTime = renderingArgs.RenderingTime;
            return;
        }

        var elapsed = (renderingArgs.RenderingTime - _lastRenderingTime.Value).TotalSeconds;
        _lastRenderingTime = renderingArgs.RenderingTime;

        if (!_isPlaying || _isLoading || WindowState == WindowState.Minimized ||
            PlayerPage.Visibility != Visibility.Visible || Surface.CycleHeight <= 0)
        {
            return;
        }

        elapsed = Math.Min(elapsed, 0.1);
        SetScrollOffset(LoopMath.Advance(Surface.Offset, SpeedSlider.Value, elapsed, Surface.CycleHeight));
    }

    private void Window_PreviewMouseWheel(object sender, MouseWheelEventArgs e)
    {
        if (PlayerPage.Visibility != Visibility.Visible) return;

        // Handle at the window so a focused slider cannot change speed/zoom on wheel input.
        e.Handled = true;
        if (_isLoading || Surface.CycleHeight <= 0) return;

        // One standard notch (120 delta) moves 120 DIPs; high-resolution deltas stay proportional.
        // Positive wheel delta goes backward. Keep the playing state, speed and frame clock intact.
        SetScrollOffset(Surface.Offset - e.Delta);
    }

    private void SetScrollOffset(double offset)
    {
        try { Surface.SetOffset(offset); }
        catch (Exception exception) { ShowRenderError(exception); }
    }

    private void ShowRenderError(Exception exception) => ShowError($"文件内容无法显示：{exception.Message}");

    private void PlayPause_Click(object sender, RoutedEventArgs e) => TogglePlayPause();

    private void TogglePlayPause()
    {
        if (_document is null) return;
        _isPlaying = !_isPlaying;
        PlayPauseButton.Content = _isPlaying ? "暂停" : "继续";
        _lastRenderingTime = null;
        UpdateRenderingSubscription();
        ShowControls();
    }

    private void ZoomSlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (IsLoaded) ScheduleRebuild();
    }

    private void Window_PreviewKeyDown(object sender, KeyEventArgs e)
    {
        switch (e.Key)
        {
            case Key.Escape when _isLoading || PlayerPage.Visibility == Visibility.Visible:
                ShowStartPage();
                break;
            case Key.O when (Keyboard.Modifiers & ModifierKeys.Control) != 0:
                OpenFile_Click(sender, e);
                break;
            case var _ when PlayerPage.Visibility != Visibility.Visible:
                return;
            case Key.Space:
                TogglePlayPause();
                break;
            case Key.Up or Key.Down:
                AdjustSlider(SpeedSlider, e.Key == Key.Up ? 10 : -10);
                break;
            case Key.Add:
            case Key.OemPlus:
                AdjustSlider(ZoomSlider, 10);
                break;
            case Key.Subtract:
            case Key.OemMinus:
                AdjustSlider(ZoomSlider, -10);
                break;
            case Key.F11:
                ExitFullscreen_Click(sender, e);
                break;
            default:
                return;
        }
        e.Handled = true;
    }

    private static void AdjustSlider(Slider slider, double delta) =>
        slider.Value = Math.Clamp(slider.Value + delta, slider.Minimum, slider.Maximum);

    private void EnterFullscreen()
    {
        if (_isFullscreen) return;

        _savedWindow = (WindowStyle, ResizeMode, WindowState, Topmost);

        WindowState = WindowState.Normal;
        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        Topmost = false;
        WindowState = WindowState.Maximized;
        _isFullscreen = true;
        FullscreenButton.Content = "退出全屏";
    }

    private void ExitFullscreen()
    {
        if (!_isFullscreen) return;

        Topmost = _savedWindow.Topmost;
        WindowState = WindowState.Normal;
        WindowStyle = _savedWindow.Style;
        ResizeMode = _savedWindow.Resize;
        WindowState = _savedWindow.State;
        _isFullscreen = false;
        FullscreenButton.Content = "进入全屏";
    }

    private void ExitFullscreen_Click(object sender, RoutedEventArgs e)
    {
        if (_isFullscreen) ExitFullscreen(); else EnterFullscreen();
        ShowControls();
    }

    private void Window_PreviewMouseMove(object sender, MouseEventArgs e)
    {
        if (PlayerPage.Visibility != Visibility.Visible) return;
        var position = e.GetPosition(this);
        if (ActualHeight - position.Y <= Math.Max(100, ControlOverlay.ActualHeight + 36))
        {
            ShowControls();
        }
        else HideControls();
    }

    private void ShowControls()
    {
        SetControlsVisible(true);
        _overlayTimer.Stop();
        _overlayTimer.Start();
    }

    private void HideControls()
    {
        _overlayTimer.Stop();
        if (Mouse.LeftButton == MouseButtonState.Pressed && ControlOverlay.IsMouseOver)
        {
            _overlayTimer.Start();
            return;
        }

        SetControlsVisible(false);
    }

    private void SetControlsVisible(bool visible)
    {
        ControlOverlay.Opacity = visible ? 1 : 0;
        ControlOverlay.IsHitTestVisible = visible;
        PlayerTitle.Visibility = visible ? Visibility.Visible : Visibility.Collapsed;
    }

    private void Window_SizeChanged(object sender, SizeChangedEventArgs e) => ScheduleRebuild();

    private void Window_PreviewDragOver(object sender, DragEventArgs e)
    {
        e.Effects = e.Data.GetDataPresent(DataFormats.FileDrop)
            ? DragDropEffects.Copy
            : DragDropEffects.None;
        e.Handled = true;
    }

    private void Window_PreviewDrop(object sender, DragEventArgs e)
    {
        if (e.Data.GetData(DataFormats.FileDrop) is string[] { Length: > 0 } files)
        {
            _ = LoadFileAsync(files[0]);
        }
        e.Handled = true;
    }

    private void ShowError(string message)
    {
        ShowStartPage();
        StartStatusText.Text = message;
    }

    private static string GetFriendlyMessage(Exception exception) => exception switch
    {
        NotSupportedException => exception.Message,
        UnauthorizedAccessException => "没有权限读取这个文件。",
        FileNotFoundException => "找不到指定的文件。",
        IOException => $"文件当前无法读取：{exception.Message}",
        InvalidDataException => exception.Message,
        _ => $"文件无法打开：{exception.Message}"
    };

    private void Window_Closing(object? sender, CancelEventArgs e)
    {
        _closed = true;
        CancelPending();
        Surface.Clear();
        _overlayTimer.Stop();
        UpdateRenderingSubscription();
    }
}
