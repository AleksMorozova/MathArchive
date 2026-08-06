namespace MathArchive.Application.Common;

public interface IClock
{
    DateTimeOffset UtcNow { get; }
}
