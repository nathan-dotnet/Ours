using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Ours.Application.Abstractions;
using Ours.Application.Common;

namespace Ours.Infrastructure.Services;

public class CurrentUserService(IHttpContextAccessor httpContextAccessor) : ICurrentUserService
{
    private ClaimsPrincipal? Principal => httpContextAccessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated ?? false;

    public Guid UserId
    {
        get
        {
            var value = Principal?.FindFirstValue(ClaimTypes.NameIdentifier) ?? Principal?.FindFirstValue("sub");
            if (value is null || !Guid.TryParse(value, out var id))
            {
                throw new UnauthorizedAppException("No authenticated user on the current request.");
            }
            return id;
        }
    }

    public Guid? CoupleId
    {
        get
        {
            var value = Principal?.FindFirstValue("coupleId");
            return value is not null && Guid.TryParse(value, out var id) ? id : null;
        }
    }
}
