namespace MathArchive.Application.Documents;

public sealed class MaterialFileNotFoundException(Guid documentId) : Exception("The file associated with this material is unavailable.")
{
    public Guid DocumentId { get; } = documentId;
}
