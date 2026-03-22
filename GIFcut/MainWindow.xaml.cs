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
        if (sender is Image img && img.DataContext is System.Windows.Media.Imaging.BitmapSource)
        {
            var itemsControl = FindParent<ItemsControl>(img);
            if (itemsControl?.ItemsSource is System.Collections.IEnumerable items)
            {
                int index = 0;
                foreach (var item in items)
                {
                    if (item == img.DataContext)
                    {
                        if (DataContext is MainViewModel vm)
                        {
                            vm.SelectFrameCommand.Execute(index);
                        }
                        return;
                    }
                    index++;
                }
            }
        }
    }

    private static T? FindParent<T>(DependencyObject child) where T : DependencyObject
    {
        var parent = System.Windows.Media.VisualTreeHelper.GetParent(child);
        while (parent != null)
        {
            if (parent is T t) return t;
            parent = System.Windows.Media.VisualTreeHelper.GetParent(parent);
        }
        return null;
    }

    private void OnHandleMouseDown(object sender, MouseButtonEventArgs e)
    {
        // 手柄点击由父级 Canvas 的 Behavior 处理
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
