using LoopScroller.Models;

namespace LoopScroller.Loaders;

public interface IContentLoader
{
    string Name { get; }
    IReadOnlyList<string> Extensions { get; }

    DisplayDocument Load(string path, CancellationToken cancellationToken);
}
