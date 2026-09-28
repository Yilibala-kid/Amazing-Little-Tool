using LoopScroller.Models;

namespace LoopScroller.Loaders;

public sealed class ImageContentLoader : IContentLoader
{
    public string Name => "图片";
    public IReadOnlyList<string> Extensions { get; } = Array.AsReadOnly(new[] { ".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tif", ".tiff" });

    private const long MaxFileSize = 100L * 1024 * 1024;

    public DisplayDocument Load(string path, CancellationToken cancellationToken)
    {
        var data = ContentFile.Read(path, MaxFileSize, "图片超过 100 MB，无法安全加载。", cancellationToken);
        string title = Path.GetFileName(path);
        return new DisplayDocument(title, DocumentKind.Image, [new DisplayImage(data, title)]);
    }
}
