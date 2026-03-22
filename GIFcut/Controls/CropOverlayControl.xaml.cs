using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;

namespace GIFcut.Controls;

public partial class CropOverlayControl : UserControl
{
    private bool _isDragging = false;
    private bool _isResizing = false;
    private Point _startPoint;
    private Rect _cropRect;
    private ResizeDirection _resizeDirection = ResizeDirection.None;
    private double _imageWidth = 0;
    private double _imageHeight = 0;
    private const int MinCropSize = 20;

    public static readonly DependencyProperty CropRectProperty =
        DependencyProperty.Register(nameof(CropRect), typeof(Rect), typeof(CropOverlayControl),
            new FrameworkPropertyMetadata(new Rect(0, 0, 100, 100), FrameworkPropertyMetadataOptions.BindsTwoWayByDefault, OnCropRectChanged));

    public static readonly DependencyProperty ImageWidthProperty =
        DependencyProperty.Register(nameof(ImageWidth), typeof(double), typeof(CropOverlayControl),
            new PropertyMetadata(0.0, OnImageSizeChanged));

    public static readonly DependencyProperty ImageHeightProperty =
        DependencyProperty.Register(nameof(ImageHeight), typeof(double), typeof(CropOverlayControl),
            new PropertyMetadata(0.0, OnImageSizeChanged));

    public Rect CropRect
    {
        get => (Rect)GetValue(CropRectProperty);
        set => SetValue(CropRectProperty, value);
    }

    public double ImageWidth
    {
        get => (double)GetValue(ImageWidthProperty);
        set => SetValue(ImageWidthProperty, value);
    }

    public double ImageHeight
    {
        get => (double)GetValue(ImageHeightProperty);
        set => SetValue(ImageHeightProperty, value);
    }

    public CropOverlayControl()
    {
        InitializeComponent();
        SizeChanged += OnSizeChanged;
        InitializeCropRect();
    }

    private void InitializeCropRect()
    {
        // 初始裁剪区域为图像中心区域
        if (_imageWidth > 0 && _imageHeight > 0)
        {
            double cropWidth = _imageWidth * 0.8;
            double cropHeight = _imageHeight * 0.8;
            _cropRect = new Rect(
                (_imageWidth - cropWidth) / 2,
                (_imageHeight - cropHeight) / 2,
                cropWidth,
                cropHeight);
            CropRect = _cropRect;
        }
    }

    private static void OnCropRectChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is CropOverlayControl control)
        {
            control._cropRect = (Rect)e.NewValue;
            control.UpdateCropOverlay();
        }
    }

    private static void OnImageSizeChanged(DependencyObject d, DependencyPropertyChangedEventArgs e)
    {
        if (d is CropOverlayControl control)
        {
            control._imageWidth = control.ImageWidth;
            control._imageHeight = control.ImageHeight;

            if (control._cropRect.Width == 0 || control._cropRect.Height == 0)
            {
                control.InitializeCropRect();
            }
        }
    }

    private void OnSizeChanged(object sender, SizeChangedEventArgs e)
    {
        UpdateCropOverlay();
    }

    private void UpdateCropOverlay()
    {
        double width = ActualWidth;
        double height = ActualHeight;

        if (width <= 0 || height <= 0) return;

        // 计算缩放比例（相对于原始图像尺寸）
        double scaleX = _imageWidth > 0 ? width / _imageWidth : 1;
        double scaleY = _imageHeight > 0 ? height / _imageHeight : 1;

        // 将裁剪区域转换为显示坐标
        double cropX = _cropRect.X * scaleX;
        double cropY = _cropRect.Y * scaleY;
        double cropWidth = _cropRect.Width * scaleX;
        double cropHeight = _cropRect.Height * scaleY;

        // 确保裁剪框不超出边界
        cropX = Math.Max(0, Math.Min(cropX, width - MinCropSize * scaleX));
        cropY = Math.Max(0, Math.Min(cropY, height - MinCropSize * scaleY));
        cropWidth = Math.Max(MinCropSize * scaleX, Math.Min(cropWidth, width - cropX));
        cropHeight = Math.Max(MinCropSize * scaleY, Math.Min(cropHeight, height - cropY));

        // 更新遮罩层 - 使用四个矩形覆盖非裁剪区域
        UpdateOverlayRectangles(cropX, cropY, cropWidth, cropHeight, width, height);

        // 更新裁剪框位置
        Canvas.SetLeft(PART_CropBorder, cropX);
        Canvas.SetTop(PART_CropBorder, cropY);
        PART_CropBorder.Width = cropWidth;
        PART_CropBorder.Height = cropHeight;

        // 更新调整手柄位置
        UpdateResizeHandles(cropX, cropY, cropWidth, cropHeight);
    }

    private void UpdateOverlayRectangles(double cropX, double cropY, double cropWidth, double cropHeight, double totalWidth, double totalHeight)
    {
        // 移除旧的遮罩矩形 (只移除动态创建的，不是调整手柄)
        var resizeHandles = new HashSet<UIElement>
        {
            PART_ResizeNW, PART_ResizeNE, PART_ResizeSW, PART_ResizeSE,
            PART_ResizeN, PART_ResizeS, PART_ResizeW, PART_ResizeE
        };

        var toRemove = PART_Canvas.Children.OfType<Rectangle>()
            .Where(r => !resizeHandles.Contains(r))
            .ToList();

        foreach (var rect in toRemove)
        {
            PART_Canvas.Children.Remove(rect);
        }

        // 左侧遮罩
        if (cropX > 0)
        {
            var leftMask = CreateMaskRect(0, 0, cropX, totalHeight);
            Canvas.SetLeft(leftMask, 0);
            Canvas.SetTop(leftMask, 0);
            Panel.SetZIndex(leftMask, -1);
            PART_Canvas.Children.Insert(0, leftMask);
        }

        // 右侧遮罩
        double rightX = cropX + cropWidth;
        if (rightX < totalWidth)
        {
            var rightMask = CreateMaskRect(rightX, 0, totalWidth - rightX, totalHeight);
            Canvas.SetLeft(rightMask, rightX);
            Canvas.SetTop(rightMask, 0);
            Panel.SetZIndex(rightMask, -1);
            PART_Canvas.Children.Insert(0, rightMask);
        }

        // 上方遮罩
        if (cropY > 0)
        {
            var topMask = CreateMaskRect(cropX, 0, cropWidth, cropY);
            Canvas.SetLeft(topMask, cropX);
            Canvas.SetTop(topMask, 0);
            Panel.SetZIndex(topMask, -1);
            PART_Canvas.Children.Insert(0, topMask);
        }

        // 下方遮罩
        double bottomY = cropY + cropHeight;
        if (bottomY < totalHeight)
        {
            var bottomMask = CreateMaskRect(cropX, bottomY, cropWidth, totalHeight - bottomY);
            Canvas.SetLeft(bottomMask, cropX);
            Canvas.SetTop(bottomMask, bottomY);
            Panel.SetZIndex(bottomMask, -1);
            PART_Canvas.Children.Insert(0, bottomMask);
        }
    }

    private Rectangle CreateMaskRect(double x, double y, double width, double height)
    {
        return new Rectangle
        {
            Width = width,
            Height = height,
            Fill = new SolidColorBrush(Color.FromArgb(128, 0, 0, 0))
        };
    }

    private void UpdateResizeHandles(double cropX, double cropY, double cropWidth, double cropHeight)
    {
        // 角手柄
        Canvas.SetLeft(PART_ResizeNW, cropX - 6);
        Canvas.SetTop(PART_ResizeNW, cropY - 6);

        Canvas.SetLeft(PART_ResizeNE, cropX + cropWidth - 6);
        Canvas.SetTop(PART_ResizeNE, cropY - 6);

        Canvas.SetLeft(PART_ResizeSW, cropX - 6);
        Canvas.SetTop(PART_ResizeSW, cropY + cropHeight - 6);

        Canvas.SetLeft(PART_ResizeSE, cropX + cropWidth - 6);
        Canvas.SetTop(PART_ResizeSE, cropY + cropHeight - 6);

        // 边手柄
        Canvas.SetLeft(PART_ResizeN, cropX + cropWidth / 2 - 15);
        Canvas.SetTop(PART_ResizeN, cropY - 4);

        Canvas.SetLeft(PART_ResizeS, cropX + cropWidth / 2 - 15);
        Canvas.SetTop(PART_ResizeS, cropY + cropHeight - 4);

        Canvas.SetLeft(PART_ResizeW, cropX - 4);
        Canvas.SetTop(PART_ResizeW, cropY + cropHeight / 2 - 15);

        Canvas.SetLeft(PART_ResizeE, cropX + cropWidth - 4);
        Canvas.SetTop(PART_ResizeE, cropY + cropHeight / 2 - 15);
    }

    private void CropBorder_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (_imageWidth <= 0 || _imageHeight <= 0) return;

        _isDragging = true;
        _startPoint = e.GetPosition(PART_Canvas);
        PART_CropBorder.CaptureMouse();
        e.Handled = true;
    }

    private void CropBorder_MouseMove(object sender, MouseEventArgs e)
    {
        if (!_isDragging || _imageWidth <= 0) return;

        var currentPoint = e.GetPosition(PART_Canvas);
        double deltaX = currentPoint.X - _startPoint.X;
        double deltaY = currentPoint.Y - _startPoint.Y;

        // 转换为原始图像坐标
        double scaleX = _imageWidth / ActualWidth;
        double scaleY = _imageHeight / ActualHeight;
        deltaX *= scaleX;
        deltaY *= scaleY;

        double newX = _cropRect.X + deltaX;
        double newY = _cropRect.Y + deltaY;

        // 限制在图像范围内
        newX = Math.Max(0, Math.Min(newX, _imageWidth - _cropRect.Width));
        newY = Math.Max(0, Math.Min(newY, _imageHeight - _cropRect.Height));

        _cropRect = new Rect(newX, newY, _cropRect.Width, _cropRect.Height);
        CropRect = _cropRect;
        UpdateCropOverlay();

        _startPoint = currentPoint;
    }

    private void CropBorder_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        _isDragging = false;
        PART_CropBorder.ReleaseMouseCapture();
        e.Handled = true;
    }

    private void ResizeHandle_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (_imageWidth <= 0 || _imageHeight <= 0) return;

        _isResizing = true;
        _startPoint = e.GetPosition(PART_Canvas);

        var element = sender as FrameworkElement;
        if (element != null)
        {
            element.CaptureMouse();

            _resizeDirection = element.Name switch
            {
                "PART_ResizeNW" => ResizeDirection.NW,
                "PART_ResizeNE" => ResizeDirection.NE,
                "PART_ResizeSW" => ResizeDirection.SW,
                "PART_ResizeSE" => ResizeDirection.SE,
                "PART_ResizeN" => ResizeDirection.N,
                "PART_ResizeS" => ResizeDirection.S,
                "PART_ResizeW" => ResizeDirection.W,
                "PART_ResizeE" => ResizeDirection.E,
                _ => ResizeDirection.None
            };
        }

        e.Handled = true;
    }

    private void ResizeHandle_MouseMove(object sender, MouseEventArgs e)
    {
        if (!_isResizing || _imageWidth <= 0) return;

        var currentPoint = e.GetPosition(PART_Canvas);
        double deltaX = currentPoint.X - _startPoint.X;
        double deltaY = currentPoint.Y - _startPoint.Y;

        // 转换为原始图像坐标
        double scaleX = _imageWidth / ActualWidth;
        double scaleY = _imageHeight / ActualHeight;
        deltaX *= scaleX;
        deltaY *= scaleY;

        double newX = _cropRect.X;
        double newY = _cropRect.Y;
        double newWidth = _cropRect.Width;
        double newHeight = _cropRect.Height;

        switch (_resizeDirection)
        {
            case ResizeDirection.NW:
                newX = _cropRect.X + deltaX;
                newY = _cropRect.Y + deltaY;
                newWidth = _cropRect.Width - deltaX;
                newHeight = _cropRect.Height - deltaY;
                break;
            case ResizeDirection.NE:
                newY = _cropRect.Y + deltaY;
                newWidth = _cropRect.Width + deltaX;
                newHeight = _cropRect.Height - deltaY;
                break;
            case ResizeDirection.SW:
                newX = _cropRect.X + deltaX;
                newWidth = _cropRect.Width - deltaX;
                newHeight = _cropRect.Height + deltaY;
                break;
            case ResizeDirection.SE:
                newWidth = _cropRect.Width + deltaX;
                newHeight = _cropRect.Height + deltaY;
                break;
            case ResizeDirection.N:
                newY = _cropRect.Y + deltaY;
                newHeight = _cropRect.Height - deltaY;
                break;
            case ResizeDirection.S:
                newHeight = _cropRect.Height + deltaY;
                break;
            case ResizeDirection.W:
                newX = _cropRect.X + deltaX;
                newWidth = _cropRect.Width - deltaX;
                break;
            case ResizeDirection.E:
                newWidth = _cropRect.Width + deltaX;
                break;
        }

        // 检查最小尺寸
        if (newWidth >= MinCropSize && newHeight >= MinCropSize)
        {
            // 限制在图像范围内
            newX = Math.Max(0, newX);
            newY = Math.Max(0, newY);
            newWidth = Math.Min(newWidth, _imageWidth - newX);
            newHeight = Math.Min(newHeight, _imageHeight - newY);

            _cropRect = new Rect(newX, newY, newWidth, newHeight);
            CropRect = _cropRect;
            UpdateCropOverlay();

            _startPoint = currentPoint;
        }
    }

    private void ResizeHandle_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        _isResizing = false;
        _resizeDirection = ResizeDirection.None;

        var element = sender as FrameworkElement;
        element?.ReleaseMouseCapture();

        e.Handled = true;
    }

    private enum ResizeDirection
    {
        None,
        NW, NE, SW, SE,
        N, S, W, E
    }
}
