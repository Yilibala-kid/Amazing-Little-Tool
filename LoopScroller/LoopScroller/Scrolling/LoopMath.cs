namespace LoopScroller.Scrolling;

public static class LoopMath
{
    public static double Advance(double offset, double speed, double elapsedSeconds, double cycleHeight)
    {
        if (cycleHeight <= 0) return 0;
        if (elapsedSeconds <= 0) return Normalize(offset, cycleHeight);

        return Normalize(offset + Math.Max(0, speed) * elapsedSeconds, cycleHeight);
    }

    public static double Normalize(double offset, double cycleHeight)
    {
        if (cycleHeight <= 0) return 0;
        var normalized = offset % cycleHeight;
        return normalized < 0 ? normalized + cycleHeight : normalized;
    }
}
