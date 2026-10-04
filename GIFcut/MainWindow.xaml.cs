using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using GIFcut.ViewModels;

namespace GIFcut;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        DataContext = new MainViewModel();
        Loaded += MainWindow_Loaded;
    }

    private void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        if (DataContext is MainViewModel vm)
        {
            vm.CropCanvas = cropCanvas;
        }
    }

    private void Thumbnail_Click(object sender, MouseButtonEventArgs e)
    {
        if (sender is Image { DataContext: System.Windows.Media.Imaging.BitmapSource bitmap } &&
            DataContext is MainViewModel vm)
        {
            var index = vm.Thumbnails.IndexOf(bitmap);
            if (index >= 0) vm.SelectFrameCommand.Execute(index);
        }
    }

    private void SpeedComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (sender is ComboBox comboBox && DataContext is MainViewModel vm)
        {
            double[] speeds = { 0.5, 1.0, 1.5, 2.0, 3.0 };
            if (comboBox.SelectedIndex >= 0 && comboBox.SelectedIndex < speeds.Length)
            {
                vm.Speed = speeds[comboBox.SelectedIndex];
            }
        }
    }

    protected override void OnClosed(EventArgs e)
    {
        if (DataContext is MainViewModel vm)
        {
            vm.Cleanup();
        }
        base.OnClosed(e);
    }
}
