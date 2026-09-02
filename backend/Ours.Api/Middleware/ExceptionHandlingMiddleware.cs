using System.Net;
using System.Text.Json;
using Ours.Application.Common;

namespace Ours.Api.Middleware;

/// <summary>
/// Translates <see cref="AppException"/> subtypes raised by Application services into the
/// matching HTTP status code + a small, consistent JSON error body. Keeps that mapping out
/// of controllers entirely.
/// </summary>
public class ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger, IHostEnvironment env)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (AppException ex)
        {
            var statusCode = ex switch
            {
                ValidationAppException => HttpStatusCode.BadRequest,
                UnauthorizedAppException => HttpStatusCode.Unauthorized,
                ForbiddenAppException => HttpStatusCode.Forbidden,
                NotFoundAppException => HttpStatusCode.NotFound,
                ConflictAppException => HttpStatusCode.Conflict,
                _ => HttpStatusCode.BadRequest,
            };

            logger.LogWarning(ex, "Handled application exception: {Message}", ex.Message);

            context.Response.StatusCode = (int)statusCode;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(JsonSerializer.Serialize(new { error = ex.Message }));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unhandled exception");
            context.Response.StatusCode = (int)HttpStatusCode.InternalServerError;
            context.Response.ContentType = "application/json";
            var message = env.IsDevelopment() ? ex.ToString() : "An unexpected error occurred.";
            await context.Response.WriteAsync(JsonSerializer.Serialize(new { error = message }));
        }
    }
}
