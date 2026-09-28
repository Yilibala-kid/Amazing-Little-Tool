using LoopScroller.Models;

namespace LoopScroller.Loaders;

public sealed class PptContentLoader : IContentLoader
{
    private readonly IPresentationConverter _converter;

    public PptContentLoader() : this(new PowerPointConverter()) { }
    internal PptContentLoader(IPresentationConverter converter) => _converter = converter;

    public string Name => "PPT / PPTX（需 PowerPoint）";
    public IReadOnlyList<string> Extensions { get; } = Array.AsReadOnly(new[] { ".ppt", ".pptx" });

    public DisplayDocument Load(string path, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var file = new FileInfo(path);
        if (!file.Exists) throw new FileNotFoundException("找不到演示文稿。", path);
        if (file.Length == 0) throw new InvalidDataException("演示文稿文件为空。");
        if (file.Length > 100 * 1024 * 1024)
            throw new InvalidDataException("演示文稿超过 100 MB，请拆分后再播放。");

        var document = _converter.Convert(file.FullName, cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
        return document with { Title = file.Name };
    }
}

internal interface IPresentationConverter
{
    DisplayDocument Convert(string path, CancellationToken cancellationToken);
}
