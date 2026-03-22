using System.Windows;
using System.Windows.Input;
using Microsoft.Xaml.Behaviors;

namespace GIFcut.Behaviors;

public class MouseEventBehavior : Behavior<UIElement>
{
    public static readonly DependencyProperty LeftButtonDownCommandProperty =
        DependencyProperty.Register(nameof(LeftButtonDownCommand), typeof(ICommand), typeof(MouseEventBehavior));

    public ICommand LeftButtonDownCommand
    {
        get => (ICommand)GetValue(LeftButtonDownCommandProperty);
        set => SetValue(LeftButtonDownCommandProperty, value);
    }

    public static readonly DependencyProperty LeftButtonUpCommandProperty =
        DependencyProperty.Register(nameof(LeftButtonUpCommand), typeof(ICommand), typeof(MouseEventBehavior));

    public ICommand LeftButtonUpCommand
    {
        get => (ICommand)GetValue(LeftButtonUpCommandProperty);
        set => SetValue(LeftButtonUpCommandProperty, value);
    }

    public static readonly DependencyProperty MouseMoveCommandProperty =
        DependencyProperty.Register(nameof(MouseMoveCommand), typeof(ICommand), typeof(MouseEventBehavior));

    public ICommand MouseMoveCommand
    {
        get => (ICommand)GetValue(MouseMoveCommandProperty);
        set => SetValue(MouseMoveCommandProperty, value);
    }

    protected override void OnAttached()
    {
        base.OnAttached();
        AssociatedObject.MouseLeftButtonDown += OnMouseLeftButtonDown;
        AssociatedObject.MouseLeftButtonUp += OnMouseLeftButtonUp;
        AssociatedObject.MouseMove += OnMouseMove;
    }

    protected override void OnDetaching()
    {
        base.OnDetaching();
        AssociatedObject.MouseLeftButtonDown -= OnMouseLeftButtonDown;
        AssociatedObject.MouseLeftButtonUp -= OnMouseLeftButtonUp;
        AssociatedObject.MouseMove -= OnMouseMove;
    }

    private void OnMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (LeftButtonDownCommand?.CanExecute(e) == true)
        {
            LeftButtonDownCommand.Execute(e);
            e.Handled = true;
        }
    }

    private void OnMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (LeftButtonUpCommand?.CanExecute(e) == true)
        {
            LeftButtonUpCommand.Execute(e);
            e.Handled = true;
        }
    }

    private void OnMouseMove(object sender, MouseEventArgs e)
    {
        if (e.LeftButton == MouseButtonState.Pressed && MouseMoveCommand?.CanExecute(e) == true)
        {
            MouseMoveCommand.Execute(e);
            e.Handled = true;
        }
    }
}
