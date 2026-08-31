using FluentValidation;
using FluentValidation.Results;
using MathArchive.Application.Common;
using MathArchive.Domain.Analytics;

namespace MathArchive.Application.Analytics;

public sealed class RecordAnalyticsEventValidator : AbstractValidator<RecordAnalyticsEvent>
{
    public RecordAnalyticsEventValidator()
    {
        RuleFor(x => x.SessionId).NotEmpty();
        RuleFor(x => x.EventType).IsInEnum();
        RuleFor(x => x.DocumentId).Null().When(x => x.EventType == AnalyticsEventType.SiteVisit);
        RuleFor(x => x.DocumentId).NotNull().NotEqual(Guid.Empty)
            .When(x => x.EventType is AnalyticsEventType.DocumentPreview or AnalyticsEventType.DocumentDownload);
    }
}

public sealed class AnalyticsService(IAnalyticsRepository repository, IClock clock, IValidator<RecordAnalyticsEvent> validator)
{
    public async Task RecordAsync(RecordAnalyticsEvent request, CancellationToken cancellationToken)
    {
        await validator.ValidateAndThrowAsync(request, cancellationToken);
        if (request.DocumentId is { } id && !await repository.DocumentExistsAsync(id, cancellationToken))
        {
            throw new ValidationException([new ValidationFailure(nameof(request.DocumentId), "Document does not exist.")]);
        }

        await repository.AddAsync(new AnalyticsEvent(request.SessionId, request.EventType, request.DocumentId, clock.UtcNow), cancellationToken);
    }

    public Task<AnalyticsReport> GetReportAsync(DateTimeOffset? from, DateTimeOffset? to, CancellationToken cancellationToken)
    {
        // The client sends local midnight boundaries converted independently to UTC; 'to' is exclusive.
        if (from is null || to is null || from >= to)
        {
            throw new ValidationException([new ValidationFailure("period", "Provide from and to timestamps with from earlier than to (exclusive).")]);
        }

        return repository.GetReportAsync(from.Value.ToUniversalTime(), to.Value.ToUniversalTime(), cancellationToken);
    }
}
