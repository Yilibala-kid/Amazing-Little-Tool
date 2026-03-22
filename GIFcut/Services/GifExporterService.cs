using System.Windows.Media.Imaging;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Formats.Gif;
using SixLabors.ImageSharp.Processing;

namespace GIFcut.Services;

public class GifExporterService
{
    public async Task<string> ExportGifAsync(
        List<GifFrame> frames,
        int startFrame,
        int endFrame,
        System.Windows.Int32Rect cropRect,
        string outputPath,
        double speed = 1.0)
    {
        try
        {
            System.Diagnostics.Debug.WriteLine($"Export: startFrame={startFrame}, endFrame={endFrame}, frames.Count={frames.Count}");
            System.Diagnostics.Debug.WriteLine($"Export: cropRect X={cropRect.X}, Y={cropRect.Y}, W={cropRect.Width}, H={cropRect.Height}");

            if (frames.Count == 0)
            {
                System.Diagnostics.Debug.WriteLine("Export failed: no frames");
                return "没有可导出的帧";
            }

            if (startFrame < 0) startFrame = 0;
            if (endFrame >= frames.Count) endFrame = frames.Count - 1;
            if (startFrame >= endFrame)
            {
                startFrame = 0;
                endFrame = frames.Count - 1;
            }

            // 确保裁剪区域有效
            int imageWidth = frames[0].Bitmap.PixelWidth;
            int imageHeight = frames[0].Bitmap.PixelHeight;
            System.Diagnostics.Debug.WriteLine($"Export: image size {imageWidth}x{imageHeight}");

            int cropX = Math.Max(0, cropRect.X);
            int cropY = Math.Max(0, cropRect.Y);
            int cropWidth = Math.Min(cropRect.Width, imageWidth - cropX);
            int cropHeight = Math.Min(cropRect.Height, imageHeight - cropY);

            System.Diagnostics.Debug.WriteLine($"Export: adjusted cropRect X={cropX}, Y={cropY}, W={cropWidth}, H={cropHeight}");

            if (cropWidth <= 0 || cropHeight <= 0)
            {
                cropX = 0;
                cropY = 0;
                cropWidth = imageWidth;
                cropHeight = imageHeight;
                System.Diagnostics.Debug.WriteLine("Export: using full image");
            }

            Image<Rgba32>? outputImage = null;

            for (int i = startFrame; i <= endFrame && i < frames.Count; i++)
            {
                var frame = frames[i];

                // 将BitmapSource转换为ImageSharp图像
                using var sourceImage = ConvertFromBitmapSource(frame.Bitmap);

                // 提取裁剪区域的像素并创建新图像
                using var croppedImage = ExtractCroppedImage(sourceImage, cropX, cropY, cropWidth, cropHeight);

                // 获取源帧
                var sourceFrame = croppedImage.Frames[0];

                if (i == startFrame)
                {
                    // 第一帧：直接克隆整个裁剪图像
                    outputImage = croppedImage.Clone();

                    // 设置第一帧的元数据
                    var firstFrameMetaData = outputImage.Frames[0].Metadata.GetGifMetadata();
                    firstFrameMetaData.FrameDelay = Math.Max(1, (int)(frame.Delay / speed));
                    firstFrameMetaData.DisposalMethod = GifDisposalMethod.RestoreToBackground;
                }
                else
                {
                    // 后续帧：创建新图像并复制像素
                    var newImage = new Image<Rgba32>(cropWidth, cropHeight);
                    var destFrame = newImage.Frames[0];

                    // 复制像素
                    for (int y = 0; y < cropHeight; y++)
                    {
                        for (int x = 0; x < cropWidth; x++)
                        {
                            destFrame[x, y] = sourceFrame[x, y];
                        }
                    }

                    // 设置元数据
                    var frameMetaData = destFrame.Metadata.GetGifMetadata();
                    frameMetaData.FrameDelay = Math.Max(1, (int)(frame.Delay / speed));
                    frameMetaData.DisposalMethod = GifDisposalMethod.RestoreToBackground;

                    // 添加到输出图像
                    outputImage!.Frames.AddFrame(destFrame);
                }
            }

            if (outputImage == null)
            {
                return "没有可导出的帧";
            }

            using var finalOutput = outputImage;
            var gifMetaData = finalOutput.Metadata.GetGifMetadata();
            gifMetaData.RepeatCount = 0; // 无限循环

            // 编码并保存
            var encoder = new GifEncoder
            {
                ColorTableMode = GifColorTableMode.Local
            };

            await finalOutput.SaveAsync(outputPath, encoder);

            return "success";
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Error exporting GIF: {ex.Message}");
            return $"导出失败: {ex.Message}";
        }
    }

    private Image<Rgba32> ExtractCroppedImage(Image<Rgba32> source, int cropX, int cropY, int cropWidth, int cropHeight)
    {
        // 使用 ImageSharp 的剪裁功能
        return source.Clone(x => x.Crop(new Rectangle(cropX, cropY, cropWidth, cropHeight)));
    }

    private Image<Rgba32> ConvertFromBitmapSource(BitmapSource bitmapSource)
    {
        // 确保是BGRA32格式
        FormatConvertedBitmap converted = new FormatConvertedBitmap();
        converted.BeginInit();
        converted.Source = bitmapSource;
        converted.DestinationFormat = System.Windows.Media.PixelFormats.Bgra32;
        converted.EndInit();
        converted.Freeze();

        int width = converted.PixelWidth;
        int height = converted.PixelHeight;
        int stride = width * 4;
        byte[] pixels = new byte[height * stride];

        converted.CopyPixels(pixels, stride, 0);

        // 交换 R 和 B 通道 (BGRA -> RGBA)
        for (int i = 0; i < pixels.Length; i += 4)
        {
            (pixels[i], pixels[i + 2]) = (pixels[i + 2], pixels[i]);
        }

        var image = Image.LoadPixelData<Rgba32>(pixels, width, height);
        return image;
    }
}
