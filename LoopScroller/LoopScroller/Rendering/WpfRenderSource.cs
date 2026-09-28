using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace LoopScroller.Rendering;

internal sealed class WpfRenderSource : IRenderSource
{
    private readonly VisualBrush _content;
    private readonly Rect _bounds;
    public double Height => _bounds.Height;
    public double[] BlockStarts { get; }

    public WpfRenderSource(FrameworkElement content, double width)
    {
        content.Measure(new Size(width, double.PositiveInfinity));
        _bounds = new Rect(0, 0, width, Math.Max(1, content.DesiredSize.Height));
        content.Arrange(_bounds);
        BlockStarts = content is Border { Child: StackPanel panel }
            ? panel.Children.Cast<FrameworkElement>().Select(child => child.TranslatePoint(new Point(), content).Y).Append(Height).ToArray()
            : [0, Height];
        _content = new VisualBrush(content)
        {
            AutoLayoutContent = false, Stretch = Stretch.Fill,
            ViewboxUnits = BrushMappingMode.Absolute, Viewbox = _bounds
        };
    }

    public void Draw(DrawingContext context, Rect region, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        region.Intersect(_bounds);
        if (region.IsEmpty) return;
        context.PushClip(new RectangleGeometry(region));
        context.DrawRectangle(_content, null, _bounds);
        context.Pop();
    }

    public void Dispose() => _content.Visual = null;
}
