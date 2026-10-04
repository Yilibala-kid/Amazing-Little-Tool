using System.Windows;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Formats.Gif;
using SixLabors.ImageSharp.Processing;

namespace GIFcut.Services;

public sealed class GifExporterService
{
    public Task ExportGifAsync(
        IReadOnlyList<GifFrame> frames, int startFrame, int endFrame,
        Int32Rect cropRect, string outputPath, double speed = 1,
        int outputScalePercent = 100)
    {
        if (frames.Count == 0) throw new ArgumentException("没有可导出的帧", nameof(frames));
        if (!double.IsFinite(speed) || speed <= 0)
            throw new ArgumentOutOfRangeException(nameof(speed), "播放速度必须大于零");
        if (outputScalePercent <= 0)
            throw new ArgumentOutOfRangeException(nameof(outputScalePercent), "输出比例必须大于零");

        startFrame = Math.Clamp(startFrame, 0, frames.Count - 1);
        endFrame = Math.Clamp(endFrame, startFrame, frames.Count - 1);
        var bitmap = frames[0].Bitmap;
        var x = Math.Clamp(cropRect.X, 0, bitmap.PixelWidth - 1);
        var y = Math.Clamp(cropRect.Y, 0, bitmap.PixelHeight - 1);
        var width = Math.Min(cropRect.Width, bitmap.PixelWidth - x);
        var height = Math.Min(cropRect.Height, bitmap.PixelHeight - y);
        if (width <= 0 || height <= 0)
            throw new ArgumentException("裁剪区域必须包含像素", nameof(cropRect));
        var crop = new Int32Rect(x, y, width, height);
        var finalWidth = Math.Max(1, checked((int)Math.Round(width * outputScalePercent / 100.0)));
        var finalHeight = Math.Max(1, checked((int)Math.Round(height * outputScalePercent / 100.0)));

        return Task.Run(async () =>
        {
            Image<Bgra32>? output = null;
            try
            {
                for (var i = startFrame; i <= endFrame; i++)
                {
                    var frame = frames[i];
                    using var image = BitmapPixelConverter.ToCroppedImage(frame.Bitmap, crop);
                    if (outputScalePercent != 100)
                        image.Mutate(context => context.Resize(finalWidth, finalHeight));
                    var metadata = image.Frames[0].Metadata.GetGifMetadata();
                    metadata.FrameDelay = (int)Math.Clamp(frame.Delay / speed, 1, ushort.MaxValue);
                    metadata.DisposalMethod = GifDisposalMethod.RestoreToBackground;
                    if (output == null) output = image.Clone();
                    else output.Frames.AddFrame(image.Frames[0]);
                }
                output!.Metadata.GetGifMetadata().RepeatCount = 0;
                await output.SaveAsync(outputPath, new GifEncoder { ColorTableMode = GifColorTableMode.Local });
            }
            finally
            {
                output?.Dispose();
            }
        });
    }
}
