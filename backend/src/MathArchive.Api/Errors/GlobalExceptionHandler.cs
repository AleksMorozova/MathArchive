using FluentValidation;
using MathArchive.Application.Documents;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace MathArchive.Api.Errors;

public sealed class GlobalExceptionHandler(
    IProblemDetailsService problemDetailsService,
    ILogger<GlobalExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var problemDetails = CreateProblemDetails(httpContext, exception);
        var isExpected = IsExpected(exception);

        if (exception is OperationCanceledException)
        {
            logger.LogDebug("Request {TraceId} was canceled.", httpContext.TraceIdentifier);
        }
        else if (!isExpected)
        {
            logger.LogError(exception, "Unhandled exception while processing request {TraceId}.", httpContext.TraceIdentifier);
        }

        httpContext.Response.StatusCode = problemDetails.Status ?? StatusCodes.Status500InternalServerError;
        await problemDetailsService.WriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problemDetails,
            Exception = exception
        });

        return true;
    }

    private static ProblemDetails CreateProblemDetails(HttpContext httpContext, Exception exception)
    {
        var problemDetails = exception switch
        {
            ValidationException validationException => CreateValidationProblemDetails(validationException),
            MaterialFileNotFoundException => new ProblemDetails
            {
                Type = "https://tools.ietf.org/html/rfc9110#section-15.5.5",
                Title = "Material file not found",
                Status = StatusCodes.Status404NotFound,
                Detail = "The file associated with this material is unavailable."
            },
            BadHttpRequestException => new ProblemDetails
            {
                Type = "https://tools.ietf.org/html/rfc9110#section-15.5.1",
                Title = "Bad request",
                Status = StatusCodes.Status400BadRequest,
                Detail = "The request could not be processed."
            },
            DbUpdateConcurrencyException => CreateConflict(),
            DbUpdateException dbUpdateException when IsUniqueConstraintViolation(dbUpdateException) => CreateConflict(),
            OperationCanceledException => new ProblemDetails
            {
                Type = "about:blank",
                Title = "Request canceled",
                Status = StatusCodes.Status499ClientClosedRequest,
                Detail = "The request was canceled before it could be completed."
            },
            DbUpdateException => CreateInternalServerError(),
            IOException => CreateInternalServerError(),
            UnauthorizedAccessException => CreateInternalServerError(),
            _ => CreateInternalServerError()
        };

        problemDetails.Instance = httpContext.Request.Path;
        problemDetails.Extensions["traceId"] = httpContext.TraceIdentifier;
        return problemDetails;
    }

    private static ValidationProblemDetails CreateValidationProblemDetails(ValidationException exception)
    {
        var errors = exception.Errors
            .GroupBy(error => error.PropertyName)
            .ToDictionary(
                group => string.IsNullOrWhiteSpace(group.Key) ? "request" : group.Key,
                group => group.Select(error => error.ErrorMessage).ToArray());

        return new ValidationProblemDetails(errors)
        {
            Type = "https://tools.ietf.org/html/rfc9110#section-15.5.1",
            Title = "One or more validation errors occurred.",
            Status = StatusCodes.Status400BadRequest,
            Detail = "The request contains validation errors."
        };
    }

    private static ProblemDetails CreateConflict()
    {
        return new ProblemDetails
        {
            Type = "https://tools.ietf.org/html/rfc9110#section-15.5.10",
            Title = "Conflict",
            Status = StatusCodes.Status409Conflict,
            Detail = "The requested operation conflicts with the current resource state."
        };
    }

    private static bool IsUniqueConstraintViolation(DbUpdateException exception)
    {
        return exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation };
    }

    private static ProblemDetails CreateInternalServerError()
    {
        return new ProblemDetails
        {
            Type = "https://tools.ietf.org/html/rfc9110#section-15.6.1",
            Title = "An error occurred while processing your request.",
            Status = StatusCodes.Status500InternalServerError,
            Detail = "An unexpected server error occurred."
        };
    }

    private static bool IsExpected(Exception exception)
    {
        return exception is ValidationException
            or MaterialFileNotFoundException
            or BadHttpRequestException
            or DbUpdateConcurrencyException
            or OperationCanceledException
            || exception is DbUpdateException dbUpdateException && IsUniqueConstraintViolation(dbUpdateException);
    }
}