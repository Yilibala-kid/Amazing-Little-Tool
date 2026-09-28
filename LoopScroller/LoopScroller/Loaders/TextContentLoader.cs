using System.Text;
using LoopScroller.Models;

namespace LoopScroller.Loaders;

public sealed class TextContentLoader : IContentLoader
{
    private const long MaxFileSize = 20L * 1024 * 1024;

    static TextContentLoader()
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
    }

    public string Name => "TXT";
    public IReadOnlyList<string> Extensions { get; } = Array.AsReadOnly(new[] { ".txt" });

    public DisplayDocument Load(string path, CancellationToken cancellationToken)
    {
        var bytes = ContentFile.Read(path, MaxFileSize, "文本文件超过 20 MB，无法安全加载。", cancellationToken);
        var text = Decode(bytes);
        if (text.Length > 2_000_000) throw new InvalidDataException("文本超过 200 万字，请拆分后播放。");
        if (string.IsNullOrWhiteSpace(text))
        {
            throw new InvalidDataException("这个 TXT 文件没有可显示的内容。");
        }

        var normalized = text.Replace("\r\n", "\n").Replace('\r', '\n');
        var blocks = new List<DisplayBlock>();
        foreach (var line in normalized.Split('\n'))
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (blocks.Count >= 20000) throw new InvalidDataException("文本超过 20000 行，请拆分后播放。");
            blocks.Add(line.Length == 0
                ? new DisplaySpacer(14)
                : new DisplayParagraph([new DisplayRun(line)], SpaceAfter: 5));
        }

        return new DisplayDocument(Path.GetFileName(path), DocumentKind.Text, blocks);
    }

    public static string Decode(byte[] bytes)
    {
        if (bytes.Length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF)
        {
            return Encoding.UTF8.GetString(bytes, 3, bytes.Length - 3);
        }

        if (bytes.Length >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE)
        {
            return Encoding.Unicode.GetString(bytes, 2, bytes.Length - 2);
        }

        if (bytes.Length >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF)
        {
            return Encoding.BigEndianUnicode.GetString(bytes, 2, bytes.Length - 2);
        }

        // BOM-less UTF-16: strong alternating-zero signal in ordinary text.
        if (bytes.Length >= 4 && bytes.Length % 2 == 0)
        {
            var sample = Math.Min(bytes.Length, 4096);
            int evenZeros = 0, oddZeros = 0;
            for (int i = 0; i < sample - 1; i += 2)
            {
                if (bytes[i] == 0) evenZeros++;
                if (bytes[i + 1] == 0) oddZeros++;
            }
            if (oddZeros > sample / 8 && evenZeros < sample / 16) return Encoding.Unicode.GetString(bytes);
            if (evenZeros > sample / 8 && oddZeros < sample / 16) return Encoding.BigEndianUnicode.GetString(bytes);
        }

        try
        {
            return new UTF8Encoding(false, true).GetString(bytes);
        }
        catch (DecoderFallbackException)
        {
            return Encoding.GetEncoding("GB18030").GetString(bytes);
        }
    }
}
