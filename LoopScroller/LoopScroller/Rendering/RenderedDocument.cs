using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using LoopScroller.Models;
using LoopScroller.Scrolling;

namespace LoopScroller.Rendering;

// The WPF tree belongs to one STA worker. Only frozen images and numeric layout
// metadata cross threads. Cache access belongs to the caller (the UI thread).
internal sealed class RenderedDocument : IDisposable
{
    public const long CacheBudget = 96L * 1024 * 1024;
    private readonly Dispatcher _worker;
    private readonly IRenderSource _source;
    private static readonly Brush Background = (Brush)new SolidColorBrush(Color.FromRgb(5, 7, 12)).GetAsFrozen();
    private readonly CancellationTokenSource _lifetime = new();
    private readonly CancellationToken _lifetimeToken;
    private readonly Dictionary<int, (BitmapSource Image, long Used)> _cache = new();
    private readonly double[] _blockStarts;
    private long _clock;
    private volatile bool _disposed;
    public double Width { get; }
    public double CycleHeight { get; }
    public DpiScale Dpi { get; }
    public double ChunkHeight { get; }
    public int ChunkCount => (int)Math.Ceiling(CycleHeight / ChunkHeight);
    public long CacheBytes { get; private set; }
    public int RenderCount { get; private set; }
    public int WorkerThreadId { get; }

    private RenderedDocument(IRenderSource source, double width, DpiScale dpi)
    {
        _worker = Dispatcher.CurrentDispatcher;
        _lifetimeToken = _lifetime.Token;
        WorkerThreadId = Environment.CurrentManagedThreadId;
        Width = width;
        Dpi = dpi;
        ChunkHeight = 256 / dpi.DpiScaleY;
        _source = source;
        CycleHeight = source.Height + LoopSurface.SeparatorHeight;
        _blockStarts = source.BlockStarts;
    }

    public static Task<RenderedDocument> CreateAsync(DisplayDocument document, double width, double zoom,
        DpiScale dpi, CancellationToken token = default)
    {
        var completion = new TaskCompletionSource<RenderedDocument>(TaskCreationOptions.RunContinuationsAsynchronously);
        var thread = new Thread(() =>
        {
            var dispatcher = Dispatcher.CurrentDispatcher;
            IRenderSource? source = null;
            try
            {
                token.ThrowIfCancellationRequested();
                source = document.Kind == DocumentKind.Pdf
                    ? new PdfRenderSource(document.Blocks.OfType<DisplayPdf>().Single().Data, width, zoom, dpi, token)
                    : new WpfRenderSource(DocumentVisualBuilder.Build(document, width, zoom, token), width);
                token.ThrowIfCancellationRequested();
                var result = new RenderedDocument(source, width, dpi);
                completion.SetResult(result);
                Dispatcher.Run();
            }
            catch (OperationCanceledException) { completion.TrySetCanceled(token); }
            catch (Exception ex) { completion.TrySetException(ex); }
            finally
            {
                source?.Dispose();
                if (!dispatcher.HasShutdownFinished) dispatcher.InvokeShutdown();
            }
        }) { IsBackground = true, Name = "LoopScroller image renderer", Priority = ThreadPriority.BelowNormal };
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        return completion.Task;
    }

    public (int Index, double Fraction) CaptureAnchor(double offset)
    {
        offset = LoopMath.Normalize(offset, CycleHeight);
        int index = Array.BinarySearch(_blockStarts, offset);
        if (index < 0) index = ~index - 1;
        index = Math.Clamp(index, 0, _blockStarts.Length - 1);
        double end = index + 1 < _blockStarts.Length ? _blockStarts[index + 1] : CycleHeight;
        return (index, (offset - _blockStarts[index]) / Math.Max(0.001, end - _blockStarts[index]));
    }

    public double RestoreAnchor((int Index, double Fraction) anchor)
    {
        int index = Math.Clamp(anchor.Index, 0, _blockStarts.Length - 1);
        double end = index + 1 < _blockStarts.Length ? _blockStarts[index + 1] : CycleHeight;
        return _blockStarts[index] + anchor.Fraction * (end - _blockStarts[index]);
    }

    public int ChunkAt(double offset)
    {
        double position = LoopMath.Normalize(offset, CycleHeight);
        int index = Math.Min(ChunkCount - 1, (int)(position / ChunkHeight));
        // Division can round an exact boundary down (e.g. tile 7 at 150% DPI).
        // Compare against the same boundaries used to position the actual tiles.
        if (index + 1 < ChunkCount && position >= (index + 1) * ChunkHeight) index++;
        else if (index > 0 && position < index * ChunkHeight) index--;
        return index;
    }
    public double HeightOf(int index) => Math.Min(ChunkHeight, CycleHeight - index * ChunkHeight);

    public IEnumerable<int> ChunksIn(double start, double length)
    {
        double position = LoopMath.Normalize(start, CycleHeight);
        double remaining = Math.Min(length, CycleHeight);
        int index = ChunkAt(position);
        double available = index * ChunkHeight + HeightOf(index) - position;
        // Walk integer indices, never recover the next index from floating-point
        // coordinates. One cycle needs at most ChunkCount distinct cache entries.
        for (int visited = 0; visited < ChunkCount && remaining > 0.00001; visited++)
        {
            yield return index;
            remaining -= available;
            index = (index + 1) % ChunkCount;
            available = HeightOf(index);
        }
    }

    private BitmapSource RenderChunk(int index, CancellationToken token)
    {
        if (_disposed) throw new OperationCanceledException();
        double top = index * ChunkHeight - 1 / Dpi.DpiScaleY;
        int pixelWidth = checked((int)Math.Ceiling(Width * Dpi.DpiScaleX));
        int pixelHeight = checked((int)Math.Ceiling(HeightOf(index) * Dpi.DpiScaleY) + 2);
        var visual = new DrawingVisual();
        using (var dc = visual.RenderOpen())
        {
            dc.PushTransform(new TranslateTransform(0, -top));
            var region = new Rect(0, top, pixelWidth / Dpi.DpiScaleX, pixelHeight / Dpi.DpiScaleY);
            dc.DrawRectangle(Background, null, region);
            // Include neighboring cycles for overlap pixels and short documents.
            for (double cycle = Math.Floor(top / CycleHeight) * CycleHeight; cycle < region.Bottom; cycle += CycleHeight)
            {
                token.ThrowIfCancellationRequested();
                dc.PushTransform(new TranslateTransform(0, cycle));
                _source.Draw(dc, new Rect(0, top - cycle, region.Width, region.Height), token);
                dc.DrawRectangle(Brushes.RoyalBlue, null, new Rect(0, _source.Height, Width, LoopSurface.SeparatorHeight));
                dc.Pop();
            }
            dc.Pop();
        }
        var bitmap = new RenderTargetBitmap(pixelWidth, pixelHeight, Dpi.PixelsPerInchX, Dpi.PixelsPerInchY, PixelFormats.Pbgra32);
        bitmap.Render(visual);
        bitmap.Freeze();
        return bitmap;
    }

    public BitmapSource GetChunk(int index)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (_cache.TryGetValue(index, out var cached))
        {
            _cache[index] = (cached.Image, ++_clock);
            return cached.Image;
        }
        // Large seeks may briefly wait for a missing tile. Normal playback prefetches;
        // never replace a missing tile with a blank or a low-resolution image.
        return Store(index, _worker.Invoke(() => RenderChunk(index, _lifetimeToken)));
    }

    private BitmapSource Store(int index, BitmapSource image)
    {
        if (!_cache.ContainsKey(index))
        {
            CacheBytes += (long)image.PixelWidth * image.PixelHeight * 4;
            RenderCount++;
        }
        _cache[index] = (image, ++_clock);
        return image;
    }

    public async Task WarmAsync(IEnumerable<int> indices, CancellationToken token)
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(token, _lifetimeToken);
        token = linked.Token;
        foreach (int index in indices)
        {
            token.ThrowIfCancellationRequested();
            if (_disposed) throw new OperationCanceledException();
            if (_cache.ContainsKey(index)) continue;
            var bitmap = await _worker.InvokeAsync(() => RenderChunk(index, token), DispatcherPriority.Background, token);
            token.ThrowIfCancellationRequested();
            if (_disposed) throw new OperationCanceledException();
            Store(index, bitmap);
        }
    }

    public void Trim(ISet<int> protectedIndices)
    {
        if (CacheBytes <= CacheBudget) return;
        foreach (var pair in _cache.OrderBy(entry => entry.Value.Used).ToArray())
        {
            if (CacheBytes <= CacheBudget) break;
            if (protectedIndices.Contains(pair.Key)) continue;
            CacheBytes -= (long)pair.Value.Image.PixelWidth * pair.Value.Image.PixelHeight * 4;
            _cache.Remove(pair.Key);
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        _lifetime.Cancel();
        _lifetime.Dispose();
        _cache.Clear();
        CacheBytes = 0;
        _worker.BeginInvokeShutdown(DispatcherPriority.Send);
    }
}
