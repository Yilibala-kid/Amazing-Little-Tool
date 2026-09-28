using System.Windows;
using System.Windows.Media;

namespace LoopScroller.Rendering;

// Worker-owned content. Looping, tile caching and playback are format-independent.
internal interface IRenderSource : IDisposable
{
    double Height { get; }
    double[] BlockStarts { get; }
    void Draw(DrawingContext context, Rect region, CancellationToken token);
}
