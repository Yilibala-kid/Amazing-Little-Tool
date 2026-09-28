using System.Runtime.CompilerServices;
using System.Windows.Media.Imaging;
using LoopScroller.Models;

namespace LoopScroller.Rendering;

public static class ImageCache
{
    private static readonly ConditionalWeakTable<byte[], Lazy<BitmapSource>> Cache = new();
    public static BitmapSource Get(byte[] data) => Cache.GetValue(data,
        bytes => new Lazy<BitmapSource>(() => Decode(bytes))).Value;

    private static BitmapSource Decode(byte[] data)
    {
        using var stream = new MemoryStream(data, false);
        var decoder = BitmapDecoder.Create(stream, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnDemand);
        var frame = decoder.Frames[0];
        if ((long)frame.PixelWidth * frame.PixelHeight > 40_000_000)
            throw new InvalidDataException("图片分辨率超过 4000 万像素，请先缩小后再打开。");
        var converted = new FormatConvertedBitmap(frame, System.Windows.Media.PixelFormats.Pbgra32, null, 0);
        int stride = checked(converted.PixelWidth * 4);
        var pixels = new byte[checked(stride * converted.PixelHeight)];
        converted.CopyPixels(pixels, stride, 0);
        var bitmap = BitmapSource.Create(converted.PixelWidth, converted.PixelHeight, 96, 96,
            System.Windows.Media.PixelFormats.Pbgra32, null, pixels, stride);
        bitmap.Freeze();
        return bitmap;
    }

    public static void Prepare(DisplayDocument document, CancellationToken token)
    {
        long pixels = 0;
        var seen = new HashSet<byte[]>(ReferenceEqualityComparer.Instance);
        int count = 0;
        void Visit(IEnumerable<DisplayBlock> blocks)
        {
            foreach (var block in blocks)
            {
                token.ThrowIfCancellationRequested();
                if (++count > 20000) throw new InvalidDataException("内容过长（超过 20000 个内容块），请拆分后播放。");
                switch (block)
                {
                    case DisplayImage image: PrepareImage(image); break;
                    case DisplayParagraph paragraph:
                        foreach (var run in paragraph.Runs)
                            if (run.Image is { } inlineImage) PrepareImage(inlineImage);
                        break;
                    case DisplayTable table:
                        foreach (var cell in table.Cells.SelectMany(row => row)) Visit(cell.Blocks);
                        break;
                }
            }
        }
        void PrepareImage(DisplayImage image)
        {
            token.ThrowIfCancellationRequested();
            if (!seen.Add(image.Data)) return;
            var bitmap = Get(image.Data);
            pixels += (long)bitmap.PixelWidth * bitmap.PixelHeight;
            if (pixels > 80_000_000) throw new InvalidDataException("文档内图片总像素过多，请拆分文档后播放。");
        }
        Visit(document.Blocks);
    }
}
