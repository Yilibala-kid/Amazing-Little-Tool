using System.Globalization;
using System.IO.Compression;
using System.Xml.Linq;
using DocumentFormat.OpenXml.Packaging;
using LoopScroller.Models;

namespace LoopScroller.Loaders;

public sealed class DocxContentLoader : IContentLoader
{
    public string Name => "DOCX";
    public IReadOnlyList<string> Extensions { get; } = Array.AsReadOnly(new[] { ".docx" });

    public DisplayDocument Load(string path, CancellationToken cancellationToken)
    {
        if (new FileInfo(path).Length > 200L * 1024 * 1024)
            throw new InvalidDataException("Word 文档超过 200 MB，请拆分后播放。");
        // Bound decompressed package data before parsing XML or reading images.
        try
        {
            using var zip = ZipFile.OpenRead(path);
            if (zip.Entries.Sum(entry => entry.Length) > 256L * 1024 * 1024 ||
                zip.Entries.Any(entry => entry.FullName.EndsWith(".xml") && entry.Length > 20L * 1024 * 1024))
                throw new InvalidDataException("Word 文档展开后过大，请拆分后播放。");
        }
        catch (InvalidDataException ex)
        {
            throw new InvalidDataException("DOCX 文件损坏、已加密或内容过大。请用 Word/WPS 另存为未加密的 DOCX。", ex);
        }
        cancellationToken.ThrowIfCancellationRequested();
        using var package = WordprocessingDocument.Open(path, false);
        var main = package.MainDocumentPart ?? throw new InvalidDataException("DOCX 缺少正文。");
        return new Parser(main, cancellationToken).Read(Path.GetFileName(path));
    }

    private sealed class Parser
    {
        private static readonly XNamespace W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
        private static readonly XNamespace A = "http://schemas.openxmlformats.org/drawingml/2006/main";
        private static readonly XNamespace R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
        private static readonly XNamespace WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
        private readonly MainDocumentPart _main;
        private readonly CancellationToken _token;
        private readonly XElement? _styleRoot;
        private readonly XElement? _numberRoot;
        private readonly Dictionary<string, XElement> _styles;
        private readonly Dictionary<string, byte[]> _images = new();
        private readonly Dictionary<string, int[]> _counters = new();
        private int _blockCount;
        private int _characters;

        public Parser(MainDocumentPart main, CancellationToken token)
        {
            _main = main; _token = token;
            _styleRoot = LoadXml(main.StyleDefinitionsPart);
            _numberRoot = LoadXml(main.NumberingDefinitionsPart);
            _styles = _styleRoot?.Elements(W + "style").Where(e => e.Attribute(W + "styleId") is not null)
                .GroupBy(e => (string)e.Attribute(W + "styleId")!).ToDictionary(g => g.Key, g => g.First()) ?? new();
        }

        private static XElement? LoadXml(OpenXmlPart? part)
        {
            if (part is null) return null;
            using var stream = part.GetStream();
            return XElement.Load(stream);
        }

        public DisplayDocument Read(string title)
        {
            var body = LoadXml(_main)?.Element(W + "body") ?? throw new InvalidDataException("DOCX 缺少正文。");
            var blocks = Blocks(body, 0);
            if (!HasContent(blocks)) throw new InvalidDataException("这个 DOCX 文件没有可显示的正文。");
            return new DisplayDocument(title, DocumentKind.Word, blocks);
        }

        private static bool HasContent(IEnumerable<DisplayBlock> blocks) => blocks.Any(block => block switch
        {
            DisplayParagraph p => p.Runs.Any(run => run.Image is not null || !string.IsNullOrWhiteSpace(run.Text)),
            DisplayTable t => t.Cells.SelectMany(row => row).Any(cell => HasContent(cell.Blocks)),
            DisplayImage => true, _ => false
        });

        private List<DisplayBlock> Blocks(XElement parent, int depth)
        {
            if (depth > 32) throw new InvalidDataException("文档嵌套过深，无法显示。");
            var result = new List<DisplayBlock>();
            foreach (var element in parent.Elements())
            {
                _token.ThrowIfCancellationRequested();
                if (++_blockCount > 20000) throw new InvalidDataException("文档内容过长，请拆分后播放。");
                if (element.Name == W + "p") result.Add(Paragraph(element));
                else if (element.Name == W + "tbl") result.Add(Table(element, depth + 1));
                else if (element.Name == W + "sdt")
                    result.AddRange(Blocks(element.Element(W + "sdtContent") ?? element, depth + 1));
                else if (element.Name == W + "customXml" || element.Name == W + "ins")
                    result.AddRange(Blocks(element, depth + 1));
            }
            return result;
        }

        private IEnumerable<XElement> StyleChain(string? id)
        {
            var chain = new List<XElement>();
            var seen = new HashSet<string>();
            while (id is not null && seen.Add(id) && _styles.TryGetValue(id, out var style))
            {
                chain.Add(style);
                id = Val(style.Element(W + "basedOn"));
            }
            chain.Reverse();
            return chain;
        }

        private XElement MergeProperties(IEnumerable<XElement?> properties, string name)
        {
            var result = new XElement(W + name);
            foreach (var p in properties.Where(p => p is not null))
                foreach (var child in p!.Elements())
                {
                    // Merge numPr/spacing per attribute and child, preserving inherited fields.
                    var existing = result.Element(child.Name);
                    if (existing is null) result.Add(new XElement(child));
                    else if (child.Name.LocalName is "b" or "i" or "u" or "sz" or "color")
                        existing.ReplaceWith(new XElement(child));
                    else
                    {
                        foreach (var attr in child.Attributes()) existing.SetAttributeValue(attr.Name, attr.Value);
                        foreach (var nested in child.Elements())
                        {
                            existing.Elements(nested.Name).Remove(); existing.Add(new XElement(nested));
                        }
                    }
                }
            return result;
        }

        private DisplayParagraph Paragraph(XElement paragraph)
        {
            var direct = paragraph.Element(W + "pPr");
            var styleId = Val(direct?.Element(W + "pStyle")) ?? _styles.Values.FirstOrDefault(s =>
                (string?)s.Attribute(W + "type") == "paragraph" && OnValue((string?)s.Attribute(W + "default")))?.Attribute(W + "styleId")?.Value;
            var chain = StyleChain(styleId).ToList();
            var pp = MergeProperties(new[] { _styleRoot?.Element(W + "docDefaults")?.Element(W + "pPrDefault")?.Element(W + "pPr") }
                .Concat(chain.Select(s => s.Element(W + "pPr"))).Append(direct), "pPr");
            int heading = int.TryParse(Val(pp.Element(W + "outlineLvl")), out int outline) && outline < 6 ? outline + 1 : 0;
            if (heading == 0)
            {
                var fallback = styleId ?? "";
                if ((fallback.Contains("heading", StringComparison.OrdinalIgnoreCase) || fallback.Contains("标题")) &&
                    int.TryParse(new string(fallback.Where(char.IsDigit).ToArray()), out int fallbackLevel))
                    heading = Math.Clamp(fallbackLevel, 1, 6);
                foreach (var style in chain)
                {
                    var name = Val(style.Element(W + "name")) ?? (string?)style.Attribute(W + "styleId") ?? "";
                    if ((name.Contains("heading", StringComparison.OrdinalIgnoreCase) || name.Contains("标题")) &&
                        int.TryParse(new string(name.Where(char.IsDigit).ToArray()), out int level)) heading = Math.Clamp(level, 1, 6);
                }
            }
            var baseRun = new[] { _styleRoot?.Element(W + "docDefaults")?.Element(W + "rPrDefault")?.Element(W + "rPr") }
                .Concat(chain.Select(s => s.Element(W + "rPr"))).ToList();
            var runs = new List<DisplayRun>();
            foreach (var run in paragraph.Descendants(W + "r").Where(r => !r.Ancestors(W + "del").Any()))
            {
                _token.ThrowIfCancellationRequested();
                var rp = run.Element(W + "rPr");
                var props = MergeProperties(baseRun.Concat(StyleChain(Val(rp?.Element(W + "rStyle"))).Select(s => s.Element(W + "rPr"))).Append(rp), "rPr");
                foreach (var item in run.Elements())
                {
                    if (item.Name == W + "drawing")
                    {
                        foreach (var blip in item.Descendants(A + "blip"))
                        {
                            var image = ReadImage(item, blip);
                            runs.Add(new DisplayRun("", Image: image));
                        }
                    }
                    else
                    {
                        var text = item.Name.LocalName switch
                        {
                            "t" => item.Value, "tab" => "\t", "br" or "cr" => "\n", "noBreakHyphen" => "‑", _ => ""
                        };
                        if (text.Length == 0) continue;
                        _characters += text.Length;
                        if (_characters > 2_000_000) throw new InvalidDataException("文档文字超过 200 万字，请拆分后播放。");
                        var color = Val(props.Element(W + "color"));
                        runs.Add(new DisplayRun(text, On(props.Element(W + "b")), On(props.Element(W + "i")),
                            props.Element(W + "u") is { } underline ? Val(underline) != "none" : null,
                            double.TryParse(Val(props.Element(W + "sz")), NumberStyles.Float, CultureInfo.InvariantCulture, out var size) ? size * 2 / 3 : null,
                            color is { Length: 6 } && color.All(Uri.IsHexDigit) ? "#" + color : null));
                    }
                }
            }
            var number = pp.Element(W + "numPr");
            var numId = Val(number?.Element(W + "numId"));
            int listLevel = Math.Clamp(Int(Val(number?.Element(W + "ilvl")), 0), 0, 8);
            var marker = numId is not null && numId != "0" ? Marker(numId, listLevel) : null;
            var alignment = Val(pp.Element(W + "jc")) switch
            {
                "center" => ParagraphAlignment.Center, "right" or "end" => ParagraphAlignment.Right,
                "both" => ParagraphAlignment.Justify, _ => ParagraphAlignment.Left
            };
            double space = double.TryParse((string?)pp.Element(W + "spacing")?.Attribute(W + "after"), out var twips) ? Math.Clamp(twips / 15, 0, 200) : 10;
            if (runs.Count == 0) runs.Add(new DisplayRun(" "));
            return new DisplayParagraph(runs, alignment, space, heading, marker is not null, marker, listLevel);
        }

        private DisplayImage ReadImage(XElement drawing, XElement blip)
        {
            var id = (string?)blip.Attribute(R + "embed") ?? throw new InvalidDataException("文档包含外部链接图片，请先在 Word 中将图片嵌入文档。");
            if (!_images.TryGetValue(id, out var bytes))
            {
                if (_main.GetPartById(id) is not ImagePart part) throw new InvalidDataException("文档图片引用无效。");
                using var stream = part.GetStream();
                using var memory = new MemoryStream();
                stream.CopyTo(memory);
                bytes = memory.ToArray(); _images[id] = bytes;
            }
            var extent = drawing.Descendants(WP + "extent").FirstOrDefault();
            double? width = double.TryParse((string?)extent?.Attribute("cx"), out var cx) ? cx / 9525 : null;
            return new DisplayImage(bytes, Width: width);
        }

        private DisplayTable Table(XElement table, int depth)
        {
            var rows = new List<List<DisplayCell>>();
            var active = new Dictionary<int, (int Row, int Index)>();
            foreach (var row in table.Elements(W + "tr"))
            {
                _token.ThrowIfCancellationRequested();
                var cells = new List<DisplayCell>();
                int col = Math.Clamp(Int(Val(row.Element(W + "trPr")?.Element(W + "gridBefore")), 0), 0, 100);
                var continued = new HashSet<int>();
                foreach (var cell in row.Elements(W + "tc"))
                {
                    var cp = cell.Element(W + "tcPr");
                    int span = Math.Clamp(Int(Val(cp?.Element(W + "gridSpan")), 1), 1, 100);
                    var merge = cp?.Element(W + "vMerge");
                    var blocks = Blocks(cell, depth);
                    if (merge is not null && Val(merge) != "restart" && active.TryGetValue(col, out var start))
                    {
                        var origin = rows[start.Row][start.Index];
                        rows[start.Row][start.Index] = origin with { RowSpan = origin.RowSpan + 1,
                            Blocks = HasContent(blocks) ? origin.Blocks.Concat(blocks).ToList() : origin.Blocks };
                        continued.Add(col);
                    }
                    else
                    {
                        cells.Add(new DisplayCell(blocks, col, span));
                        if (merge is not null && Val(merge) == "restart")
                        { active[col] = (rows.Count, cells.Count - 1); continued.Add(col); }
                    }
                    col += span;
                    if (col > 200) throw new InvalidDataException("表格列数过多，请简化表格。");
                }
                foreach (var key in active.Keys.Where(k => !continued.Contains(k)).ToList()) active.Remove(key);
                rows.Add(cells);
            }
            return new DisplayTable(rows.Select(row => (IReadOnlyList<DisplayCell>)row).ToList());
        }

        private string Marker(string id, int level)
        {
            var num = _numberRoot?.Elements(W + "num").FirstOrDefault(n => (string?)n.Attribute(W + "numId") == id);
            var abstractId = Val(num?.Element(W + "abstractNumId"));
            var definition = _numberRoot?.Elements(W + "abstractNum").FirstOrDefault(n => (string?)n.Attribute(W + "abstractNumId") == abstractId);
            XElement? Level(int n) => num?.Elements(W + "lvlOverride").FirstOrDefault(e => (string?)e.Attribute(W + "ilvl") == n.ToString())?.Element(W + "lvl")
                ?? definition?.Elements(W + "lvl").FirstOrDefault(e => (string?)e.Attribute(W + "ilvl") == n.ToString());
            int Start(int n) => Int(Val(num?.Elements(W + "lvlOverride").FirstOrDefault(e => (string?)e.Attribute(W + "ilvl") == n.ToString())?.Element(W + "startOverride"))
                ?? Val(Level(n)?.Element(W + "start")), 1);
            if (!_counters.TryGetValue(id, out var counters)) _counters[id] = counters = new int[9];
            counters[level] = counters[level] == 0 ? Start(level) : counters[level] + 1;
            for (int n = level + 1; n < 9; n++) counters[n] = 0;
            var format = Val(Level(level)?.Element(W + "numFmt"));
            if (format == "bullet" || format is null) return "•";
            if (format == "none") return "";
            var text = Val(Level(level)?.Element(W + "lvlText")) ?? $"%{level + 1}.";
            for (int n = 0; n <= level; n++) text = text.Replace($"%{n + 1}", FormatNumber(counters[n] == 0 ? Start(n) : counters[n], Val(Level(n)?.Element(W + "numFmt"))));
            return text;
        }

        private static string FormatNumber(int value, string? format)
        {
            if (format is "lowerLetter" or "upperLetter")
            {
                string result = "";
                for (int n = value; n > 0; n = (n - 1) / 26) result = (char)('A' + (n - 1) % 26) + result;
                return format == "lowerLetter" ? result.ToLowerInvariant() : result;
            }
            if (format is "lowerRoman" or "upperRoman" && value is > 0 and < 4000)
            {
                string result = "";
                foreach (var (number, symbol) in new[] { (1000,"M"),(900,"CM"),(500,"D"),(400,"CD"),(100,"C"),(90,"XC"),(50,"L"),(40,"XL"),(10,"X"),(9,"IX"),(5,"V"),(4,"IV"),(1,"I") })
                    while (value >= number) { result += symbol; value -= number; }
                return format == "lowerRoman" ? result.ToLowerInvariant() : result;
            }
            return value.ToString(CultureInfo.InvariantCulture);
        }

        private static string? Val(XElement? element) => (string?)element?.Attribute(W + "val");
        private static int Int(string? value, int fallback) => int.TryParse(value, out var n) ? n : fallback;
        private static bool OnValue(string? value) => value is "true" or "1" or "on";
        private static bool? On(XElement? element) => element is null ? null : Val(element) is not ("0" or "false" or "off");
    }
}
