using System.IO;
using System.Reflection;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using DocumentFormat.OpenXml.Packaging;
using LoopScroller;
using LoopScroller.Loaders;
using LoopScroller.Models;
using LoopScroller.Rendering;
using LoopScroller.Scrolling;

internal static class RegressionTests
{
    public static void RealDocumentWindow(string path)
    {
        SynchronizationContext.SetSynchronizationContext(new DispatcherSynchronizationContext());
        var frame = new DispatcherFrame();
        Exception? failure = null;
        Dispatcher.CurrentDispatcher.BeginInvoke(async () =>
        {
            var app = new App { ShutdownMode = ShutdownMode.OnExplicitShutdown };
            app.InitializeComponent();
            var window = new MainWindow { Opacity = 0, ShowActivated = false, ShowInTaskbar = false };
            int ticks = 0;
            var heartbeat = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(50) };
            heartbeat.Tick += (_, _) => ticks++;
            try
            {
                window.Show();
                heartbeat.Start();
                Console.WriteLine("Real window: opening DOCX");
                await window.LoadFileAsync(path);
                var surface = Element<LoopSurface>(window, "Surface");
                Check(surface.Document is not null, Element<TextBlock>(window, "StartStatusText").Text);
                Console.WriteLine($"Real window DPI: {surface.Document!.Dpi.DpiScaleY}");
                double before = surface.Offset;
                await Task.Delay(1500);
                Check(ticks >= 10 && surface.Offset != before, "UI heartbeat and automatic scrolling must progress");
                Call(window, "TogglePlayPause");
                double initialHeight = surface.CycleHeight;
                foreach (double zoom in new[] { 100d, 300d })
                {
                    Element<Slider>(window, "ZoomSlider").Value = zoom;
                    await (Task)Call(window, "RebuildLoopAsync")!;
                    // The slider's debounce can supersede our explicit rebuild.
                    // Wait for that actual generation, not just a canceled task.
                    await Task.Delay(250);
                    var pendingField = typeof(MainWindow).GetField("_renderCancellation", BindingFlags.NonPublic | BindingFlags.Instance)!;
                    for (int attempt = 0; attempt < 250 && pendingField.GetValue(window) is not null; attempt++)
                        await Task.Delay(20);
                    Check(pendingField.GetValue(window) is null, "Zoom rendering must finish");
                    Check(surface.Document is not null, "Zoom rebuild must succeed");
                    if (zoom == 300) Check(surface.CycleHeight > initialHeight * 2, "300% content must actually replace 100% content");
                    CheckWheel(window, playing: false);
                    // Exercise loaded-surface prefetch at every boundary, including tile 7.
                    var renderer = surface.Document!;
                    for (int i = 0; i < renderer.ChunkCount; i++)
                    {
                        surface.SetOffset(i * renderer.ChunkHeight);
                        await Task.Delay(1);
                    }
                }
                surface.SetOffset(0);
                SavePreview(surface, "real-docx-preview.png", (int)surface.ActualWidth, (int)surface.ActualHeight);
                Press(window, Key.Escape);
                Check(Element<Grid>(window, "StartPage").Visibility == Visibility.Visible, "Esc returns home");
                await window.LoadFileAsync(path);
                Check(surface.Document is not null, "Reopening the same document must work");
                Console.WriteLine($"PASS real window: load, scrolling, wheel, 300% zoom, every tile, Esc, reopen; {ticks} heartbeat ticks");
            }
            catch (Exception ex) { failure = ex; }
            finally { heartbeat.Stop(); window.Close(); app.Shutdown(); frame.Continue = false; }
        });
        Dispatcher.PushFrame(frame);
        if (failure is not null) throw failure;
    }

    private static void Check(bool condition, string message)
    { if (!condition) throw new InvalidOperationException(message); }

    public static void Encodings()
    {
        foreach (var encoding in new[] { Encoding.Unicode, Encoding.BigEndianUnicode })
        {
            const string text = "hello 中文\r\n12345";
            Check(TextContentLoader.Decode(encoding.GetBytes(text)) == text, "BOM-less UTF16");
            Check(TextContentLoader.Decode(encoding.GetPreamble().Concat(encoding.GetBytes(text)).ToArray()) == text, "BOM UTF16");
        }
    }

    public static byte[] Png(int width = 4000, int height = 4)
    {
        var pixels = new byte[width * height * 4];
        for (int i = 0; i < pixels.Length; i += 4) { pixels[i + 2] = 255; pixels[i + 3] = 255; }
        var bitmap = BitmapSource.Create(width, height, 96, 96, PixelFormats.Pbgra32, null, pixels, width * 4);
        var encoder = new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(bitmap));
        using var memory = new MemoryStream(); encoder.Save(memory); return memory.ToArray();
    }

    public static void ImageZoom()
    {
        var data = Png();
        var document = new DisplayDocument("test", DocumentKind.Image, [new DisplayImage(data)]);
        var bitmap = Task.Run(() => { ImageCache.Prepare(document, CancellationToken.None); return ImageCache.Get(data); }).Result;
        Check(bitmap.IsFrozen, "Decoded image must be cross-thread safe");
        foreach (var zoom in new[] { 0.5, 1d, 2d, 3d })
        {
            var canvas = (Canvas)DocumentVisualBuilder.Build(document, 1000, zoom);
            var image = (Image)canvas.Children[0];
            Check(image.Width == 1000 * zoom, "Zoom must be relative to fitted width");
            Check(ReferenceEquals(image.Source, bitmap), "Rebuild must reuse decoded bitmap");
            Check(canvas.Margin == new Thickness(0), "No inter-cycle margin");
        }
    }

    public static void SeamPixels()
    {
        // A red upper half and blue lower half expose blank gaps and incorrect wrap phase.
        var pixelsSource = new byte[40 * 40 * 4];
        for (int y = 0; y < 40; y++)
        for (int x = 0; x < 40; x++)
        {
            int p = (y * 40 + x) * 4;
            pixelsSource[p + (y < 20 ? 2 : 0)] = 255;
            pixelsSource[p + 3] = 255;
        }
        var source = BitmapSource.Create(40, 40, 96, 96, PixelFormats.Pbgra32, null, pixelsSource, 160);
        var encoder = new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(source));
        using var stream = new MemoryStream(); encoder.Save(stream);
        var document = new DisplayDocument("stripes", DocumentKind.Image, [new DisplayImage(stream.ToArray())]);
        using var surface = CreateSurface(document, 40);
        surface.Measure(new Size(40, 135)); surface.Arrange(new Rect(0, 0, 40, 135));
        int period = 40 + (int)LoopSurface.SeparatorHeight;
        Check(surface.CycleHeight == period, "Divider must be included in the cycle height");
        foreach (var offset in new[] { 0d, 39d, 40d, 42d, 43d, 44d, -1d, -44d, 4001d })
        {
            surface.SetOffset(offset); surface.UpdateLayout();
            var rendered = new RenderTargetBitmap(40, 135, 96, 96, PixelFormats.Pbgra32);
            rendered.Render(surface);
            var pixels = new byte[40 * 135 * 4]; rendered.CopyPixels(pixels, 160, 0);
            for (int y = 0; y < 135; y++)
            {
                int phase = (int)LoopMath.Normalize(y + offset, period);
                var expected = phase < 20 ? Colors.Red : phase < 40 ? Colors.Blue : Colors.RoyalBlue;
                foreach (int x in new[] { 0, 20, 39 })
                {
                    int index = (y * 40 + x) * 4;
                    Check(pixels[index + 3] == 255 && pixels[index] == expected.B &&
                        pixels[index + 1] == expected.G && pixels[index + 2] == expected.R,
                        $"Cycle/divider error at offset={offset}, x={x}, y={y}");
                }
            }
        }
    }

    public static void FullWidth()
    {
        foreach (var kind in new[] { DocumentKind.Text, DocumentKind.Word })
        foreach (int width in new[] { 720, 1920, 2560 })
        {
            var document = new DisplayDocument("wide", kind,
                [new DisplayParagraph([new DisplayRun("全宽显示 " + new string('字', 500))])]);
            var content = DocumentVisualBuilder.Build(document, width, 1);
            content.Measure(new Size(width, double.PositiveInfinity));
            content.Arrange(new Rect(0, 0, width, content.DesiredSize.Height));
            using var surface = CreateSurface(document, width);
            surface.Measure(new Size(width, 400)); surface.Arrange(new Rect(0, 0, width, 400));
            var border = (Border)content;
            Check(Math.Abs(border.ActualWidth - width) < 0.01, "Page must fill viewport");
            Check(Math.Abs(((StackPanel)border.Child).ActualWidth - (width - 64)) < 0.01, "Text must use available width");
            // Align the divider at y=10 and check the two page edges on either side of it.
            surface.SetOffset(content.ActualHeight - 10);
            var bitmap = new RenderTargetBitmap(width, 400, 96, 96, PixelFormats.Pbgra32);
            bitmap.Render(surface);
            var pixels = new byte[width * 400 * 4]; bitmap.CopyPixels(pixels, width * 4, 0);
            foreach (int y in new[] { 5, 11, 15 })
            foreach (int x in new[] { 0, width - 1 })
            {
                int index = (y * width + x) * 4;
                var color = y == 11 ? Colors.RoyalBlue : Color.FromRgb(248, 250, 252);
                Check(pixels[index + 3] == 255 && pixels[index] == color.B &&
                    pixels[index + 1] == color.G && pixels[index + 2] == color.R,
                    $"Black edge or missing divider for {kind}, width={width}, x={x}, y={y}");
            }
            if (width == 1920 && kind == DocumentKind.Text)
                SavePreview(surface, "full-width-divider-preview.png", width, 400);
        }
    }

    public static void Anchor()
    {
        var document = new DisplayDocument("text", DocumentKind.Text, Enumerable.Range(0, 25)
            .Select(i => (DisplayBlock)new DisplayParagraph([new DisplayRun($"段落 {i} " + new string('字', 160))])).ToList());
        using var original = RenderedDocument.CreateAsync(document, 700, 1, new DpiScale(1, 1)).GetAwaiter().GetResult();
        double offset = original.RestoreAnchor((8, 0.3));
        var anchor = original.CaptureAnchor(offset);
        Check(anchor.Index == 8, "Initial anchor");
        using var resized = RenderedDocument.CreateAsync(document, 900, 3, new DpiScale(1.25, 1.25)).GetAwaiter().GetResult();
        var restored = resized.RestoreAnchor(anchor);
        var actual = resized.CaptureAnchor(restored);
        Check(actual.Index == 8 && Math.Abs(actual.Fraction - anchor.Fraction) < 0.001, "Preserve block and fraction across reflow");
    }

    public static void Docx()
    {
        // Generate a real package; fixtures intentionally include formats missed by the old tests.
        var path = Path.Combine(Path.GetTempPath(), $"loop-regression-{Guid.NewGuid():N}.docx");
        try
        {
            using (var package = WordprocessingDocument.Create(path, DocumentFormat.OpenXml.WordprocessingDocumentType.Document))
            {
                var main = package.AddMainDocumentPart();
                var image = main.AddImagePart(ImagePartType.Png);
                var png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");
                using (var stream = new MemoryStream(png)) image.FeedData(stream);
                string id = main.GetIdOfPart(image);
                var drawing = $"<w:r><w:drawing><wp:inline><wp:extent cx='952500' cy='952500'/><a:graphic><a:graphicData><a:blip r:embed='{id}'/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>";
                Put(main, $"""
                    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>
                    <w:p><w:pPr><w:pStyle w:val="CustomHeading"/></w:pPr><w:r><w:t>标题</w:t></w:r></w:p>
                    <w:p><w:pPr><w:pStyle w:val="Base"/></w:pPr><w:r><w:rPr><w:b w:val="0"/><w:i w:val="false"/><w:u w:val="none"/></w:rPr><w:t>before</w:t></w:r>{drawing}<w:r><w:t>after</w:t></w:r></w:p>
                    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>one</w:t></w:r></w:p>
                    <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>two</w:t></w:r></w:p>
                    <w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vMerge w:val="restart"/></w:tcPr><w:p>{drawing}<w:r><w:rPr><w:b/></w:rPr><w:t>cell</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vMerge/></w:tcPr><w:p/></w:tc></w:tr></w:tbl>
                    <w:sdt><w:sdtContent><w:p><w:r><w:t>wrapped</w:t></w:r></w:p></w:sdtContent></w:sdt>
                    </w:body></w:document>
                    """);
                Put(main.AddNewPart<StyleDefinitionsPart>(), """
                    <w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Base"><w:rPr><w:b/><w:i/><w:color w:val="AA0000"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="CustomHeading"><w:basedOn w:val="Base"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style></w:styles>
                    """);
                Put(main.AddNewPart<NumberingDefinitionsPart>(), """
                    <w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>
                    """);
            }
            var document = new DocxContentLoader().Load(path, CancellationToken.None);
            var paragraphs = document.Blocks.OfType<DisplayParagraph>().ToList();
            Check(paragraphs[0].HeadingLevel == 2 && paragraphs[0].Runs[0].Bold == true, "Inherited heading style");
            Check(paragraphs[1].Runs.Count == 3 && paragraphs[1].Runs[0].Text == "before" && paragraphs[1].Runs[1].Image is not null && paragraphs[1].Runs[2].Text == "after", "Inline image order");
            Check(paragraphs[1].Runs[0].Bold == false && paragraphs[1].Runs[0].Italic == false && paragraphs[1].Runs[0].Underline == false, "Explicit false formatting");
            Check(paragraphs[2].ListMarker == "1." && paragraphs[3].ListMarker == "2.", "Ordered list numbers");
            var cell = document.Blocks.OfType<DisplayTable>().Single().Cells[0][0];
            Check(cell.ColumnSpan == 2 && cell.RowSpan == 2, "Merged cells");
            Check(cell.Blocks.OfType<DisplayParagraph>().Single().Runs[0].Image is not null, "Image inside table");
            Check(paragraphs.Last().Runs[0].Text == "wrapped", "Content controls");
            ImageCache.Prepare(document, CancellationToken.None);
            using var surface = CreateSurface(document, 900);
            surface.Measure(new Size(900, 900)); surface.Arrange(new Rect(0, 0, 900, 900));
            var firstFrame = new RenderTargetBitmap(900, 900, 96, 96, PixelFormats.Pbgra32);
            firstFrame.Render(surface);
            var corner = new byte[4]; firstFrame.CopyPixels(new Int32Rect(0, 0, 1, 1), corner, 4, 0);
            Check(corner[3] == 255 && corner[2] == 248, "The first arranged frame must show the Word page before any scroll event");
            SavePreview(surface, "word-preview.png", 900, 900);
        }
        finally { File.Delete(path); }
    }

    private static void Put(OpenXmlPart part, string xml)
    { using var stream = part.GetStream(FileMode.Create); using var writer = new StreamWriter(stream, new UTF8Encoding(false)); writer.Write(xml); }

    public static void WindowLifecycle()
    {
        SynchronizationContext.SetSynchronizationContext(new DispatcherSynchronizationContext());
        var frame = new DispatcherFrame();
        Exception? failure = null;
        Dispatcher.CurrentDispatcher.BeginInvoke(async () =>
        {
            var app = new App { ShutdownMode = ShutdownMode.OnExplicitShutdown };
            app.InitializeComponent();
            var path = Path.Combine(Path.GetTempPath(), $"loop-window-{Guid.NewGuid():N}.txt");
            var second = Path.ChangeExtension(path, ".second.txt");
            var pdf = Path.ChangeExtension(path, ".pdf");
            var window = new MainWindow { Opacity = 0, ShowActivated = false, ShowInTaskbar = false };
            try
            {
                File.WriteAllText(path, string.Join('\n', Enumerable.Repeat("测试内容 abc", 800)));
                File.WriteAllText(second, "第二份文件");
                File.WriteAllBytes(pdf, PdfTests.Fixture());
                window.Show();
                window.UpdateLayout();
                SavePreview(Element<Grid>(window, "RootGrid"), "welcome-preview.png", 980, 640);
                var pending = window.LoadFileAsync(path);
                Call(window, "ShowStartPage");
                await pending;
                Check(Element<Grid>(window, "StartPage").Visibility == Visibility.Visible, "Cancelled load must not reopen player");
                var first = window.LoadFileAsync(path);
                var latest = window.LoadFileAsync(second);
                await Task.WhenAll(first, latest);
                Check(Element<TextBlock>(window, "PlayerTitle").Text == Path.GetFileName(second), "Latest load wins");
                Check(Element<LoopSurface>(window, "Surface").CycleHeight > 0, "Player must have actual laid-out content");
                Check(window.WindowStyle == WindowStyle.None && window.WindowState == WindowState.Maximized, "Load enters fullscreen");
                CheckWheel(window, playing: true);
                Call(window, "ExitFullscreen_Click", window, new RoutedEventArgs());
                Check(window.WindowStyle != WindowStyle.None && Element<Grid>(window, "PlayerPage").Visibility == Visibility.Visible, "Exit fullscreen retains playback");
                Call(window, "TogglePlayPause");
                Check((string)Element<Button>(window, "PlayPauseButton").Content == "继续", "Pause button");
                CheckWheel(window, playing: false);
                var speedSlider = Element<Slider>(window, "SpeedSlider");
                var zoomSlider = Element<Slider>(window, "ZoomSlider");
                Check(speedSlider.Minimum == 10 && speedSlider.Maximum == 150 && speedSlider.Width == 120,
                    "Speed range must be 10-150 without shortening the slider");
                speedSlider.Value = 10;
                Press(window, Key.Down);
                Check(speedSlider.Value == 10, "Down shortcut respects minimum speed");
                Press(window, Key.Up);
                Check(speedSlider.Value == 20, "Up shortcut increments speed");
                zoomSlider.Value = 50;
                Press(window, Key.OemMinus);
                Check(zoomSlider.Value == 50, "Minus shortcut respects minimum zoom");
                Press(window, Key.OemPlus);
                Check(zoomSlider.Value == 60, "Plus shortcut increments zoom");
                Press(window, Key.Subtract);
                Check(zoomSlider.Value == 50, "Numpad minus shares zoom behavior");
                speedSlider.Value = 150;
                Press(window, Key.Up);
                Check(speedSlider.Value == 150, "Up shortcut respects the reduced speed limit");
                zoomSlider.Value = 300;
                Press(window, Key.Add);
                Check(zoomSlider.Minimum == 50 && zoomSlider.Maximum == 300 && zoomSlider.Value == 300,
                    "Slider and keyboard support up to 300 percent");
                await Dispatcher.Yield(DispatcherPriority.DataBind);
                Check(Element<TextBlock>(window, "SpeedText").Text == "150 px/s" && Element<TextBlock>(window, "ZoomText").Text == "300%",
                    "Speed and zoom labels follow slider values");
                var previousStyle = window.WindowStyle;
                Press(window, Key.F11);
                Check(window.WindowStyle == WindowStyle.None, "F11 enters fullscreen");
                Press(window, Key.F11);
                Check(window.WindowStyle == previousStyle, "F11 restores previous window style");
                var surface = Element<LoopSurface>(window, "Surface");
                var oldDocument = surface.Document;
                var rebuild = (Task)Call(window, "RebuildLoopAsync")!;
                Check(ReferenceEquals(surface.Document, oldDocument), "Keep old images visible during background layout");
                CheckWheel(window, playing: false);
                var anchor = oldDocument!.CaptureAnchor(surface.Offset);
                await rebuild;
                Check(!ReferenceEquals(surface.Document, oldDocument), "Prepared images replace the old generation");
                var newAnchor = surface.Document!.CaptureAnchor(surface.Offset);
                Check(newAnchor.Index == anchor.Index && Math.Abs(newAnchor.Fraction - anchor.Fraction) < 0.0001,
                    "Zoom swap preserves the latest wheel-adjusted anchor");
                Call(window, "TogglePlayPause");
                Check((string)Element<Button>(window, "PlayPauseButton").Content == "暂停", "Resume button");
                zoomSlider.Value = 200;
                var playingRebuild = (Task)Call(window, "RebuildLoopAsync")!;
                CheckWheel(window, playing: true);
                await playingRebuild;
                Call(window, "ShowControls");
                await Task.Delay(2300);
                Check(Element<Border>(window, "ControlOverlay").Opacity == 0 && Element<TextBlock>(window, "PlayerTitle").Visibility == Visibility.Collapsed, "Idle controls and title hide");
                window.Width = 720; window.Height = 500; window.UpdateLayout();
                Call(window, "ShowControls");
                SavePreview(Element<Grid>(window, "RootGrid"), "narrow-player-preview.png", 720, 460);
                var button = Element<Button>(window, "FullscreenButton");
                var point = button.TranslatePoint(new Point(), window);
                Check(point.X >= 0 && point.X + button.ActualWidth <= window.ActualWidth, "Toolbar must fit narrow window");
                zoomSlider.Value = 100;
                await window.LoadFileAsync(pdf);
                Check(surface.Document is not null && Element<TextBlock>(window, "PlayerTitle").Text == Path.GetFileName(pdf),
                    "PDF opens through the common playback path: " + Element<TextBlock>(window, "StartStatusText").Text);
                Check(window.WindowStyle == WindowStyle.None, "PDF enters fullscreen");
                double pdfOffset = surface.Offset;
                await Task.Delay(500);
                Check(surface.Offset != pdfOffset, "PDF scrolls automatically");
                CheckWheel(window, playing: true);
                Call(window, "TogglePlayPause");
                CheckWheel(window, playing: false);
                var pdfAnchor = surface.Document!.CaptureAnchor(surface.Offset);
                zoomSlider.Value = 300;
                await (Task)Call(window, "RebuildLoopAsync")!;
                Check(surface.Document is not null && surface.Document.CaptureAnchor(surface.Offset).Index == pdfAnchor.Index,
                    "PDF zoom preserves the current page");
                Call(window, "ExitFullscreen_Click", window, new RoutedEventArgs());
                window.UpdateLayout();
                SavePreview(Element<Grid>(window, "RootGrid"), "pdf-player-preview.png", 720, 460);
                Press(window, Key.Escape);
                var canceledPdf = window.LoadFileAsync(pdf);
                Press(window, Key.Escape);
                await canceledPdf;
                Check(Element<Grid>(window, "StartPage").Visibility == Visibility.Visible, "PDF load cancellation stays home");
                var replacedPdf = window.LoadFileAsync(pdf);
                await window.LoadFileAsync(second);
                await replacedPdf;
                Check(Element<TextBlock>(window, "PlayerTitle").Text == Path.GetFileName(second), "Switch from PDF to TXT wins");
                await window.LoadFileAsync(path + ".missing");
                Check(Element<Grid>(window, "StartPage").Visibility == Visibility.Visible, "Missing file handled");
            }
            catch (Exception ex) { failure = ex; }
            finally
            {
                window.Close(); app.Shutdown(); File.Delete(path); File.Delete(second); File.Delete(pdf); frame.Continue = false;
            }
        });
        Dispatcher.PushFrame(frame);
        if (failure is not null) throw failure;
    }

    private static T Element<T>(MainWindow window, string name) => (T)window.FindName(name);

    private static void Press(MainWindow window, Key key)
    {
        var args = new KeyEventArgs(Keyboard.PrimaryDevice, PresentationSource.FromVisual(window)!, 0, key)
            { RoutedEvent = Keyboard.PreviewKeyDownEvent };
        window.RaiseEvent(args);
    }

    internal static LoopSurface CreateSurface(DisplayDocument document, double width, double zoom = 1, double dpi = 1)
    {
        var surface = new LoopSurface();
        surface.SetDocument(RenderedDocument.CreateAsync(document, width, zoom, new DpiScale(dpi, dpi)).GetAwaiter().GetResult(), 0);
        return surface;
    }

    private static void CheckWheel(MainWindow window, bool playing)
    {
        var surface = Element<LoopSurface>(window, "Surface");
        var speedSlider = Element<Slider>(window, "SpeedSlider");
        var zoomSlider = Element<Slider>(window, "ZoomSlider");
        double speed = speedSlider.Value, zoom = zoomSlider.Value;
        string buttonText = (string)Element<Button>(window, "PlayPauseButton").Content;
        var clock = typeof(MainWindow).GetField("_lastRenderingTime", BindingFlags.NonPublic | BindingFlags.Instance)!;
        clock.SetValue(window, TimeSpan.Zero);
        foreach (var delta in new[] { 120, -120, 30, -480, 12000 })
        {
            double expected = LoopMath.Normalize(surface.Offset - delta, surface.CycleHeight);
            var wheel = new MouseWheelEventArgs(Mouse.PrimaryDevice, Environment.TickCount, delta)
                { RoutedEvent = Mouse.PreviewMouseWheelEvent };
            // Exercise the real XAML event route, including wheel input over a slider.
            (delta == -480 ? (UIElement)speedSlider : surface).RaiseEvent(wheel);
            Check(wheel.Handled && Math.Abs(surface.Offset - expected) < 0.0001, "Wheel direction, fine deltas and wrapping");
            Check(speedSlider.Value == speed && zoomSlider.Value == zoom, "Wheel must not change speed or zoom");
            Check((string)Element<Button>(window, "PlayPauseButton").Content == buttonText, "Wheel must preserve play/pause");
            Check((TimeSpan?)clock.GetValue(window) == TimeSpan.Zero, "Wheel must not reset animation clock");
        }
        double beforeFrame = surface.Offset;
        // WPF creates these internally; construct one to exercise an exact next-frame interval.
        var frameEvent = (RenderingEventArgs)Activator.CreateInstance(typeof(RenderingEventArgs),
            BindingFlags.Instance | BindingFlags.NonPublic, null, [TimeSpan.FromMilliseconds(50)], null)!;
        Call(window, "CompositionTarget_Rendering", window, frameEvent);
        double afterFrame = playing ? LoopMath.Advance(beforeFrame, speed, 0.05, surface.CycleHeight) : beforeFrame;
        Check(Math.Abs(surface.Offset - afterFrame) < 0.0001, "Automatic playback continues from the wheel-adjusted position; paused playback stays paused");
    }

    private static void SavePreview(FrameworkElement element, string name, int width, int height)
    {
        var bitmap = new RenderTargetBitmap(width, height, 96, 96, PixelFormats.Pbgra32);
        bitmap.Render(element);
        var encoder = new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(bitmap));
        var directory = Path.Combine(AppContext.BaseDirectory, "qa"); Directory.CreateDirectory(directory);
        using var stream = File.Create(Path.Combine(directory, name)); encoder.Save(stream);
    }
    private static object? Call(MainWindow window, string name, params object[] args) =>
        typeof(MainWindow).GetMethod(name, BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(window, args);
}
