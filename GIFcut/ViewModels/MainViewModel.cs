using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Win32;
using GIFcut.Services;

namespace GIFcut.ViewModels;

public partial class MainViewModel : ObservableObject
{
    private GifReaderService _gifReader = new();
    private GifExporterService _gifExporter = new();
    private List<GifFrame> _frames = new();
    private DispatcherTimer? _playTimer;
    private Point _dragStartPoint = new();
    private string _resizeHandle = "";
    private FrameworkElement? _cropCanvas;

    // 裁剪框状态
    [ObservableProperty] private bool _isDraggingCrop = false;
    [ObservableProperty] private bool _isResizingCrop = false;
    [ObservableProperty] private bool _isInitialized = false;

    [ObservableProperty] private double _cropX = 0;
    [ObservableProperty] private double _cropY = 0;
    [ObservableProperty] private double _cropWidth = 100;
    [ObservableProperty] private double _cropHeight = 100;
    [ObservableProperty] private double _imageWidth = 400;
    [ObservableProperty] private double _imageHeight = 300;

    // 手柄位置
    [ObservableProperty] private double _handleNWLeft = -8;
    [ObservableProperty] private double _handleNWTop = -8;
    [ObservableProperty] private double _handleNELeft = 100;
    [ObservableProperty] private double _handleNETop = -8;
    [ObservableProperty] private double _handleSWLeft = -8;
    [ObservableProperty] private double _handleSWTop = 100;
    [ObservableProperty] private double _handleSELeft = 100;
    [ObservableProperty] private double _handleSETop = 100;

    [ObservableProperty] private double _handleNLeft = 50;
    [ObservableProperty] private double _handleNTop = -4;
    [ObservableProperty] private double _handleSLeft = 50;
    [ObservableProperty] private double _handleSTop = 100;
    [ObservableProperty] private double _handleWLeft = -4;
    [ObservableProperty] private double _handleWTop = 50;
    [ObservableProperty] private double _handleELeft = 100;
    [ObservableProperty] private double _handleETop = 50;

    [ObservableProperty] private int _currentFrameIndex = 0;
    [ObservableProperty] private int _startFrame = 0;
    [ObservableProperty] private int _endFrame = 0;
    [ObservableProperty] private bool _isPlaying = false;
    [ObservableProperty] private string _frameInfo = "帧: 0/0";

    [ObservableProperty] private BitmapSource? _currentFrameBitmap;
    [ObservableProperty] private BitmapSource? _cropPreviewBitmap;

    // UI 状态
    [ObservableProperty] private bool _canPlay = false;
    [ObservableProperty] private bool _canStop = false;
    [ObservableProperty] private bool _canExport = false;
    [ObservableProperty] private bool _canSelectFrame = false;
    [ObservableProperty] private double _sliderMax = 100;
    [ObservableProperty] private string _playButtonText = "播放";
    [ObservableProperty] private double _speed = 1.0; // 速度倍率

    public ObservableCollection<BitmapSource> Thumbnails { get; } = new();

    public int FrameCount => _frames.Count;

    public FrameworkElement? CropCanvas
    {
        get => _cropCanvas;
        set
        {
            if (SetProperty(ref _cropCanvas, value) && value != null)
            {
                value.Width = ImageWidth;
                value.Height = ImageHeight;
            }
        }
    }

    partial void OnCropXChanged(double value)
    {
        int rounded = (int)Math.Round(value);
        if (_cropX != rounded) _cropX = rounded;
        UpdateHandlePositions();
    }
    partial void OnCropYChanged(double value)
    {
        int rounded = (int)Math.Round(value);
        if (_cropY != rounded) _cropY = rounded;
        UpdateHandlePositions();
    }
    partial void OnCropWidthChanged(double value)
    {
        int rounded = (int)Math.Round(value);
        if (_cropWidth != rounded) _cropWidth = rounded;
        UpdateHandlePositions();
    }
    partial void OnCropHeightChanged(double value)
    {
        int rounded = (int)Math.Round(value);
        if (_cropHeight != rounded) _cropHeight = rounded;
        UpdateHandlePositions();
    }

    // 边手柄尺寸
    [ObservableProperty] private double _handleWidth = 60;
    [ObservableProperty] private double _handleHeight = 8;

    partial void OnImageWidthChanged(double value)
    {
        if (_cropCanvas != null) _cropCanvas.Width = value;
        UpdateHandlePositions();
    }
    partial void OnImageHeightChanged(double value)
    {
        if (_cropCanvas != null) _cropCanvas.Height = value;
        UpdateHandlePositions();
    }

    private void UpdateHandlePositions()
    {
        // 4个角 - 偏移使手柄居中
        int cornerOffset = -12;
        HandleNWLeft = CropX + cornerOffset;
        HandleNWTop = CropY + cornerOffset;
        HandleNELeft = CropX + CropWidth + cornerOffset;
        HandleNETop = CropY + cornerOffset;
        HandleSWLeft = CropX + cornerOffset;
        HandleSWTop = CropY + CropHeight + cornerOffset;
        HandleSELeft = CropX + CropWidth + cornerOffset;
        HandleSETop = CropY + CropHeight + cornerOffset;

        // 4个边 - 尺寸跟随裁剪框
        HandleWidth = CropWidth;
        HandleHeight = CropHeight;

        // 上下边
        HandleNLeft = CropX;
        HandleNTop = CropY - 6;
        HandleSLeft = CropX;
        HandleSTop = CropY + CropHeight - 6;

        // 左右边
        HandleWLeft = CropX - 6;
        HandleWTop = CropY;
        HandleELeft = CropX + CropWidth - 6;
        HandleETop = CropY;

        UpdateCropPreview();
    }

    [RelayCommand]
    private async Task OpenAsync()
    {
        var dialog = new OpenFileDialog
        {
            Filter = "GIF文件|*.gif",
            Title = "打开GIF文件"
        };

        if (dialog.ShowDialog() == true)
        {
            await LoadGifAsync(dialog.FileName);
        }
    }

    public async Task LoadGifAsync(string path)
    {
        var result = await _gifReader.LoadGifAsync(path);
        if (result)
        {
            _frames = _gifReader.Frames;
            CurrentFrameIndex = 0;
            StartFrame = 0;
            EndFrame = _frames.Count - 1;

            // 初始化裁剪框
            CropX = 0;
            CropY = 0;
            CropWidth = _gifReader.Width;
            CropHeight = _gifReader.Height;
            ImageWidth = _gifReader.Width;
            ImageHeight = _gifReader.Height;

            // 更新 UI 状态
            SliderMax = _frames.Count - 1;

            // 加载缩略图
            Thumbnails.Clear();
            for (int i = 0; i < _frames.Count; i++)
            {
                Thumbnails.Add(_frames[i].Bitmap);
            }

            ShowFrame(0);
            IsInitialized = true;
            CanPlay = true;
            CanStop = true;
            CanExport = true;
            CanSelectFrame = true;

            StartPlayback();
        }
    }

    private void ShowFrame(int index)
    {
        if (index >= 0 && index < _frames.Count)
        {
            CurrentFrameIndex = index;
            CurrentFrameBitmap = _frames[index].Bitmap;
            FrameInfo = $"帧: {CurrentFrameIndex + 1}/{_frames.Count}";
            UpdateCropPreview();
        }
    }

    [RelayCommand]
    private void Play()
    {
        if (IsPlaying)
        {
            _playTimer?.Stop();
            IsPlaying = false;
            PlayButtonText = "播放";
        }
        else
        {
            StartPlayback();
        }
    }

    private void StartPlayback()
    {
        if (_frames.Count == 0) return;

        _playTimer?.Stop();
        _playTimer = new DispatcherTimer();
        UpdatePlayTimerInterval();
        _playTimer.Tick += PlayTimer_Tick;
        _playTimer.Start();
        IsPlaying = true;
        PlayButtonText = "暂停";
    }

    private void UpdatePlayTimerInterval()
    {
        if (_playTimer == null || _frames.Count == 0) return;
        _playTimer.Interval = TimeSpan.FromMilliseconds(_frames[CurrentFrameIndex].Delay * 10 / Speed);
    }

    private void PlayTimer_Tick(object? sender, EventArgs e)
    {
        if (_frames.Count == 0) return;

        int nextFrame = CurrentFrameIndex + 1;
        if (nextFrame >= _frames.Count)
            nextFrame = StartFrame;

        if (nextFrame > EndFrame)
            nextFrame = StartFrame;

        CurrentFrameIndex = nextFrame;
        CurrentFrameBitmap = _frames[CurrentFrameIndex].Bitmap;
        FrameInfo = $"帧: {CurrentFrameIndex + 1}/{_frames.Count}";
        UpdateCropPreview();
        UpdatePlayTimerInterval();
    }

    [RelayCommand]
    private void Stop()
    {
        _playTimer?.Stop();
        IsPlaying = false;
        PlayButtonText = "播放";
        CurrentFrameIndex = 0;
        ShowFrame(0);
    }

    partial void OnStartFrameChanged(int value)
    {
        if (value > EndFrame)
        {
            EndFrame = value;
        }
    }

    partial void OnEndFrameChanged(int value)
    {
        if (value < StartFrame)
        {
            StartFrame = value;
        }
    }

    private void UpdateCropPreview()
    {
        if (_frames.Count == 0 || CurrentFrameIndex < 0 || CurrentFrameIndex >= _frames.Count)
            return;

        try
        {
            var source = _frames[CurrentFrameIndex].Bitmap;
            if (source == null) return;

            var croppedBitmap = new CroppedBitmap(source,
                new Int32Rect((int)CropX, (int)CropY, (int)CropWidth, (int)CropHeight));
            CropPreviewBitmap = croppedBitmap;
        }
        catch { }
    }

    [RelayCommand]
    private void CropMouseDown(MouseButtonEventArgs e)
    {
        if (_cropCanvas == null) return;
        var pos = e.GetPosition(_cropCanvas);

        // 检查4个角
        var corners = new[] {
            ("NW", CropX, CropY),
            ("NE", CropX + CropWidth, CropY),
            ("SW", CropX, CropY + CropHeight),
            ("SE", CropX + CropWidth, CropY + CropHeight)
        };

        foreach (var (handle, cx, cy) in corners)
        {
            if (Math.Abs(pos.X - cx) <= 16 && Math.Abs(pos.Y - cy) <= 16)
            {
                StartResize(handle, pos);
                _cropCanvas.CaptureMouse();
                return;
            }
        }

        // 检查4个边
        bool onTopEdge = pos.X > CropX + 16 && pos.X < CropX + CropWidth - 16 && Math.Abs(pos.Y - CropY) <= 8;
        bool onBottomEdge = pos.X > CropX + 16 && pos.X < CropX + CropWidth - 16 && Math.Abs(pos.Y - (CropY + CropHeight)) <= 8;
        bool onLeftEdge = pos.Y > CropY + 16 && pos.Y < CropY + CropHeight - 16 && Math.Abs(pos.X - CropX) <= 8;
        bool onRightEdge = pos.Y > CropY + 16 && pos.Y < CropY + CropHeight - 16 && Math.Abs(pos.X - (CropX + CropWidth)) <= 8;

        if (onTopEdge) { StartResize("N", pos); _cropCanvas.CaptureMouse(); return; }
        if (onBottomEdge) { StartResize("S", pos); _cropCanvas.CaptureMouse(); return; }
        if (onLeftEdge) { StartResize("W", pos); _cropCanvas.CaptureMouse(); return; }
        if (onRightEdge) { StartResize("E", pos); _cropCanvas.CaptureMouse(); return; }

        // 检查是否在裁剪框内部
        if (pos.X >= CropX && pos.X <= CropX + CropWidth && pos.Y >= CropY && pos.Y <= CropY + CropHeight)
        {
            IsDraggingCrop = true;
            _dragStartPoint = new Point(pos.X - CropX, pos.Y - CropY);
            _cropCanvas.CaptureMouse();
        }
        else
        {
            CropX = (int)Math.Max(0, Math.Min(pos.X - CropWidth / 2, ImageWidth - CropWidth));
            CropY = (int)Math.Max(0, Math.Min(pos.Y - CropHeight / 2, ImageHeight - CropHeight));
        }
    }

    private void StartResize(string handle, Point pos)
    {
        _resizeHandle = handle;
        IsResizingCrop = true;
        _dragStartPoint = pos;
    }

    [RelayCommand]
    private void CropMouseMove(MouseEventArgs e)
    {
        if (_cropCanvas == null) return;
        var pos = e.GetPosition(_cropCanvas);

        if (IsDraggingCrop)
        {
            CropX = (int)Math.Max(0, Math.Min(pos.X - _dragStartPoint.X, ImageWidth - CropWidth));
            CropY = (int)Math.Max(0, Math.Min(pos.Y - _dragStartPoint.Y, ImageHeight - CropHeight));
        }
        else if (IsResizingCrop)
        {
            ResizeCrop(pos);
        }
    }

    private void ResizeCrop(Point pos)
    {
        double dx = pos.X - _dragStartPoint.X;
        double dy = pos.Y - _dragStartPoint.Y;

        double newX = CropX, newY = CropY, newW = CropWidth, newH = CropHeight;

        bool isLeft = _resizeHandle is "NW" or "W" or "SW";
        bool isRight = _resizeHandle is "NE" or "E" or "SE";
        bool isTop = _resizeHandle is "NW" or "N" or "NE";
        bool isBottom = _resizeHandle is "SW" or "S" or "SE";

        if (isLeft) { newX = CropX + dx; newW = CropWidth - dx; }
        if (isRight) { newW = CropWidth + dx; }
        if (isTop) { newY = CropY + dy; newH = CropHeight - dy; }
        if (isBottom) { newH = CropHeight + dy; }

        // 边界检查
        if (newW >= 20 && newX >= 0 && newX + newW <= ImageWidth) { CropX = (int)Math.Round(newX); CropWidth = (int)Math.Round(newW); }
        if (newH >= 20 && newY >= 0 && newY + newH <= ImageHeight) { CropY = (int)Math.Round(newY); CropHeight = (int)Math.Round(newH); }

        _dragStartPoint = pos;
    }

    [RelayCommand]
    private void CropMouseUp()
    {
        IsDraggingCrop = false;
        IsResizingCrop = false;
        _resizeHandle = "";
        _cropCanvas?.ReleaseMouseCapture();
    }

    [RelayCommand]
    private async Task ExportAsync()
    {
        if (_frames.Count == 0) return;

        var dialog = new SaveFileDialog
        {
            Filter = "GIF文件|*.gif",
            Title = "导出GIF文件",
            DefaultExt = ".gif"
        };

        if (dialog.ShowDialog() == true)
        {
            var cropRect = new Int32Rect((int)CropX, (int)CropY, (int)CropWidth, (int)CropHeight);

            var result = await _gifExporter.ExportGifAsync(
                _frames,
                StartFrame,
                EndFrame,
                cropRect,
                dialog.FileName,
                Speed);

            if (result == "success")
            {
                MessageBox.Show("导出成功！", "完成", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            else
            {
                MessageBox.Show(result, "错误", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }
    }

    [RelayCommand]
    private void SelectFrame(int index)
    {
        ShowFrame(index);
    }

    [RelayCommand]
    private void DragEnter(DragEventArgs e)
    {
        if (e.Data.GetDataPresent(DataFormats.FileDrop))
        {
            var files = (string[]?)e.Data.GetData(DataFormats.FileDrop);
            if (files != null && files.Length > 0 && files[0].ToLower().EndsWith(".gif"))
            {
                e.Effects = DragDropEffects.Copy;
                return;
            }
        }
        e.Effects = DragDropEffects.None;
    }

    [RelayCommand]
    private async Task Drop(DragEventArgs e)
    {
        if (e.Data.GetDataPresent(DataFormats.FileDrop))
        {
            var files = (string[]?)e.Data.GetData(DataFormats.FileDrop);
            if (files != null && files.Length > 0 && files[0].ToLower().EndsWith(".gif"))
            {
                await LoadGifAsync(files[0]);
            }
        }
    }

    public void Cleanup()
    {
        _playTimer?.Stop();
    }
}
