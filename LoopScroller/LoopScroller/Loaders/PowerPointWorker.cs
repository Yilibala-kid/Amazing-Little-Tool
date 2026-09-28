using System.Diagnostics;
using System.Runtime.InteropServices;

namespace LoopScroller.Loaders;

internal static class PowerPointWorker
{
    internal const string Switch = "--convert-ppt";

    // Called on WPF's STA startup thread before any player window is constructed.
    internal static int Run(string[] args)
    {
        if (args.Length != 4 || !int.TryParse(args[3], out int parentId)) return 2;
        string directory = args[2];
        if (!Directory.Exists(directory)) return 2;
        using var parent = Process.GetProcessById(parentId);
        var elapsed = Stopwatch.StartNew();
        using var watchdog = new Timer(_ =>
        {
            if (parent.HasExited || elapsed.Elapsed > TimeSpan.FromSeconds(125)) Environment.Exit(2);
        }, null, 1000, 1000);

        object? application = null, presentations = null, presentation = null;
        object? slides = null, printOptions = null, ranges = null, printRange = null;
        int? security = null, alerts = null;
        try
        {
            CheckCanceled();
            var type = Type.GetTypeFromProgID("PowerPoint.Application")
                ?? throw new NotSupportedException(PowerPointConverter.MissingPowerPoint);
            application = Activator.CreateInstance(type)
                ?? throw new InvalidOperationException("无法启动 Microsoft PowerPoint。");
            dynamic app = application;
            security = (int)app.AutomationSecurity;
            alerts = (int)app.DisplayAlerts;
            app.DisplayAlerts = 1; // ppAlertsNone
            presentations = app.Presentations;
            CheckCanceled();
            app.AutomationSecurity = 3; // msoAutomationSecurityForceDisable
            try
            {
                // Read-only, untitled copy, hidden window; never alter the source or
                // close an already-open presentation belonging to the user.
                presentation = ((dynamic)presentations).Open(Path.GetFullPath(args[1]), -1, -1, 0);
            }
            finally { app.AutomationSecurity = security.Value; }
            CheckCanceled();
            slides = ((dynamic)presentation).Slides;
            int slideCount = (int)((dynamic)slides).Count;
            if (slideCount == 0) throw new InvalidDataException("演示文稿中没有幻灯片。");
            printOptions = ((dynamic)presentation).PrintOptions;
            ranges = ((dynamic)printOptions).Ranges;
            printRange = ((dynamic)ranges).Add(1, slideCount);
            // PDF, print quality, no frame, slide pages, exclude hidden slides, all pages.
            // Late-bound COM cannot marshal a C# null to PowerPoint's PrintRange;
            // supply a real range even though ppPrintAll selects the entire deck.
            ((dynamic)presentation).ExportAsFixedFormat(Path.Combine(directory, "slides.pdf"),
                2, 2, 0, 1, 1, 0, printRange, 1, "", false, true, true, true, false);
            CheckCanceled();
            return 0;
        }
        catch (OperationCanceledException) { return 3; }
        catch (Exception exception)
        {
            string message = exception is NotSupportedException ? exception.Message
                : "PowerPoint 无法转换此演示文稿。请确认 PowerPoint 已激活、文件未损坏且无需密码，并处理可能出现的提示；也可以先手动导出 PDF 后打开。\nPowerPoint 提示：" + exception.Message;
            try { File.WriteAllText(Path.Combine(directory, "error.txt"), message); }
            catch (IOException) { }
            return 1;
        }
        finally
        {
            Release(printRange);
            Release(ranges);
            Release(printOptions);
            Release(slides);
            try { if (presentation is not null) ((dynamic)presentation).Close(); }
            catch (COMException) { }
            Release(presentation);
            if (application is not null)
            {
                try
                {
                    dynamic app = application;
                    if (security.HasValue) app.AutomationSecurity = security.Value;
                    if (alerts.HasValue) app.DisplayAlerts = alerts.Value;
                    // Do not quit a visible application or one containing other documents.
                    if (presentations is not null && (int)((dynamic)presentations).Count == 0 && (int)app.Visible == 0)
                        app.Quit();
                }
                catch (COMException) { }
            }
            Release(presentations);
            Release(application);
        }

        void CheckCanceled()
        {
            if (parent.HasExited || File.Exists(Path.Combine(directory, "cancel")))
                throw new OperationCanceledException();
        }
    }

    private static void Release(object? value)
    {
        if (value is not null && Marshal.IsComObject(value)) Marshal.FinalReleaseComObject(value);
    }
}
