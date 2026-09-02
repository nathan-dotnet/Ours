namespace Ours.Application.Common;

/// <summary>
/// Base for application-layer errors that a middleware in the API layer translates into
/// HTTP responses, so controllers stay free of status-code decisions and business logic
/// stays testable without ASP.NET in the loop.
/// </summary>
public abstract class AppException(string message) : Exception(message);

public sealed class ValidationAppException(string message) : AppException(message);

public sealed class ConflictAppException(string message) : AppException(message);

public sealed class NotFoundAppException(string message) : AppException(message);

public sealed class ForbiddenAppException(string message) : AppException(message);

public sealed class UnauthorizedAppException(string message) : AppException(message);
