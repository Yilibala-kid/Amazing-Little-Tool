using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Win32;
using GIFcut.Services;

namespace GIFcut.ViewModels;

public partial class MainViewModel : ObservableObject
{
    private readonly GifReaderService _gifReader = new();
    private readonly GifExporterService _gifExporter = new();
    private IReadOnlyList<GifFrame> _frames = Array.Empty<GifFrame>();
    private DispatcherTimer? _playTimer;
    private int _loadVersion;
    private bool _closed;
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

    // 缩放百分比
    [ObservableProperty] private int _outputScalePercent = 100;

    public ObservableCollection<BitmapSource> Thumbnails { get; } = new();

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
        var version = ++_loadVersion;
        PausePlayback();
        try
        {
            var document = await _gifReader.LoadGifAsync(path);
            if (_closed || version != _loadVersion) return;
            _frames = document.Frames;
            CurrentFrameIndex = 0;
            StartFrame = 0;
            EndFrame = _frames.Count - 1;

            // 初始化裁剪框
            CropX = 0;
            CropY = 0;
            CropWidth = document.Width;
            CropHeight = document.Height;
            ImageWidth = document.Width;
            ImageHeight = document.Height;
            OutputScalePercent = 100;

            // 更新 UI 状态
            SliderMax = _frames.Count - 1;

            // 加载缩略图
            Thumbnails.Clear();
            for (int i = 0; i < _frames.Count; i++)
            {
                Thumbnails.Add(_frames[i].Bitmap);
            }

            ShowFrame(0);
            CanPlay = true;
            CanStop = true;
            CanExport = true;
            CanSelectFrame = true;

            StartPlayback();
        }
        catch (Exception error)
        {
            if (!_closed && version == _loadVersion)
                MessageBox.Show($"打开失败：{error.Message}", "错误", MessageBoxButton.OK, MessageBoxImage.Error);
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
            PausePlayback();
        }
        else
        {
            StartPlayback();
        }
    }

    private void StartPlayback()
    {
        if (_frames.Count == 0) return;

        if (_playTimer == null)
        {
            _playTimer = new DispatcherTimer();
            _playTimer.Tick += PlayTimer_Tick;
        }
        if (CurrentFrameIndex < StartFrame || CurrentFrameIndex > EndFrame) ShowFrame(StartFrame);
        UpdatePlayTimerInterval();
        _playTimer.Start();
        IsPlaying = true;
        PlayButtonText = "暂停";
    }

    private void PausePlayback()
    {
        _playTimer?.Stop();
        IsPlaying = false;
        PlayButtonText = "播放";
    }

    partial void OnSpeedChanged(double value)
    {
        if (!double.IsFinite(value) || value <= 0) { Speed = 1; return; }
        UpdatePlayTimerInterval();
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

        ShowFrame(nextFrame);
        UpdatePlayTimerInterval();
    }

    [RelayCommand]
    private void Stop()
    {
        PausePlayback();
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
            try
            {
                var cropRect = new Int32Rect((int)CropX, (int)CropY, (int)CropWidth, (int)CropHeight);
                await _gifExporter.ExportGifAsync(
                    _frames, StartFrame, EndFrame, cropRect,
                    dialog.FileName, Speed, OutputScalePercent);

                MessageBox.Show("导出成功！", "完成", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            catch (Exception error)
            {
                MessageBox.Show($"导出失败：{error.Message}", "错误", MessageBoxButton.OK, MessageBoxImage.Error);
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
            if (files is { Length: > 0 } && files[0].EndsWith(".gif", StringComparison.OrdinalIgnoreCase))
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
            if (files is { Length: > 0 } && files[0].EndsWith(".gif", StringComparison.OrdinalIgnoreCase))
            {
                await LoadGifAsync(files[0]);
            }
        }
    }

    public void Cleanup()
    {
        _closed = true;
        _loadVersion++;
        PausePlayback();
        if (_playTimer != null) _playTimer.Tick -= PlayTimer_Tick;
        _playTimer = null;
        CropMouseUp();
        CropCanvas = null;
    }
}
