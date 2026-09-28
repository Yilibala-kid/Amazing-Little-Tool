using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace LoopScroller.Rendering;

// PDFium calls are serialized across document generations. Only requested strips
// are rasterized; native pages and bitmaps never leave the rendering worker.
internal sealed class PdfRenderSource : IRenderSource
{
    private GCHandle _data;
    private IntPtr _document;
    private readonly double _width;
    private readonly double _pageWidth;
    private readonly DpiScale _dpi;
    public double[] BlockStarts { get; }
    public double Height => BlockStarts[^1];

    public PdfRenderSource(byte[] data, double width, double zoom, DpiScale dpi, CancellationToken token)
    {
        _width = width;
        _pageWidth = width * zoom;
        _dpi = dpi;
        lock (PdfNative.Sync)
        {
            try
            {
                token.ThrowIfCancellationRequested();
                PdfNative.EnsureInitialized();
                _data = GCHandle.Alloc(data, GCHandleType.Pinned);
                _document = PdfNative.FPDF_LoadMemDocument64(_data.AddrOfPinnedObject(), (nuint)data.Length, IntPtr.Zero);
                if (_document == IntPtr.Zero)
                    throw new InvalidDataException(PdfNative.FPDF_GetLastError() == 4
                        ? "PDF 需要密码，请先另存为无需密码的 PDF 后播放。"
                        : "PDF 无法读取，文件可能已损坏或使用了不支持的格式。");
                int pages = PdfNative.FPDF_GetPageCount(_document);
                if (pages <= 0) throw new InvalidDataException("PDF 中没有可播放的页面。");
                if (pages > 5000) throw new InvalidDataException("PDF 超过 5000 页，请拆分后播放。");
                BlockStarts = new double[pages + 1];
                for (int index = 0; index < pages; index++)
                {
                    token.ThrowIfCancellationRequested();
                    if (PdfNative.FPDF_GetPageSizeByIndexF(_document, index, out var size) == 0 ||
                        !float.IsFinite(size.Width) || !float.IsFinite(size.Height) || size.Width <= 0 || size.Height <= 0)
                        throw new InvalidDataException("PDF 包含无效的页面尺寸。");
                    BlockStarts[index + 1] = BlockStarts[index] + size.Height * (_pageWidth / size.Width);
                    if (!double.IsFinite(BlockStarts[index + 1]) || BlockStarts[index + 1] > 100_000_000)
                        throw new InvalidDataException("PDF 页面过长，请拆分或降低缩放后播放。");
                }
            }
            catch { Dispose(); throw; }
        }
    }

    public void Draw(DrawingContext dc, Rect region, CancellationToken token)
    {
        double top = Math.Max(0, region.Top), bottom = Math.Min(Height, region.Bottom);
        if (bottom <= top) return;
        int first = Array.BinarySearch(BlockStarts, top);
        if (first < 0) first = ~first - 1;
        double left = Math.Max(0, (_width - _pageWidth) / 2);
        double visibleWidth = Math.Min(_width, _pageWidth);
        double croppedLeft = Math.Max(0, (_pageWidth - _width) / 2);
        for (int index = Math.Max(0, first); index < BlockStarts.Length - 1 && BlockStarts[index] < bottom; index++)
        {
            token.ThrowIfCancellationRequested();
            double start = Math.Max(top, BlockStarts[index]), end = Math.Min(bottom, BlockStarts[index + 1]);
            if (end <= start) continue;
            // Anchor every crop to the same page pixel grid to avoid seams when
            // page boundaries fall between physical pixels at fractional DPI.
            int x = checked((int)Math.Floor(croppedLeft * _dpi.DpiScaleX));
            int y = checked((int)Math.Floor((start - BlockStarts[index]) * _dpi.DpiScaleY));
            int width = checked((int)Math.Ceiling((croppedLeft + visibleWidth) * _dpi.DpiScaleX) - x);
            int height = checked((int)Math.Ceiling((end - BlockStarts[index]) * _dpi.DpiScaleY) - y);
            var bitmap = RenderRegion(index, x, y, width, height, token);
            dc.PushClip(new RectangleGeometry(new Rect(left, start, visibleWidth, end - start)));
            dc.DrawImage(bitmap, new Rect(left + x / _dpi.DpiScaleX - croppedLeft,
                BlockStarts[index] + y / _dpi.DpiScaleY, width / _dpi.DpiScaleX, height / _dpi.DpiScaleY));
            dc.Pop();
        }
    }

    private BitmapSource RenderRegion(int index, int x, int y, int width, int height, CancellationToken token)
    {
        lock (PdfNative.Sync)
        {
            token.ThrowIfCancellationRequested();
            ObjectDisposedException.ThrowIf(_document == IntPtr.Zero, this);
            IntPtr page = PdfNative.FPDF_LoadPage(_document, index);
            if (page == IntPtr.Zero) throw new InvalidDataException($"PDF 第 {index + 1} 页无法读取。");
            IntPtr bitmap = IntPtr.Zero;
            try
            {
                bitmap = PdfNative.FPDFBitmap_Create(width, height, 1);
                if (bitmap == IntPtr.Zero) throw new InvalidDataException("PDF 页面渲染内存不足，请降低缩放后重试。");
                PdfNative.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0xFFFFFFFF);
                PdfNative.FPDF_RenderPageBitmap(bitmap, page, -x, -y,
                    checked((int)Math.Ceiling(_pageWidth * _dpi.DpiScaleX)),
                    checked((int)Math.Ceiling((BlockStarts[index + 1] - BlockStarts[index]) * _dpi.DpiScaleY)), 0, 1);
                token.ThrowIfCancellationRequested();
                int stride = PdfNative.FPDFBitmap_GetStride(bitmap);
                var pixels = new byte[checked(stride * height)];
                Marshal.Copy(PdfNative.FPDFBitmap_GetBuffer(bitmap), pixels, 0, pixels.Length);
                // Opaque white page background makes BGRA and premultiplied BGRA equivalent.
                var image = BitmapSource.Create(width, height, _dpi.PixelsPerInchX, _dpi.PixelsPerInchY,
                    PixelFormats.Pbgra32, null, pixels, stride);
                image.Freeze();
                return image;
            }
            finally
            {
                if (bitmap != IntPtr.Zero) PdfNative.FPDFBitmap_Destroy(bitmap);
                PdfNative.FPDF_ClosePage(page);
            }
        }
    }

    public void Dispose()
    {
        lock (PdfNative.Sync)
        {
            if (_document != IntPtr.Zero) PdfNative.FPDF_CloseDocument(_document);
            _document = IntPtr.Zero;
            if (_data.IsAllocated) _data.Free();
        }
    }
}
