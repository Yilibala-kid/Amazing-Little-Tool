using System.IO;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using LoopScroller.Loaders;
using LoopScroller.Models;
using LoopScroller.Rendering;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

internal static class PptTests
{
    public static void WorkerCancellation()
    {
        string directory = Path.Combine(Path.GetTempPath(), "LoopScroller-cancel-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            foreach (bool userCanceled in new[] { true, false })
            {
                var start = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden };
                start.ArgumentList.Add("--ppt-test-wait");
                using var process = Process.Start(start)!;
                try
                {
                    using var stop = new CancellationTokenSource(150);
                    var task = PowerPointConverter.MonitorWorkerAsync(process, directory,
                        userCanceled ? stop.Token : CancellationToken.None, stop.Token);
                    if (userCanceled) Expect<OperationCanceledException>(() => task.GetAwaiter().GetResult());
                    else Expect<InvalidDataException>(() => task.GetAwaiter().GetResult(), "超过 2 分钟");
                    Check(process.HasExited, "blocked helper exits on cancel or timeout");
                }
                finally { if (!process.HasExited) { process.Kill(); process.WaitForExit(); } }
            }
        }
        finally { Directory.Delete(directory, true); }
    }

    public static void ConversionContract()
    {
        string input = Path.Combine(Path.GetTempPath(), $"中文 演示-{Guid.NewGuid():N}.pptx");
        string? workDirectory = null;
        try
        {
            File.WriteAllText(input, "fixture");
            var converter = new PowerPointConverter(() => true, (snapshot, directory, _) =>
            {
                workDirectory = directory;
                Check(snapshot != input && File.ReadAllText(snapshot) == "fixture", "convert a private source snapshot");
                File.WriteAllBytes(Path.Combine(directory, "slides.pdf"), PdfTests.Fixture());
                return Task.CompletedTask;
            });
            var document = new PptContentLoader(converter).Load(input, CancellationToken.None);
            Check(document.Title == Path.GetFileName(input) && document.Kind == DocumentKind.Pdf, "original title / PDF renderer");
            Check(!Directory.Exists(workDirectory), "successful conversion cleans temporary files");
            Check(File.ReadAllText(input) == "fixture", "input unchanged");
            using var rendered = RenderedDocument.CreateAsync(document, 320, 1, new DpiScale(1, 1)).GetAwaiter().GetResult();
            Check(rendered.CycleHeight > 1000, "snapshot still renders after temporary PDF removal");

            var missing = new PowerPointConverter(() => false, (_, _, _) => throw new Exception("must not run"));
            Expect<NotSupportedException>(() => new PptContentLoader(missing).Load(input, CancellationToken.None), "PowerPoint");
            var failed = new PowerPointConverter(() => true, (_, directory, _) =>
            {
                workDirectory = directory;
                File.WriteAllText(Path.Combine(directory, "partial"), "partial output");
                throw new InvalidDataException("conversion failed");
            });
            Expect<InvalidDataException>(() => new PptContentLoader(failed).Load(input, CancellationToken.None), "conversion failed");
            Check(!Directory.Exists(workDirectory), "failed conversion cleanup");
            using var cancel = new CancellationTokenSource();
            var canceled = new PowerPointConverter(() => true, (_, directory, _) =>
            {
                workDirectory = directory;
                File.WriteAllBytes(Path.Combine(directory, "slides.pdf"), PdfTests.Fixture());
                cancel.Cancel();
                return Task.CompletedTask;
            });
            Expect<OperationCanceledException>(() => new PptContentLoader(canceled).Load(input, cancel.Token));
            Check(!Directory.Exists(workDirectory), "canceled conversion cleanup / no stale result");
            Expect<OperationCanceledException>(() => new PptContentLoader(missing).Load(input, cancel.Token));
            var noOutput = new PowerPointConverter(() => true, (_, _, _) => Task.CompletedTask);
            Expect<InvalidDataException>(() => new PptContentLoader(noOutput).Load(input, CancellationToken.None), "PDF");
            File.WriteAllText(input, "");
            Expect<InvalidDataException>(() => new PptContentLoader(missing).Load(input, CancellationToken.None), "为空");
            using (var oversized = File.OpenWrite(input)) oversized.SetLength(100L * 1024 * 1024 + 1);
            Expect<InvalidDataException>(() => new PptContentLoader(missing).Load(input, CancellationToken.None), "100 MB");
        }
        finally { File.Delete(input); }
    }

    // Optional integration: creates only test-owned presentations and keeps one open
    // during conversion to verify the worker does not quit another Office session.
    public static void OfficeIntegration(string? portableExecutable = null)
    {
        string directory = Path.Combine(Path.GetTempPath(), "LoopScroller-office-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        object? app = null, presentations = null, deck = null, slides = null;
        try
        {
            app = Activator.CreateInstance(Type.GetTypeFromProgID("PowerPoint.Application")
                ?? throw new Exception("PowerPoint is not installed"));
            presentations = ((dynamic)app!).Presentations;
            deck = ((dynamic)presentations).Add(0);
            slides = ((dynamic)deck).Slides;
            for (int i = 1; i <= 3; i++)
            {
                object slide = ((dynamic)slides).Add(i, 12);
                object transition = ((dynamic)slide).SlideShowTransition;
                if (i == 2) ((dynamic)transition).Hidden = -1;
                Marshal.FinalReleaseComObject(transition);
                object shapes = ((dynamic)slide).Shapes;
                object shape = ((dynamic)shapes).AddTextbox(1, 30f, 30f, 500f, 100f);
                object frame = ((dynamic)shape).TextFrame;
                object range = ((dynamic)frame).TextRange;
                ((dynamic)range).Text = $"中文幻灯片 {i} / PowerPoint playback test";
                object font = ((dynamic)range).Font;
                ((dynamic)font).Size = 32;
                foreach (var value in new[] { font, range, frame, shape, shapes }) Marshal.FinalReleaseComObject(value);
                Marshal.FinalReleaseComObject(slide);
            }
            foreach (var (extension, format) in new[] { (".pptx", 24), (".ppt", 1) })
            {
                string path = Path.Combine(directory, "中文 宽屏演示" + extension);
                ((dynamic)deck).SaveAs(path, format);
                Console.WriteLine("Office fixture saved: " + extension);
                var before = SHA256.HashData(File.ReadAllBytes(path));
                var loader = portableExecutable is null ? new PptContentLoader()
                    : new PptContentLoader(new PowerPointConverter(() => true, async (snapshot, work, token) =>
                    {
                        var start = new ProcessStartInfo(portableExecutable) { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden };
                        foreach (var arg in new[] { PowerPointWorker.Switch, snapshot, work, Environment.ProcessId.ToString() }) start.ArgumentList.Add(arg);
                        using var worker = Process.Start(start)!;
                        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(2));
                        using var linked = CancellationTokenSource.CreateLinkedTokenSource(token, timeout.Token);
                        await PowerPointConverter.MonitorWorkerAsync(worker, work, token, linked.Token);
                    }));
                var result = loader.Load(path, CancellationToken.None);
                Console.WriteLine("Office conversion returned: " + extension);
                Check(result.Title == Path.GetFileName(path), "Office conversion retains source title");
                using var source = new PdfRenderSource(result.Blocks.OfType<DisplayPdf>().Single().Data,
                    320, 1, new DpiScale(1, 1), CancellationToken.None);
                Check(source.BlockStarts.Length == 3, "hidden slide excluded / two output pages plus end boundary");
                var visual = new DrawingVisual();
                using (var context = visual.RenderOpen()) source.Draw(context, new Rect(0, 0, 320, source.BlockStarts[1]), CancellationToken.None);
                var bitmap = new RenderTargetBitmap(320, (int)Math.Ceiling(source.BlockStarts[1]), 96, 96, PixelFormats.Pbgra32);
                bitmap.Render(visual);
                var pixels = new byte[bitmap.PixelWidth * bitmap.PixelHeight * 4];
                bitmap.CopyPixels(pixels, bitmap.PixelWidth * 4, 0);
                Check(Enumerable.Range(0, pixels.Length / 4).Count(index => pixels[index * 4 + 3] > 0 && pixels[index * 4] < 200) > 100,
                    "converted slide text must render into visible pixels");
                string qa = Path.Combine(AppContext.BaseDirectory, "qa");
                Directory.CreateDirectory(qa);
                var encoder = new PngBitmapEncoder();
                encoder.Frames.Add(BitmapFrame.Create(bitmap));
                using (var output = File.Create(Path.Combine(qa, "powerpoint" + extension + ".png"))) encoder.Save(output);
                Check(before.SequenceEqual(SHA256.HashData(File.ReadAllBytes(path))), "original Office file unchanged");
                Check((int)((dynamic)slides).Count == 3, "original presentation remains open");
                Console.WriteLine("PASS  PowerPoint actual conversion " + extension);
            }
        }
        finally
        {
            try
            {
                if (deck is not null) ((dynamic)deck).Close();
                if (app is not null && presentations is not null && (int)((dynamic)presentations).Count == 0 && (int)((dynamic)app).Visible == 0)
                    ((dynamic)app).Quit();
            }
            catch (COMException exception) { Console.WriteLine("Office fixture cleanup: " + exception.Message); }
            foreach (var value in new[] { slides, deck, presentations, app })
                if (value is not null) Marshal.FinalReleaseComObject(value);
            Directory.Delete(directory, true);
        }
    }

    private static void Check(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
    }

    private static void Expect<T>(Action action, string? message = null) where T : Exception
    {
        try { action(); }
        catch (T exception)
        {
            if (message is not null) Check(exception.Message.Contains(message), "friendly error: " + exception.Message);
            return;
        }
        throw new Exception("Expected " + typeof(T).Name);
    }
}
