using System.Text;
using System.IO;
using DocumentFormat.OpenXml.Packaging;
using W = DocumentFormat.OpenXml.Wordprocessing;
using LoopScroller.Loaders;
using LoopScroller.Models;
using LoopScroller.Rendering;
using LoopScroller.Scrolling;

if (args.Contains("--ppt-test-wait"))
{
    Thread.Sleep(Timeout.Infinite);
    return 0;
}

if (args.Contains("--ppt-office"))
{
    using var watchdog = new Timer(_ => Environment.Exit(2), null, 300000, Timeout.Infinite);
    RunSta(() => PptTests.OfficeIntegration(args.Length > 1 ? args[1] : null));
    return 0;
}

if (args.Length == 2 && args[0] == "--document")
{
    using var watchdog = new Timer(_ => { Console.Error.WriteLine("FAIL: document test exceeded 90 seconds"); Environment.Exit(2); }, null, 90000, Timeout.Infinite);
    RunSta(() => RenderingTests.RealDocument(args[1]));
    RunSta(() => RegressionTests.RealDocumentWindow(args[1]));
    return 0;
}

if (args.Contains("--benchmark"))
{
    RunSta(PlaybackBenchmark.Run);
    return 0;
}

using var suiteWatchdog = new Timer(_ => { Console.Error.WriteLine("FAIL: suite exceeded 180 seconds"); Environment.Exit(2); }, null, 180000, Timeout.Infinite);
var tests = new (string Name, Action Run)[]
{
    ("UTF-8 BOM 解码", TestUtf8Bom),
    ("GB18030 回退解码", TestGb18030),
    ("格式加载器分派", TestLoaderFactory),
    ("图片/TXT/PDF 文件读取、大小限制、取消与快照", TestFileSnapshots),
    ("PPT 转换快照/标题/缺少Office/失败/取消/临时文件清理", () => RunSta(PptTests.ConversionContract)),
    ("PPT 辅助进程取消和超时终止", PptTests.WorkerCancellation),
    ("循环位置回绕", TestLoopMath),
    ("DOCX 图文结构解析", TestDocxLoading),
    ("空 TXT 错误处理", TestEmptyText),
    ("文本与图片视觉构建", TestVisualBuilding),
    ("UTF-16 有/无 BOM", RegressionTests.Encodings),
    ("DOCX 图文顺序/表格图片/合并/样式/编号", () => RunSta(RegressionTests.Docx)),
    ("图片缩放/解码复用", () => RunSta(RegressionTests.ImageZoom)),
    ("循环衔接像素验证", () => RunSta(RegressionTests.SeamPixels)),
    ("TXT/Word 宽屏铺满与分割线", () => RunSta(RegressionTests.FullWidth)),
    ("段落阅读位置保持", () => RunSta(RegressionTests.Anchor)),
    ("PDF 图文/混合页尺寸/旋转/高DPI/缩放/循环像素", () => RunSta(PdfTests.RenderAndLoop)),
    ("PDF 按需渲染/缓存预算/取消/损坏文件/释放", () => RunSta(PdfTests.ErrorsAndCache)),
    ("窗口加载取消/换文件/全屏/控制栏/300%缩放/150速度", () => RunSta(RegressionTests.WindowLifecycle)),
    ("后台排版与平移帧复用", () => RunSta(RenderingTests.RetainedFrames)),
    ("高DPI/300%图片/分块接缝", () => RunSta(RenderingTests.DpiAndChunkSeams)),
    ("各DPI分块枚举终止/精确边界/循环范围", () => RunSta(RenderingTests.ChunkEnumeration)),
    ("缓存预算/保护可见块/淘汰/取消", () => RunSta(RenderingTests.CacheBudgetAndCancellation))
};

var failures = new List<string>();
foreach (var test in tests)
{
    if (args.Contains("--pdf") && !test.Name.StartsWith("PDF ")) continue;
    try
    {
        test.Run();
        Console.WriteLine($"PASS  {test.Name}");
    }
    catch (Exception exception)
    {
        failures.Add($"{test.Name}: {exception.Message}");
        Console.WriteLine($"FAIL  {test.Name}: {exception}");
    }
}

int testCount = args.Contains("--pdf") ? tests.Count(test => test.Name.StartsWith("PDF ")) : tests.Length;
Console.WriteLine($"\n{testCount - failures.Count}/{testCount} tests passed.");
return failures.Count == 0 ? 0 : 1;

static void TestUtf8Bom()
{
    var payload = Encoding.UTF8.GetBytes("循环滚动");
    var bytes = new byte[payload.Length + 3];
    bytes[0] = 0xEF;
    bytes[1] = 0xBB;
    bytes[2] = 0xBF;
    payload.CopyTo(bytes, 3);
    AssertEqual("循环滚动", TextContentLoader.Decode(bytes));
}

static void TestGb18030()
{
    Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
    var encoding = Encoding.GetEncoding("GB18030");
    AssertEqual("中文旧编码", TextContentLoader.Decode(encoding.GetBytes("中文旧编码")));
}

static void TestLoaderFactory()
{
    var factory = new ContentLoaderFactory();
    Assert(factory.GetLoader("example.PNG") is ImageContentLoader, "PNG 应使用图片加载器");
    Assert(factory.GetLoader("example.txt") is TextContentLoader, "TXT 应使用文本加载器");
    Assert(factory.GetLoader("example.docx") is DocxContentLoader, "DOCX 应使用 Word 加载器");
    AssertThrows<NotSupportedException>(() => factory.GetLoader("example.doc"));
    Assert(factory.GetLoader("example.PDF") is PdfContentLoader, "PDF 应使用 PDF 加载器");
    Assert(factory.GetLoader("example.PPTX") is PptContentLoader, "PPTX 应使用演示文稿加载器");
    Assert(factory.GetLoader("example.ppt") is PptContentLoader, "PPT 应使用演示文稿加载器");
    var filters = ContentLoaderFactory.FileFilter.Split('|');
    Assert(filters.Length % 2 == 0, "文件筛选器应由名称和匹配模式成对组成");
    foreach (var pattern in filters[1].Split(';'))
        Assert(factory.GetLoader("example" + pattern[1..]) is not null, "选择框中的每种格式必须有加载器");
    Assert(filters[1].Split(';').Contains("*.pdf") && !filters[1].Split(';').Contains("*.doc"),
        "文件筛选器包含 PDF，但不能把旧版 DOC 声明为支持的格式");
}

static void TestLoopMath()
{
    AssertEqual(25d, LoopMath.Advance(95, 30, 1, 100));
    AssertEqual(90d, LoopMath.Normalize(-10, 100));
    AssertEqual(0d, LoopMath.Advance(10, 20, 1, 0));
}

static void TestFileSnapshots()
{
    string path = Path.Combine(Path.GetTempPath(), $"loop-read-{Guid.NewGuid():N}");
    try
    {
        foreach (var (loader, sizeLimit) in new (IContentLoader, long)[]
            { (new TextContentLoader(), 20L * 1024 * 1024), (new ImageContentLoader(), 100L * 1024 * 1024), (new PdfContentLoader(), 100L * 1024 * 1024) })
        {
            var bytes = Encoding.UTF8.GetBytes("读取快照");
            File.WriteAllBytes(path, bytes);
            var document = loader.Load(path, CancellationToken.None);
            File.Delete(path);
            AssertEqual(Path.GetFileName(path), document.Title);
            Assert(document.Blocks.Single() switch
            {
                DisplayImage image => image.Data.SequenceEqual(bytes),
                DisplayPdf pdf => pdf.Data.SequenceEqual(bytes),
                DisplayParagraph paragraph => paragraph.Runs.Single().Text == "读取快照",
                _ => false
            }, "文件关闭和删除后内容快照仍然完整");
            AssertThrows<FileNotFoundException>(() => loader.Load(path, CancellationToken.None));
            File.WriteAllBytes(path, bytes);
            AssertThrows<OperationCanceledException>(() => loader.Load(path, new CancellationToken(true)));
            using (var file = File.OpenWrite(path)) file.SetLength(sizeLimit + 1);
            AssertThrows<InvalidDataException>(() => loader.Load(path, CancellationToken.None));
        }
    }
    finally { File.Delete(path); }
}

static void TestDocxLoading()
{
    var path = Path.Combine(Path.GetTempPath(), $"loopscroller-{Guid.NewGuid():N}.docx");
    try
    {
        using (var document = WordprocessingDocument.Create(path, DocumentFormat.OpenXml.WordprocessingDocumentType.Document))
        {
            var main = document.AddMainDocumentPart();
            var heading = new W.Paragraph(
                new W.ParagraphProperties(new W.ParagraphStyleId { Val = "Heading1" }),
                new W.Run(new W.RunProperties(new W.Bold()), new W.Text("测试标题")));
            var paragraph = new W.Paragraph(new W.Run(new W.Text("正文内容")));
            var firstCell = new W.TableCell(new W.Paragraph(new W.Run(new W.Text("列一"))));
            var secondCell = new W.TableCell(new W.Paragraph(new W.Run(new W.Text("列二"))));
            var table = new W.Table(new W.TableRow(firstCell, secondCell));
            var body = new W.Body(heading, paragraph, table);
            main.Document = new W.Document(body);
            main.Document.Save();
        }

        var result = new DocxContentLoader().Load(path, CancellationToken.None);
        AssertEqual(DocumentKind.Word, result.Kind);
        Assert(result.Blocks.OfType<DisplayParagraph>().Any(paragraph => paragraph.HeadingLevel == 1), "应解析标题");
        Assert(result.Blocks.OfType<DisplayTable>().Any(), "应解析表格");
    }
    finally
    {
        if (File.Exists(path)) File.Delete(path);
    }
}

static void TestEmptyText()
{
    var path = Path.Combine(Path.GetTempPath(), $"loopscroller-{Guid.NewGuid():N}.txt");
    try
    {
        File.WriteAllText(path, "   \r\n");
        AssertThrows<InvalidDataException>(() => new TextContentLoader().Load(path, CancellationToken.None));
    }
    finally
    {
        if (File.Exists(path)) File.Delete(path);
    }
}

static void TestVisualBuilding()
{
    RunSta(() =>
    {
        var textDocument = new DisplayDocument(
            "test.txt",
            DocumentKind.Text,
            [
                new DisplayParagraph([new DisplayRun("测试文字", Bold: true)]),
                new DisplayTable([["A", "B"], ["1", "2"]])
            ]);
        var textVisual = DocumentVisualBuilder.Build(textDocument, 1280, 1);
        textVisual.Measure(new System.Windows.Size(1280, double.PositiveInfinity));
        Assert(textVisual.DesiredSize.Height > 0, "文本视觉应有高度");

        var png = Convert.FromBase64String(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");
        var imageDocument = new DisplayDocument("test.png", DocumentKind.Image, [new DisplayImage(png)]);
        var imageVisual = DocumentVisualBuilder.Build(imageDocument, 1280, 1);
        imageVisual.Measure(new System.Windows.Size(1280, double.PositiveInfinity));
        Assert(imageVisual.DesiredSize.Height > 0, "图片视觉应有高度");
    });
}

static void RunSta(Action action)
{
    Exception? captured = null;
    var thread = new Thread(() =>
    {
        try
        {
            action();
        }
        catch (Exception exception)
        {
            captured = exception;
        }
        finally
        {
            // Release each test thread's WPF native windows on their owning thread.
            var dispatcher = System.Windows.Threading.Dispatcher.FromThread(Thread.CurrentThread);
            if (dispatcher is not null && !dispatcher.HasShutdownStarted) dispatcher.InvokeShutdown();
        }
    });
    thread.SetApartmentState(ApartmentState.STA);
    thread.Start();
    thread.Join();
    if (captured is not null) throw captured;
}

static void Assert(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

static void AssertEqual<T>(T expected, T actual)
{
    if (!EqualityComparer<T>.Default.Equals(expected, actual))
    {
        throw new InvalidOperationException($"Expected '{expected}', actual '{actual}'.");
    }
}

static void AssertThrows<TException>(Action action) where TException : Exception
{
    try
    {
        action();
    }
    catch (TException)
    {
        return;
    }

    throw new InvalidOperationException($"Expected {typeof(TException).Name}.");
}
