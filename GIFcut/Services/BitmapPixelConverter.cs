using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace GIFcut.Services;

internal static class BitmapPixelConverter
{
    public static BitmapSource ToBitmapSource(ImageFrame<Bgra32> frame)
    {
        var pixels = new byte[checked(frame.Width * frame.Height * 4)];
        frame.CopyPixelDataTo(pixels);
        var bitmap = BitmapSource.Create(frame.Width, frame.Height, 96, 96,
            PixelFormats.Bgra32, null, pixels, frame.Width * 4);
        bitmap.Freeze();
        return bitmap;
    }

    public static Image<Bgra32> ToCroppedImage(BitmapSource source, Int32Rect crop)
    {
        if (source.Format != PixelFormats.Bgra32)
        {
            source = new FormatConvertedBitmap(source, PixelFormats.Bgra32, null, 0);
            source.Freeze();
        }
        var stride = checked(crop.Width * 4);
        var pixels = new byte[checked(crop.Height * stride)];
        source.CopyPixels(crop, pixels, stride, 0);
        return Image.LoadPixelData<Bgra32>(pixels, crop.Width, crop.Height);
    }
}
