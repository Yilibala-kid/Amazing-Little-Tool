using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Media;
using LoopScroller.Models;

namespace LoopScroller.Rendering;

public static class DocumentVisualBuilder
{
    private static readonly Brush PageBackground = MakeBrush("#F8FAFC");
    private static readonly Brush BodyForeground = MakeBrush("#0F172A");
    private static readonly Brush MutedBorder = MakeBrush("#CBD5E1");

    public static FrameworkElement Build(DisplayDocument document, double viewportWidth, double zoom,
        CancellationToken token = default)
    {
        token.ThrowIfCancellationRequested();
        if (document.Kind == DocumentKind.Image) return BuildImage(document, viewportWidth, zoom);
        var panel = new StackPanel();
        foreach (var block in document.Blocks) panel.Children.Add(BuildBlock(block, document.Kind, zoom, viewportWidth - 64, token));
        return new Border { Width = viewportWidth, Padding = new Thickness(32, 0, 32, 0), Background = PageBackground, Child = panel };
    }

    private static FrameworkElement BuildImage(DisplayDocument document, double width, double zoom)
    {
        var bitmap = ImageCache.Get(document.Blocks.OfType<DisplayImage>().First().Data);
        var imageWidth = width * zoom;
        var imageHeight = imageWidth * bitmap.PixelHeight / bitmap.PixelWidth;
        var image = new Image { Source = bitmap, Width = imageWidth, Height = imageHeight, Stretch = Stretch.Fill };
        var canvas = new Canvas { Width = width, Height = imageHeight, ClipToBounds = true };
        Canvas.SetLeft(image, (width - imageWidth) / 2);
        canvas.Children.Add(image);
        return canvas;
    }

    private static FrameworkElement BuildBlock(DisplayBlock block, DocumentKind kind, double zoom, double width,
        CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        if (block is DisplayTable table)
        {
            var grid = TableGrid(table);
            for (int row = 0; row < table.Cells.Count; row++)
                foreach (var cell in table.Cells[row])
                {
                    var panel = new StackPanel();
                    foreach (var item in cell.Blocks) panel.Children.Add(BuildBlock(item, kind, zoom, CellWidth(grid, cell, width), token));
                    AddCell(grid, cell, row, panel);
                }
            return grid;
        }
        return BuildLeaf(block, kind, zoom, width);
    }

    private static FrameworkElement BuildLeaf(DisplayBlock block, DocumentKind kind, double zoom, double width) => block switch
    {
        DisplayParagraph paragraph => BuildParagraph(paragraph, kind, zoom, width),
        DisplayImage image => EmbeddedImage(image, width, zoom),
        DisplaySpacer spacer => new Border { Height = Math.Max(2, spacer.Height * zoom) },
        _ => new Border()
    };

    private static TextBlock BuildParagraph(DisplayParagraph paragraph, DocumentKind kind, double zoom, double width)
    {
        double size = paragraph.HeadingLevel > 0 ? Math.Max(19, 41 - paragraph.HeadingLevel * 5) : kind == DocumentKind.Text ? 28 : 18;
        var block = new TextBlock
        {
            TextWrapping = TextWrapping.Wrap, Foreground = BodyForeground,
            FontFamily = new FontFamily("Microsoft YaHei UI, Segoe UI"), FontSize = size * zoom,
            FontWeight = paragraph.HeadingLevel > 0 ? FontWeights.SemiBold : FontWeights.Normal,
            TextAlignment = paragraph.Alignment switch
            {
                ParagraphAlignment.Center => TextAlignment.Center, ParagraphAlignment.Right => TextAlignment.Right,
                ParagraphAlignment.Justify => TextAlignment.Justify, _ => TextAlignment.Left
            },
            Margin = new Thickness(paragraph.ListLevel * 20, 0, 0, paragraph.SpaceAfter * zoom)
        };
        if (paragraph.IsListItem) block.Inlines.Add(new Run((paragraph.ListMarker ?? "•") + " "));
        foreach (var item in paragraph.Runs)
        {
            if (item.Image is { } image)
            {
                block.Inlines.Add(new InlineUIContainer(EmbeddedImage(image, Math.Max(1, width - block.Margin.Left), zoom)) { BaselineAlignment = BaselineAlignment.Center });
                continue;
            }
            var run = new Run(item.Text);
            if (item.Bold is { } bold) run.FontWeight = bold ? FontWeights.Bold : FontWeights.Normal;
            if (item.Italic is { } italic) run.FontStyle = italic ? FontStyles.Italic : FontStyles.Normal;
            if (item.Underline is true) run.TextDecorations = TextDecorations.Underline;
            if (item.FontSize is { } fontSize) run.FontSize = Math.Clamp(fontSize, 4, 300) * zoom;
            if (item.Color is { } color) run.Foreground = MakeBrush(color);
            block.Inlines.Add(run);
        }
        return block;
    }

    private static Image EmbeddedImage(DisplayImage image, double width, double zoom)
    {
        var bitmap = ImageCache.Get(image.Data);
        var actualWidth = Math.Min(Math.Max(1, width), Math.Max(1, (image.Width ?? bitmap.Width) * zoom));
        return new Image { Source = bitmap, Width = actualWidth,
            Height = actualWidth * bitmap.PixelHeight / bitmap.PixelWidth, Stretch = Stretch.Fill };
    }

    private static Grid TableGrid(DisplayTable table)
    {
        var grid = new Grid { Margin = new Thickness(0, 0, 0, 10) };
        int columns = table.Cells.SelectMany(row => row).Select(cell => cell.Column + cell.ColumnSpan).DefaultIfEmpty(1).Max();
        for (int i = 0; i < columns; i++) grid.ColumnDefinitions.Add(new ColumnDefinition());
        foreach (var row in table.Cells) grid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        return grid;
    }

    private static double CellWidth(Grid grid, DisplayCell cell, double width) => Math.Max(1, width * cell.ColumnSpan / grid.ColumnDefinitions.Count - 16);

    private static void AddCell(Grid grid, DisplayCell cell, int row, StackPanel content)
    {
        var border = new Border { BorderBrush = MutedBorder, BorderThickness = new Thickness(0.5),
            Padding = new Thickness(8), Child = content };
        Grid.SetRow(border, row); Grid.SetColumn(border, cell.Column);
        Grid.SetColumnSpan(border, cell.ColumnSpan); Grid.SetRowSpan(border, cell.RowSpan);
        grid.Children.Add(border);
    }

    private static Brush MakeBrush(string color)
    {
        var brush = (Brush)new BrushConverter().ConvertFromString(color)!;
        brush.Freeze();
        return brush;
    }

}
