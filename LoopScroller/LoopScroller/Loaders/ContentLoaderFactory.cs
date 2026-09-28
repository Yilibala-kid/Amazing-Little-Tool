namespace LoopScroller.Loaders;

public sealed class ContentLoaderFactory
{
    private static readonly IContentLoader[] Loaders =
        [new ImageContentLoader(), new TextContentLoader(), new DocxContentLoader(), new PdfContentLoader(), new PptContentLoader()];

    public static string FormatSummary { get; } = string.Join(" · ", Loaders.Select(loader => loader.Name));
    public static string FileFilter { get; } =
        "支持的文件|" + Patterns(Loaders.SelectMany(loader => loader.Extensions)) + "|" +
        string.Join("|", Loaders.Select(loader => loader.Name + "|" + Patterns(loader.Extensions))) + "|所有文件|*.*";

    private static string Patterns(IEnumerable<string> extensions) => string.Join(";", extensions.Select(extension => "*" + extension));

    public IContentLoader GetLoader(string path)
    {
        var extension = Path.GetExtension(path).ToLowerInvariant();

        if (extension == ".doc")
        {
            throw new NotSupportedException("暂不支持旧版 .doc 文件，请先用 Word 或 WPS 将它另存为 .docx。 ");
        }

        return Loaders.FirstOrDefault(loader => loader.Extensions.Contains(extension, StringComparer.OrdinalIgnoreCase))
            ?? throw new NotSupportedException($"不支持这种文件格式。支持：{FormatSummary}。");
    }
}
