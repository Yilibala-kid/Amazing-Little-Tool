using System.Diagnostics;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using LoopScroller.Models;
using LoopScroller.Rendering;

internal static class RenderingTests
{
    public static void RealDocument(string path)
    {
        var timer = Stopwatch.StartNew();
        Console.WriteLine("Parsing document");
        var document = new LoopScroller.Loaders.DocxContentLoader().Load(path, CancellationToken.None);
        Console.WriteLine($"Parsed {document.Blocks.Count} blocks in {timer.ElapsedMilliseconds} ms");
        ImageCache.Prepare(document, CancellationToken.None);
        foreach (double dpi in new[] { 1d, 1.25, 1.5, 1.75, 2d })
        foreach (double zoom in new[] { 1d, 3d })
        {
            Console.WriteLine($"Layout at DPI {dpi}, zoom {zoom}");
            using var renderer = RenderedDocument.CreateAsync(document, 1920 / dpi, zoom, new DpiScale(dpi, dpi)).GetAwaiter().GetResult();
            Console.WriteLine($"Layout height {renderer.CycleHeight:F2}, {renderer.ChunkCount} tiles, elapsed {timer.ElapsedMilliseconds} ms");
            Console.WriteLine("Enumerating full cycle");
            var indices = renderer.ChunksIn(0, renderer.CycleHeight).ToArray();
            Check(indices.Length == renderer.ChunkCount, "Full cycle must visit every tile exactly once");
            Console.WriteLine("Rendering initial tiles");
            renderer.WarmAsync(renderer.ChunksIn(0, 1080 / dpi + renderer.ChunkHeight * 2), CancellationToken.None).GetAwaiter().GetResult();
            using var surface = new LoopSurface();
            surface.SetDocument(renderer, 0);
            surface.Measure(new Size(1920 / dpi, 1080 / dpi));
            surface.Arrange(new Rect(0, 0, 1920 / dpi, 1080 / dpi));
            foreach (double offset in new[] { renderer.ChunkHeight * 7, renderer.CycleHeight - 50, renderer.CycleHeight + 100, -120d })
                surface.SetOffset(offset);
            Console.WriteLine($"PASS DPI {dpi}, elapsed {timer.ElapsedMilliseconds} ms");
        }
    }

    public static void ChunkEnumeration()
    {
        var document = new DisplayDocument("boundaries", DocumentKind.Text, [new DisplaySpacer(20000)]);
        foreach (double dpi in new[] { 1d, 1.25, 1.5, 1.75, 2d, 2.25, 2.5, 3d })
        {
            using var renderer = RenderedDocument.CreateAsync(document, 320, 1, new DpiScale(dpi, dpi)).GetAwaiter().GetResult();
            for (int i = 0; i < renderer.ChunkCount; i++)
            {
                double boundary = i * renderer.ChunkHeight;
                Check(renderer.ChunkAt(boundary) == i, $"Exact boundary {i} at DPI {dpi}");
                if (i > 0) Check(renderer.ChunkAt(boundary - 0.0001) == i - 1, "Boundary must not skip previous tile");
                var full = Task.Run(() => renderer.ChunksIn(boundary + 0.25, renderer.CycleHeight * 2).ToArray());
                Check(full.Wait(TimeSpan.FromSeconds(2)), $"Tile enumeration hung at DPI {dpi}, tile {i}");
                Check(full.Result.Length == renderer.ChunkCount && full.Result.Distinct().Count() == renderer.ChunkCount,
                    "Full cycle must terminate and visit each tile once even from a fractional start");
                Check(renderer.ChunksIn(boundary, 1).SequenceEqual(new[] { i }), "Small range must visit just its tile");
            }
            Check(!renderer.ChunksIn(0, 0).Any(), "Empty interval");
            Check(renderer.ChunksIn(renderer.CycleHeight - 0.5, 1).SequenceEqual(new[] { renderer.ChunkCount - 1, 0 }), "Wrapping interval");
        }
    }

    private static void Check(bool condition, string message)
    { if (!condition) throw new InvalidOperationException(message); }

    public static void RetainedFrames()
    {
        var document = new DisplayDocument("long", DocumentKind.Text,
            Enumerable.Range(0, 2000).Select(i => (DisplayBlock)new DisplayParagraph([new DisplayRun($"{i} 中文 performance")])).ToArray());
        using var surface = RegressionTests.CreateSurface(document, 1920);
        surface.Measure(new Size(1920, 1080)); surface.Arrange(new Rect(0, 0, 1920, 1080));
        surface.SetOffset(0);
        var renderer = surface.Document!;
        Check(renderer.WorkerThreadId != Environment.CurrentManagedThreadId, "Layout must run on an independent STA thread");
        Check(renderer.GetChunk(0).IsFrozen, "Images must be safe to transfer between threads");
        int builds = surface.StripBuildCount, tiles = renderer.RenderCount;
        var timer = Stopwatch.StartNew();
        for (int i = 1; i <= 120; i++) surface.SetOffset(i * 0.5);
        timer.Stop();
        Check(surface.StripBuildCount == builds && renderer.RenderCount == tiles,
            "Ordinary frames must only translate retained images, without drawing or generating tiles");
        Console.WriteLine($"      120 transform-only updates: {timer.Elapsed.TotalMilliseconds:F3} ms; no tile rebuilds");
        surface.SetOffset(260);
        Check(surface.StripBuildCount == builds + 1, "Crossing a tile boundary refreshes the retained strip once");
        surface.Clear();
        Check(renderer.CacheBytes == 0 && surface.CycleHeight == 0, "Clear releases image cache");
        CheckThrows<ObjectDisposedException>(() => renderer.GetChunk(0));
    }

    public static void DpiAndChunkSeams()
    {
        var doc = new DisplayDocument("red", DocumentKind.Image, [new DisplayImage(RegressionTests.Png(320, 1000))]);
        foreach (double dpi in new[] { 1d, 1.25, 1.5, 2 })
        foreach (double zoom in new[] { 1d, 3d })
        {
            using var surface = RegressionTests.CreateSurface(doc, 320, zoom, dpi);
            surface.Measure(new Size(320, 400)); surface.Arrange(new Rect(0, 0, 320, 400));
            foreach (double offset in new[] { 0, 255 / dpi, 256 / dpi + 0.25, surface.CycleHeight - 50, -8.25 })
            {
                surface.SetOffset(offset);
                int width = (int)(320 * dpi), height = (int)(400 * dpi);
                var bitmap = new RenderTargetBitmap(width, height, 96 * dpi, 96 * dpi, PixelFormats.Pbgra32);
                bitmap.Render(surface);
                var pixels = new byte[width * height * 4]; bitmap.CopyPixels(pixels, width * 4, 0);
                for (int y = 0; y < height; y++)
                foreach (int x in new[] { 1, width / 2, width - 2 })
                {
                    int p = (y * width + x) * 4;
                    Check(pixels[p + 3] == 255, $"Transparent seam at dpi={dpi}, zoom={zoom}, offset={offset}, y={y}");
                    double phase = (surface.Offset + (y + 0.5) / dpi) % surface.CycleHeight;
                    if (phase > 2 && phase < surface.CycleHeight - 5)
                        Check(pixels[p + 2] > 250 && pixels[p] < 5,
                            $"Unexpected gap/color at dpi={dpi}, zoom={zoom}, offset={offset}, y={y}");
                }
            }
        }
    }

    public static void CacheBudgetAndCancellation()
    {
        var doc = new DisplayDocument("cache", DocumentKind.Text, [new DisplaySpacer(60000)]);
        using var renderer = RenderedDocument.CreateAsync(doc, 1024, 1, new DpiScale(1, 1)).GetAwaiter().GetResult();
        var protectedTiles = new HashSet<int> { 0, 1 };
        var pinned = renderer.GetChunk(0);
        renderer.GetChunk(1);
        for (int i = 2; i < 120; i++)
        {
            renderer.GetChunk(i);
            renderer.Trim(protectedTiles);
            Check(renderer.CacheBytes <= RenderedDocument.CacheBudget, "LRU cache must stay within budget");
        }
        Check(ReferenceEquals(pinned, renderer.GetChunk(0)), "Visible tiles must not be evicted");
        int before = renderer.RenderCount;
        renderer.GetChunk(2);
        Check(renderer.RenderCount == before + 1, "Evicted tiles must be regenerated on demand");
        using var canceled = new CancellationTokenSource(); canceled.Cancel();
        CheckThrows<OperationCanceledException>(() => renderer.WarmAsync([150], canceled.Token).GetAwaiter().GetResult());
        CheckThrows<OperationCanceledException>(() => RenderedDocument.CreateAsync(doc, 1000, 1,
            new DpiScale(1, 1), canceled.Token).GetAwaiter().GetResult());
    }

    private static void CheckThrows<T>(Action action) where T : Exception
    {
        try { action(); } catch (T) { return; }
        throw new InvalidOperationException($"Expected {typeof(T).Name}");
    }
}
