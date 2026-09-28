using System.Diagnostics;
using LoopScroller.Models;

namespace LoopScroller.Loaders;

// COM runs in a separate STA process, so a blocked Office call cannot hang the player.
internal sealed class PowerPointConverter : IPresentationConverter
{
    internal const string MissingPowerPoint = "打开 PPT / PPTX 需要安装 Microsoft PowerPoint 桌面版。也可以先用 PowerPoint 或 WPS 导出 PDF，再用本程序打开。";
    private static readonly SemaphoreSlim ConversionGate = new(1, 1);
    private readonly Func<bool> _isAvailable;
    private readonly Func<string, string, CancellationToken, Task> _runWorker;

    public PowerPointConverter() : this(
        () => Type.GetTypeFromProgID("PowerPoint.Application") is not null, RunWorkerAsync) { }

    internal PowerPointConverter(Func<bool> isAvailable,
        Func<string, string, CancellationToken, Task> runWorker)
    {
        _isAvailable = isAvailable;
        _runWorker = runWorker;
    }

    public DisplayDocument Convert(string path, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!_isAvailable()) throw new NotSupportedException(MissingPowerPoint);
        string directory = Path.Combine(Path.GetTempPath(), "LoopScroller-PPT", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        try
        {
            // Office may reuse an already-open presentation by path. Open a private
            // snapshot so closing our copy can never close the user's document.
            string snapshot = Path.Combine(directory, "source" + Path.GetExtension(path));
            using (var input = File.OpenRead(path))
            using (var output = File.Create(snapshot))
                input.CopyToAsync(output, cancellationToken).GetAwaiter().GetResult();
            _runWorker(snapshot, directory, cancellationToken).GetAwaiter().GetResult();
            cancellationToken.ThrowIfCancellationRequested();
            string pdf = Path.Combine(directory, "slides.pdf");
            if (!File.Exists(pdf)) throw new InvalidDataException("PowerPoint 未生成可播放的 PDF，请先手动导出 PDF 后打开。");
            return new PdfContentLoader().Load(pdf, cancellationToken);
        }
        finally
        {
            // Only this request's randomly named directory is ever removed.
            try { Directory.Delete(directory, recursive: true); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }

    private static async Task RunWorkerAsync(string path, string directory, CancellationToken token)
    {
        // PowerPoint automation may share one application instance. Do not overlap
        // requests while the previous worker is restoring application settings.
        await ConversionGate.WaitAsync(token).ConfigureAwait(false);
        try { await RunExclusiveWorkerAsync(path, directory, token).ConfigureAwait(false); }
        finally { ConversionGate.Release(); }
    }

    private static async Task RunExclusiveWorkerAsync(string path, string directory, CancellationToken token)
    {
        // The assembly location is empty in the portable single-file build.
#pragma warning disable IL3000
        string assemblyPath = typeof(App).Assembly.Location;
#pragma warning restore IL3000
        string executable = string.IsNullOrEmpty(assemblyPath)
            ? Environment.ProcessPath!
            : Path.ChangeExtension(assemblyPath, ".exe");
        var start = new ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden };
        start.ArgumentList.Add(PowerPointWorker.Switch);
        start.ArgumentList.Add(path);
        start.ArgumentList.Add(directory);
        start.ArgumentList.Add(Environment.ProcessId.ToString(System.Globalization.CultureInfo.InvariantCulture));
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(2));
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(token, timeout.Token);
        linked.Token.ThrowIfCancellationRequested();
        using var process = Process.Start(start) ?? throw new InvalidDataException("无法启动演示文稿转换，请先导出 PDF 后打开。");
        await MonitorWorkerAsync(process, directory, token, linked.Token).ConfigureAwait(false);
    }

    internal static async Task MonitorWorkerAsync(Process process, string directory, CancellationToken token, CancellationToken stopToken)
    {
        try
        {
            await process.WaitForExitAsync(stopToken).ConfigureAwait(false);
            token.ThrowIfCancellationRequested();
            if (process.ExitCode != 0)
            {
                string errorFile = Path.Combine(directory, "error.txt");
                throw new InvalidDataException(File.Exists(errorFile)
                    ? File.ReadAllText(errorFile)
                    : "PowerPoint 转换失败。请检查文件能否在 PowerPoint 中正常打开，或先手动导出 PDF。");
            }
        }
        catch (OperationCanceledException)
        {
            // Give completed COM calls a chance to close our presentation normally.
            File.WriteAllText(Path.Combine(directory, "cancel"), string.Empty);
            if (!process.HasExited)
                await Task.WhenAny(process.WaitForExitAsync(), Task.Delay(1500)).ConfigureAwait(false);
            if (!process.HasExited)
            {
                // Never terminate POWERPNT: it may also contain the user's open documents.
                process.Kill();
                await process.WaitForExitAsync().ConfigureAwait(false);
            }
            token.ThrowIfCancellationRequested();
            throw new InvalidDataException("PowerPoint 转换超过 2 分钟，已停止等待。请关闭 PowerPoint 中的提示窗口，或先手动导出 PDF 后打开。");
        }
    }
}
