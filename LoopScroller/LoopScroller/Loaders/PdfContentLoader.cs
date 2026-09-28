using LoopScroller.Models;

namespace LoopScroller.Loaders;

public sealed class PdfContentLoader : IContentLoader
{
    private const int MaxFileSize = 100 * 1024 * 1024;

    public string Name => "PDF";
    public IReadOnlyList<string> Extensions { get; } = Array.AsReadOnly(new[] { ".pdf" });

    public DisplayDocument Load(string path, CancellationToken cancellationToken)
    {
        var bytes = ContentFile.Read(path, MaxFileSize, "PDF 超过 100 MB，请拆分后再播放。", cancellationToken);
        if (bytes.Length == 0) throw new InvalidDataException("PDF 文件为空。");
        return new DisplayDocument(Path.GetFileName(path), DocumentKind.Pdf, [new DisplayPdf(bytes)]);
    }
}
