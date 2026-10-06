using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace GIFcut.Services;

public sealed class GifReaderService
{
    // Frozen bitmaps can cross threads; decoding never mutates a live preview.
    public Task<GifDocument> LoadGifAsync(string path) => Task.Run(async () =>
    {
        using var image = await Image.LoadAsync<Bgra32>(path);
        var frames = new List<GifFrame>(image.Frames.Count);
        foreach (var frame in image.Frames)
        {
            var delay = frame.Metadata.GetGifMetadata().FrameDelay;
            frames.Add(new GifFrame(BitmapPixelConverter.ToBitmapSource(frame), delay > 0 ? delay : 10));
        }
        return new GifDocument(frames.AsReadOnly(), image.Width, image.Height);
    });
}
