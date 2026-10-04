using System.Windows.Media.Imaging;

namespace GIFcut.Services;

public sealed record GifFrame(BitmapSource Bitmap, int Delay);

public sealed record GifDocument(IReadOnlyList<GifFrame> Frames, int Width, int Height);
