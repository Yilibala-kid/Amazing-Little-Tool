namespace LoopScroller.Loaders;

internal static class ContentFile
{
    // Read a bounded snapshot from one handle; all byte-based loaders share the
    // same size check, cancellation and short-read handling.
    internal static byte[] Read(string path, long maxBytes, string sizeError, CancellationToken token)
    {
        token.ThrowIfCancellationRequested();
        using var stream = File.OpenRead(path);
        if (stream.Length > maxBytes) throw new InvalidDataException(sizeError);
        var bytes = new byte[checked((int)stream.Length)];
        stream.ReadExactlyAsync(bytes, token).AsTask().GetAwaiter().GetResult();
        token.ThrowIfCancellationRequested();
        return bytes;
    }
}
