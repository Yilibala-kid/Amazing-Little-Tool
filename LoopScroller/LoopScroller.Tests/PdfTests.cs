using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using LoopScroller.Loaders;
using LoopScroller.Models;
using LoopScroller.Rendering;

internal static class PdfTests
{
    // Vector text/shapes, an embedded raster image, mixed page sizes and rotation.
    // Generated locally so tests do not need a PDF application or external files.
    internal static byte[] Fixture(int copies = 1)
    {
        var objects = new List<string> { "<< /Type /Catalog /Pages 2 0 R >>", "" };
        var kids = new List<int>();
        for (int i = 0; i < copies; i++)
        {
            AddPage(240, 360, 0, "1 0 0 rg 0 0 240 360 re f 0 1 0 rg 0 180 240 180 re f\n0 0 0 rg BT /F1 14 Tf 12 330 Td (PDF playback test) Tj ET", false);
            AddPage(400, 200, 0, "q 400 0 0 200 0 0 cm /Im0 Do Q", true);
            AddPage(200, 100, 90, "1 1 0 rg 0 0 200 100 re f", false);
        }
        objects[1] = $"<< /Type /Pages /Kids [{string.Join(' ', kids.Select(id => $"{id} 0 R"))}] /Count {kids.Count} >>";
        var pdf = new StringBuilder("%PDF-1.4\n");
        var offsets = new List<int> { 0 };
        for (int i = 0; i < objects.Count; i++)
        {
            offsets.Add(pdf.Length);
            pdf.Append($"{i + 1} 0 obj\n{objects[i]}\nendobj\n");
        }
        int xref = pdf.Length;
        pdf.Append($"xref\n0 {objects.Count + 1}\n0000000000 65535 f \n");
        foreach (int offset in offsets.Skip(1)) pdf.Append($"{offset:D10} 00000 n \n");
        pdf.Append($"trailer\n<< /Size {objects.Count + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n");
        return Encoding.ASCII.GetBytes(pdf.ToString());

        void AddPage(int width, int height, int rotation, string content, bool image)
        {
            int id = objects.Count + 1;
            kids.Add(id);
            string resources = image
                ? $"/XObject << /Im0 {id + 2} 0 R >>"
                : "/Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >>";
            objects.Add($"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {width} {height}] /Rotate {rotation} /Resources << {resources} >> /Contents {id + 1} 0 R >>");
            objects.Add($"<< /Length {content.Length} >>\nstream\n{content}\nendstream");
            if (image) objects.Add("<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length 7 >>\nstream\n0000FF>\nendstream");
        }
    }

    public static void RenderAndLoop()
    {
        var document = new DisplayDocument("mixed.pdf", DocumentKind.Pdf, [new DisplayPdf(Fixture())]);
        foreach (double dpi in new[] { 1d, 1.5, 2d })
        foreach (double zoom in new[] { 0.5, 1d, 3d })
        {
            using var surface = RegressionTests.CreateSurface(document, 320, zoom, dpi);
            surface.Measure(new Size(320, 400));
            surface.Arrange(new Rect(0, 0, 320, 400));
            var renderer = surface.Document!;
            Check(Math.Abs(renderer.CycleHeight - (1280 * zoom + 3)) < 0.01, "PDF page size/rotation layout");
            foreach (double offset in new[] { 0d, 255 / dpi, 256 / dpi + 0.25, 480 * zoom - 20, 640 * zoom - 20, renderer.CycleHeight - 30, -8.25 })
            {
                surface.SetOffset(offset);
                int width = (int)(320 * dpi), height = (int)(400 * dpi);
                var bitmap = new RenderTargetBitmap(width, height, 96 * dpi, 96 * dpi, PixelFormats.Pbgra32);
                bitmap.Render(surface);
                var pixels = new byte[width * height * 4];
                bitmap.CopyPixels(pixels, width * 4, 0);
                for (int y = 0; y < height; y++)
                {
                    double phase = (surface.Offset + (y + 0.5) / dpi) % surface.CycleHeight;
                    // Skip antialiased boundaries and the fixture's heading.
                    if (new[] { 0d, 240 * zoom, 480 * zoom, 640 * zoom, 1280 * zoom, renderer.CycleHeight }.Any(edge => Math.Abs(phase - edge) < 2)
                        || phase < 65 * zoom) continue;
                    Color expected = phase < 240 * zoom ? Colors.Lime : phase < 480 * zoom ? Colors.Red
                        : phase < 640 * zoom ? Colors.Blue : phase < 1280 * zoom ? Colors.Yellow : Colors.RoyalBlue;
                    int p = (y * width + width / 2) * 4;
                    Check(pixels[p + 3] == 255 && Math.Abs(pixels[p] - expected.B) < 8 && Math.Abs(pixels[p + 1] - expected.G) < 8 && Math.Abs(pixels[p + 2] - expected.R) < 8,
                        $"PDF pixel/loop seam dpi={dpi}, zoom={zoom}, offset={offset}, y={y}, phase={phase:F2}: expected {expected}, actual RGB={pixels[p + 2]},{pixels[p + 1]},{pixels[p]}");
                }
                if (dpi == 1 && zoom == 1 && offset == 0) SavePreview(bitmap);
            }
            surface.SetOffset(20);
            int renders = renderer.RenderCount;
            for (int i = 0; i < 20; i++) surface.SetOffset(20 + i * 0.2);
            Check(renderer.RenderCount == renders, "PDF ordinary frames must reuse rendered tiles");
            var anchor = renderer.CaptureAnchor(560 * zoom);
            Check(anchor.Index == 1 && Math.Abs(anchor.Fraction - 0.5) < 0.001, "PDF page-relative anchor");
            using var resized = RenderedDocument.CreateAsync(document, 640, zoom, new DpiScale(dpi, dpi)).GetAwaiter().GetResult();
            Check(Math.Abs(resized.RestoreAnchor(anchor) - 1120 * zoom) < 0.01, "PDF preserves page and fraction when resized");
        }
    }

    public static void ErrorsAndCache()
    {
        var path = Path.Combine(Path.GetTempPath(), $"loop-pdf-{Guid.NewGuid():N}.pdf");
        try
        {
            File.WriteAllBytes(path, Fixture(30));
            var document = new PdfContentLoader().Load(path, CancellationToken.None);
            File.Delete(path); // Playback uses the snapshot, not a locked/reopened file.
            using var renderer = RenderedDocument.CreateAsync(document, 1024, 1, new DpiScale(1, 1)).GetAwaiter().GetResult();
            Check(renderer.RenderCount == 0 && renderer.CacheBytes == 0, "Opening a long PDF must not rasterize all pages");
            var pinned = renderer.GetChunk(0);
            for (int i = 1; i < 110; i++)
            {
                renderer.GetChunk(i);
                renderer.Trim(new HashSet<int> { 0 });
                Check(renderer.CacheBytes <= RenderedDocument.CacheBudget, "PDF shares bounded tile cache");
            }
            Check(ReferenceEquals(pinned, renderer.GetChunk(0)), "Visible PDF tile survives eviction");
            using var canceled = new CancellationTokenSource();
            canceled.Cancel();
            Throws<OperationCanceledException>(() => renderer.WarmAsync([120], canceled.Token).GetAwaiter().GetResult());
            Throws<OperationCanceledException>(() => RenderedDocument.CreateAsync(document, 320, 1, new DpiScale(1, 1), canceled.Token).GetAwaiter().GetResult());
            var bad = new DisplayDocument("bad.pdf", DocumentKind.Pdf, [new DisplayPdf(Encoding.ASCII.GetBytes("not a PDF"))]);
            Throws<InvalidDataException>(() => RenderedDocument.CreateAsync(bad, 320, 1, new DpiScale(1, 1)).GetAwaiter().GetResult());
            File.WriteAllBytes(path, []);
            Throws<InvalidDataException>(() => new PdfContentLoader().Load(path, CancellationToken.None));
            renderer.Dispose();
            Check(renderer.CacheBytes == 0, "Closing PDF releases cached bitmaps");
            Throws<ObjectDisposedException>(() => renderer.GetChunk(0));
        }
        finally { File.Delete(path); }
    }

    private static void SavePreview(BitmapSource bitmap)
    {
        var directory = Path.Combine(AppContext.BaseDirectory, "qa");
        Directory.CreateDirectory(directory);
        File.WriteAllBytes(Path.Combine(directory, "pdf-playback-test.pdf"), Fixture());
        var encoder = new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(bitmap));
        using var stream = File.Create(Path.Combine(directory, "pdf-preview.png")); encoder.Save(stream);
    }

    private static void Check(bool condition, string message)
    { if (!condition) throw new InvalidOperationException(message); }
    private static void Throws<T>(Action action) where T : Exception
    {
        try { action(); } catch (T) { return; }
        throw new InvalidOperationException($"Expected {typeof(T).Name}");
    }
}
