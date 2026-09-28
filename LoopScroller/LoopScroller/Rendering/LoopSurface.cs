using System.Windows;
using System.Windows.Media;
using LoopScroller.Scrolling;

namespace LoopScroller.Rendering;

// A retained strip of image tiles. Between tile crossings only one transform changes.
public sealed class LoopSurface : FrameworkElement, IDisposable
{
    public const double SeparatorHeight = 3;
    private readonly DrawingVisual _strip = new();
    private readonly TranslateTransform _translation = new();
    private CancellationTokenSource? _prefetch;
    private int _firstChunk = -1;
    private double _baseOffset;
    internal RenderedDocument? Document { get; private set; }
    internal int StripBuildCount { get; private set; }
    public double CycleHeight => Document?.CycleHeight ?? 0;
    public double Offset { get; private set; }
    public event Action<Exception>? RenderFailed;

    public LoopSurface()
    {
        ClipToBounds = true;
        _strip.Transform = _translation;
        AddVisualChild(_strip);
    }

    protected override int VisualChildrenCount => 1;
    protected override Visual GetVisualChild(int index) => index == 0 ? _strip : throw new ArgumentOutOfRangeException(nameof(index));

    internal void SetDocument(RenderedDocument document, double offset)
    {
        Clear();
        Document = document;
        SetOffset(offset);
    }

    public void SetOffset(double offset)
    {
        double previous = Offset;
        Offset = LoopMath.Normalize(offset, CycleHeight);
        if (Document is not { } document) return;
        int chunk = document.ChunkAt(Offset);
        if (chunk != _firstChunk || Math.Abs(Offset - previous) > document.ChunkHeight)
            RebuildStrip();
        _translation.Y = _baseOffset - Offset;
    }

    protected override Size ArrangeOverride(Size finalSize)
    {
        // Prepare the first frame during layout, not a deferred SizeChanged event.
        try { RebuildStrip(finalSize.Height); }
        catch (Exception ex) { RenderFailed?.Invoke(ex); }
        return finalSize;
    }

    private void RebuildStrip(double? viewportHeight = null)
    {
        double height = viewportHeight ?? RenderSize.Height;
        if (Document is not { } document || height <= 0) return;
        _firstChunk = document.ChunkAt(Offset);
        _baseOffset = _firstChunk * document.ChunkHeight;
        var pinned = new HashSet<int>();
        double position = _baseOffset;
        double end = Offset + height + document.ChunkHeight;
        int index = _firstChunk;
        using (var dc = _strip.RenderOpen())
        {
            while (position < end - 0.00001)
            {
                var bitmap = document.GetChunk(index);
                pinned.Add(index);
                // Overlap samples the same page on both sides of a tile boundary.
                dc.DrawImage(bitmap, new Rect(0, position - _baseOffset - 1 / document.Dpi.DpiScaleY,
                    bitmap.PixelWidth / document.Dpi.DpiScaleX, bitmap.PixelHeight / document.Dpi.DpiScaleY));
                position += document.HeightOf(index);
                index = (index + 1) % document.ChunkCount;
            }
        }
        StripBuildCount++;
        _translation.Y = _baseOffset - Offset;
        document.Trim(pinned);
        _prefetch?.Cancel();
        _prefetch?.Dispose();
        _prefetch = new CancellationTokenSource();
        if (IsLoaded) _ = PrefetchAsync(document, pinned, _prefetch.Token);
    }

    private async Task PrefetchAsync(RenderedDocument document, HashSet<int> pinned, CancellationToken token)
    {
        try
        {
            var wanted = document.ChunksIn(Offset, RenderSize.Height * 3)
                .Concat(document.ChunksIn(Offset - RenderSize.Height, RenderSize.Height)).Distinct();
            foreach (int index in wanted)
            {
                await document.WarmAsync([index], token);
                document.Trim(pinned);
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex) { if (!token.IsCancellationRequested) RenderFailed?.Invoke(ex); }
    }

    public void Clear()
    {
        _prefetch?.Cancel();
        _prefetch?.Dispose();
        _prefetch = null;
        Document?.Dispose();
        Document = null;
        using (var dc = _strip.RenderOpen()) { }
        _translation.Y = 0;
        Offset = 0;
        _firstChunk = -1;
    }

    public void Dispose() => Clear();
}
