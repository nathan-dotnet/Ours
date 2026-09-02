using Ours.Application.Abstractions;

namespace Ours.Application.Tests.Fakes;

public class FakeCurrentUserService : ICurrentUserService
{
    public bool IsAuthenticated { get; set; } = true;
    public Guid UserId { get; set; }
    public Guid? CoupleId { get; set; }
}
