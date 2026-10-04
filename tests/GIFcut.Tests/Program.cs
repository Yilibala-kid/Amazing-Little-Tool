using System.IO;
using System.Windows;
using GIFcut.Services;
using GIFcut.ViewModels;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Formats.Gif;

internal static class Program
{
    private static void Check(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }

    [STAThread]
    private static void Main()
    {
        var directory = Path.Combine(Path.GetTempPath(), "gifcut-tests-" + Guid.NewGuid());
        Directory.CreateDirectory(directory);
        try
        {
            var input = Path.Combine(directory, "input.gif");
            using (var image = new Image<Rgba32>(4, 3, new Rgba32(255, 0, 0)))
            using (var blue = new Image<Rgba32>(4, 3, new Rgba32(0, 0, 255)))
            {
                image.Frames[0].Metadata.GetGifMetadata().FrameDelay = 12;
                blue.Frames[0].Metadata.GetGifMetadata().FrameDelay = 20;
                image.Frames.AddFrame(blue.Frames[0]);
                image.SaveAsGif(input);
            }

            var reader = new GifReaderService();
            var document = reader.LoadGifAsync(input).GetAwaiter().GetResult();
            Check(document.Frames.Count == 2 && document.Width == 4 && document.Height == 3, "Read dimensions/frames");
            Check(document.Frames.All(frame => frame.Bitmap.IsFrozen), "Preview pixels must be safe across threads");
            try { reader.LoadGifAsync(Path.Combine(directory, "missing.gif")).GetAwaiter().GetResult(); }
            catch (FileNotFoundException) {}
            Check(document.Frames.Count == 2, "Failed load must leave an existing document untouched");

            var exporter = new GifExporterService();
            var output = Path.Combine(directory, "single.gif");
            exporter.ExportGifAsync(document.Frames, 1, 1, new Int32Rect(1, 1, 2, 2), output, 2, 50)
                .GetAwaiter().GetResult();
            using (var image = Image.Load<Rgba32>(output))
            {
                Check(image.Frames.Count == 1, "Single-frame selection must not export the entire animation");
                Check(image.Width == 1 && image.Height == 1, "Crop and scale dimensions");
                Check(image[0, 0].B > 240 && image[0, 0].R < 15, "BGRA/RGBA channels must retain blue");
                Check(image.Frames[0].Metadata.GetGifMetadata().FrameDelay == 10, "Speed-adjusted delay");
            }
            exporter.ExportGifAsync(document.Frames, 0, 1, new Int32Rect(0, 0, 4, 3), output)
                .GetAwaiter().GetResult();
            using (var image = Image.Load<Rgba32>(output))
            {
                Check(image.Frames.Count == 2, "Full export must retain both frames");
                Check(image.Frames[0][0, 0].R > 240 && image.Frames[1][0, 0].B > 240, "Frame colors/order");
                Check(image.Frames[0].Metadata.GetGifMetadata().FrameDelay == 12, "Original delay");
            }
            exporter.ExportGifAsync(document.Frames, 0, 0, new Int32Rect(0, 0, 1, 1), output, 1, 1)
                .GetAwaiter().GetResult();
            using (var image = Image.Load<Rgba32>(output))
                Check(image.Width == 1 && image.Height == 1, "Small scales must keep at least one pixel");
            try
            {
                exporter.ExportGifAsync(document.Frames, 0, 1, new Int32Rect(0, 0, 4, 3), output, 0);
                throw new InvalidOperationException("Invalid speed was accepted");
            }
            catch (ArgumentOutOfRangeException) {}

            var viewModel = new MainViewModel();
            viewModel.Speed = 0;
            Check(viewModel.Speed == 1, "Invalid playback speed must recover");
            viewModel.Cleanup();
            Console.WriteLine("GIFcut regression checks passed: decoding, thread safety, failed load, frame selection, crop/scale, colors, delays, validation.");
        }
        finally
        {
            Directory.Delete(directory, true);
        }
    }
}
