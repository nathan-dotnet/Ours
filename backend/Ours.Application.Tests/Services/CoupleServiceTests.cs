using Ours.Application.Common;
using Ours.Application.DTOs.Couples;
using Ours.Application.Services;
using Ours.Application.Tests.Fakes;
using Ours.Domain.Entities;
using Xunit;

namespace Ours.Application.Tests.Services;

public class CoupleServiceTests
{
    private static (CoupleService Service, Infrastructure.Persistence.AppDbContext Db, FakeCurrentUserService CurrentUser) Build()
    {
        var db = TestDbContextFactory.Create();
        var currentUser = new FakeCurrentUserService();
        var authService = new AuthService(new FakeIdentityService(), db, new FakeJwtTokenService(), new FakeDateTimeProvider());
        var service = new CoupleService(db, currentUser, new FakeInviteCodeGenerator(), new FakeDateTimeProvider(), authService);
        return (service, db, currentUser);
    }

    private static async Task<ApplicationUser> AddUserAsync(Infrastructure.Persistence.AppDbContext db, string displayName)
    {
        var user = new ApplicationUser { Id = Guid.NewGuid(), Email = $"{displayName}@test.com", UserName = $"{displayName}@test.com", DisplayName = displayName };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    [Fact]
    public async Task CreateAsync_CreatesCoupleWithCreatorAsSoleMember()
    {
        var (service, db, currentUser) = Build();
        var alice = await AddUserAsync(db, "Alice");
        currentUser.UserId = alice.Id;

        var result = await service.CreateAsync();

        Assert.StartsWith("OURS-", result.Couple.InviteCode);
        Assert.Single(result.Couple.Members);
        Assert.Equal(alice.Id, result.Couple.Members[0].UserId);
        var persistedAlice = await db.Users.FindAsync(alice.Id);
        Assert.Equal(result.Couple.Id, persistedAlice!.CoupleId);
        Assert.NotNull(result.Auth);
    }

    [Fact]
    public async Task CreateAsync_WhenUserAlreadyInCouple_Throws()
    {
        var (service, db, currentUser) = Build();
        var alice = await AddUserAsync(db, "Alice");
        currentUser.UserId = alice.Id;
        await service.CreateAsync();

        await Assert.ThrowsAsync<ConflictAppException>(() => service.CreateAsync());
    }

    [Fact]
    public async Task JoinAsync_AddsSecondMember_WithoutDuplicatingIt()
    {
        var (service, db, currentUser) = Build();
        var alice = await AddUserAsync(db, "Alice");
        currentUser.UserId = alice.Id;
        var created = await service.CreateAsync();

        var bob = await AddUserAsync(db, "Bob");
        currentUser.UserId = bob.Id;
        var joined = await service.JoinAsync(new JoinCoupleRequestDto { InviteCode = created.Couple.InviteCode });

        Assert.Equal(2, joined.Couple.Members.Count);
        Assert.Contains(joined.Couple.Members, m => m.UserId == bob.Id);
        Assert.Contains(joined.Couple.Members, m => m.UserId == alice.Id);
    }

    [Fact]
    public async Task JoinAsync_WhenCoupleAlreadyHasTwoMembers_Throws()
    {
        var (service, db, currentUser) = Build();
        var alice = await AddUserAsync(db, "Alice");
        currentUser.UserId = alice.Id;
        var created = await service.CreateAsync();

        var bob = await AddUserAsync(db, "Bob");
        currentUser.UserId = bob.Id;
        await service.JoinAsync(new JoinCoupleRequestDto { InviteCode = created.Couple.InviteCode });

        var carol = await AddUserAsync(db, "Carol");
        currentUser.UserId = carol.Id;

        await Assert.ThrowsAsync<ConflictAppException>(
            () => service.JoinAsync(new JoinCoupleRequestDto { InviteCode = created.Couple.InviteCode }));
    }

    [Fact]
    public async Task JoinAsync_WithUnknownInviteCode_ThrowsNotFound()
    {
        var (service, db, currentUser) = Build();
        var bob = await AddUserAsync(db, "Bob");
        currentUser.UserId = bob.Id;

        await Assert.ThrowsAsync<NotFoundAppException>(
            () => service.JoinAsync(new JoinCoupleRequestDto { InviteCode = "OURS-NOPE" }));
    }
}
