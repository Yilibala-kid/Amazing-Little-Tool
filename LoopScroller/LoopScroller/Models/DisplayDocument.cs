namespace LoopScroller.Models;

public enum DocumentKind
{
    Image,
    Text,
    Word,
    Pdf
}

public enum ParagraphAlignment
{
    Left,
    Center,
    Right,
    Justify
}

public sealed record DisplayDocument(
    string Title,
    DocumentKind Kind,
    IReadOnlyList<DisplayBlock> Blocks);

public abstract record DisplayBlock;

// Keep a stable snapshot while scrolling or rebuilding at another zoom/DPI.
public sealed record DisplayPdf(byte[] Data) : DisplayBlock;

public sealed record DisplayParagraph(
    IReadOnlyList<DisplayRun> Runs,
    ParagraphAlignment Alignment = ParagraphAlignment.Left,
    double SpaceAfter = 12,
    int HeadingLevel = 0,
    bool IsListItem = false,
    string? ListMarker = null,
    int ListLevel = 0) : DisplayBlock;

public sealed record DisplayRun(
    string Text,
    bool? Bold = null,
    bool? Italic = null,
    bool? Underline = null,
    double? FontSize = null,
    string? Color = null,
    DisplayImage? Image = null);

public sealed record DisplayImage(
    byte[] Data,
    string? Description = null,
    double? Width = null,
    double? Height = null) : DisplayBlock;

public sealed record DisplayCell(IReadOnlyList<DisplayBlock> Blocks, int Column, int ColumnSpan = 1, int RowSpan = 1);

public sealed record DisplayTable(IReadOnlyList<IReadOnlyList<DisplayCell>> Cells) : DisplayBlock
{
    public DisplayTable(IReadOnlyList<IReadOnlyList<string>> rows)
        : this(rows.Select(row => (IReadOnlyList<DisplayCell>)row.Select((text, col) =>
            new DisplayCell([new DisplayParagraph([new DisplayRun(text)])], col)).ToList()).ToList()) { }
}

public sealed record DisplaySpacer(double Height = 12) : DisplayBlock;
