using System.Windows.Media;
using System.Windows.Media.Imaging;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace GIFcut.Services;

public class GifFrame
{
    public BitmapSource Bitmap { get; set; } = null!;
    public int Delay { get; set; } // 延迟时间（百分之一秒）
}

public class GifReaderService
{
    public List<GifFrame> Frames { get; private set; } = new();
    public int Width { get; private set; }
    public int Height { get; private set; }

    public async Task<bool> LoadGifAsync(string path)
    {
        try
        {
            Frames.Clear();

            using var image = await Image.LoadAsync<Rgba32>(path);
            Width = image.Width;
            Height = image.Height;

            var frameCount = image.Frames.Count;

            for (int i = 0; i < frameCount; i++)
            {
                // 获取当前帧
                var frame = image.Frames[i];
                var frameMetaData = frame.Metadata.GetGifMetadata();

                // 获取帧延迟（默认100ms）
                int delay = frameMetaData.FrameDelay > 0 ? frameMetaData.FrameDelay : 10;

                // 将ImageSharp图像转换为WPF BitmapSource
                var bitmap = ConvertFrameToBitmapSource(frame, image.Width, image.Height);

                Frames.Add(new GifFrame
                {
                    Bitmap = bitmap,
                    Delay = delay
                });
            }

            return true;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error loading GIF: {ex.Message}");
            return false;
        }
    }

    private BitmapSource ConvertFrameToBitmapSource(ImageFrame<Rgba32> frame, int width, int height)
    {
        // 将帧像素数据转换为字节数组
        var pixels = new byte[width * height * 4];

        // 复制像素数据
        frame.CopyPixelDataTo(pixels);

        // 交换 R 和 B 通道 (RGBA -> BGRA)
        for (int i = 0; i < pixels.Length; i += 4)
        {
            (pixels[i], pixels[i + 2]) = (pixels[i + 2], pixels[i]);
        }

        // 创建BitmapSource
        var bitmapSource = BitmapSource.Create(
            width,
            height,
            96, 96,
            PixelFormats.Bgra32,
            null,
            pixels,
            width * 4);

        bitmapSource.Freeze();
        return bitmapSource;
    }
}
