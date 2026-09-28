using System.Windows;

namespace LoopScroller;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        if (e.Args.FirstOrDefault() == Loaders.PowerPointWorker.Switch)
        {
            Shutdown(Loaders.PowerPointWorker.Run(e.Args));
            return;
        }

        var window = new MainWindow();
        MainWindow = window;

        if (e.Args.Length > 0)
        {
            var path = e.Args[0];
            window.Loaded += async (_, _) => await window.LoadFileAsync(path);
        }
        window.Show();
    }
}
