namespace Ours.Application.Abstractions;

/// <summary>
/// Resolves the authenticated caller from the current request. Application services use
/// this instead of trusting any userId/coupleId the client might send in a request body.
/// </summary>
public interface ICurrentUserService
{
    bool IsAuthenticated { get; }
    Guid UserId { get; }
    Guid? CoupleId { get; }
}
