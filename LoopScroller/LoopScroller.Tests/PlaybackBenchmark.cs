using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using LoopScroller.Models;
using LoopScroller.Rendering;

internal static class PlaybackBenchmark
{
    public static void Run()
    {
        const int width = 1920, height = 1080, frames = 360;
        var document = new DisplayDocument("benchmark", DocumentKind.Text,
            Enumerable.Range(0, 2000).Select(i => (DisplayBlock)new DisplayParagraph(
                [new DisplayRun($"第 {i} 段：循环滚动阅读测试。Performance and smooth scrolling at 1080p. ")])).ToArray());
        var legacy = new LegacySurface(DocumentVisualBuilder.Build(document, width, 1), width);
        using var cached = RegressionTests.CreateSurface(document, width);
        foreach (var surface in new FrameworkElement[] { legacy, cached })
        { surface.Measure(new Size(width, height)); surface.Arrange(new Rect(0, 0, width, height)); }
        cached.Document!.WarmAsync(cached.Document.ChunksIn(0, 4000), CancellationToken.None).GetAwaiter().GetResult();
        var target = new RenderTargetBitmap(width, height, 96, 96, PixelFormats.Pbgra32);
        double[] Measure(FrameworkElement surface, Action<double> move)
        {
            var result = new double[frames];
            for (int i = -10; i < frames; i++)
            {
                var timer = Stopwatch.StartNew();
                move(Math.Max(0, i)); surface.UpdateLayout(); target.Clear(); target.Render(surface);
                if (i >= 0) result[i] = timer.Elapsed.TotalMilliseconds;
            }
            Array.Sort(result);
            return result;
        }
        object Summary(double[] samples) => new { MedianMs = samples[frames / 2], P95Ms = samples[(int)(frames * .95)], P99Ms = samples[(int)(frames * .99)] };
        var oldTimes = Measure(legacy, legacy.Move);
        var newTimes = Measure(cached, cached.SetOffset);
        Console.WriteLine($"OFFSCREEN old={JsonSerializer.Serialize(Summary(oldTimes))}");
        Console.WriteLine($"OFFSCREEN new={JsonSerializer.Serialize(Summary(newTimes))}");

        // Ten minutes of logical 60 Hz playback at the maximum 150 DIP/s, run
        // faster than real time. This validates cache turnover, not monitor FPS.
        var soak = Stopwatch.StartNew();
        for (int i = 0; i < 36000; i++)
        {
            cached.SetOffset(i * 2.5);
            if (i % 600 == 0) { target.Clear(); target.Render(cached); }
            if (cached.Document.CacheBytes > RenderedDocument.CacheBudget)
                throw new InvalidOperationException("Playback cache exceeded budget");
        }
        var result = new
        {
            Kind = "Offscreen CPU rendering; not actual display FPS", Width = width, Height = height, Frames = frames,
            Old = Summary(oldTimes), New = Summary(newTimes),
            SimulatedPlaybackSeconds = 600, SoakWallSeconds = soak.Elapsed.TotalSeconds,
            CacheMiB = cached.Document.CacheBytes / 1048576d, cached.Document.RenderCount, cached.StripBuildCount
        };
        var directory = Path.Combine(AppContext.BaseDirectory, "qa"); Directory.CreateDirectory(directory);
        File.WriteAllText(Path.Combine(directory, "playback-benchmark.json"), JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true }));
        var png = new PngBitmapEncoder(); png.Frames.Add(BitmapFrame.Create(target));
        using var file = File.Create(Path.Combine(directory, "cached-playback-preview.png")); png.Save(file);
        Console.WriteLine(JsonSerializer.Serialize(result));
    }

    // The previous implementation is kept here only as a repeatable benchmark reference.
    private sealed class LegacySurface : FrameworkElement
    {
        private readonly DrawingBrush _brush;
        public LegacySurface(FrameworkElement content, double width)
        {
            content.Measure(new Size(width, double.PositiveInfinity));
            double height = content.DesiredSize.Height;
            content.Arrange(new Rect(0, 0, width, height)); content.UpdateLayout();
            var source = new VisualBrush(content) { AutoLayoutContent = false, Stretch = Stretch.Fill,
                ViewboxUnits = BrushMappingMode.Absolute, Viewbox = new Rect(0, 0, width, height) };
            var drawing = new DrawingGroup();
            using (var dc = drawing.Open())
            {
                dc.DrawRectangle(source, null, new Rect(0, 0, width, height));
                dc.DrawRectangle(Brushes.RoyalBlue, null, new Rect(0, height, width, 3));
            }
            _brush = new DrawingBrush(drawing) { TileMode = TileMode.Tile, Stretch = Stretch.Fill,
                ViewboxUnits = BrushMappingMode.Absolute, ViewportUnits = BrushMappingMode.Absolute,
                Viewbox = new Rect(0, 0, width, height + 3) };
        }
        public void Move(double offset)
        {
            _brush.Viewport = new Rect(0, -offset, _brush.Viewbox.Width, _brush.Viewbox.Height);
            InvalidateVisual();
        }
        protected override void OnRender(DrawingContext dc) => dc.DrawRectangle(_brush, null, new Rect(RenderSize));
    }
}
