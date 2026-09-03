using Microsoft.Extensions.Options;
using Ours.Application.Abstractions;
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
        var authService = new AuthService(
            new FakeIdentityService(), db, new FakeJwtTokenService(), new FakeDateTimeProvider(),
            new FakeEmailService(), Options.Create(new AppOptions()));
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

    [Fact]
    public async Task LeaveAsync_WhenNotInACouple_IsAnIdempotentNoOp()
    {
        var (service, db, currentUser) = Build();
        var alice = await AddUserAsync(db, "Alice");
        currentUser.UserId = alice.Id;

        var result = await service.LeaveAsync();

        Assert.True(result.Success);
        Assert.False(result.Left);
    }

    [Fact]
    public async Task LeaveAsync_EndsTheCoupleForBothMembers()
    {
        var (service, db, currentUser) = Build();
        var alice = await AddUserAsync(db, "Alice");
        currentUser.UserId = alice.Id;
        var created = await service.CreateAsync();

        var bob = await AddUserAsync(db, "Bob");
        currentUser.UserId = bob.Id;
        await service.JoinAsync(new JoinCoupleRequestDto { InviteCode = created.Couple.InviteCode });

        currentUser.UserId = alice.Id;
        var result = await service.LeaveAsync();

        Assert.True(result.Success);
        Assert.True(result.Left);

        var persistedAlice = await db.Users.FindAsync(alice.Id);
        var persistedBob = await db.Users.FindAsync(bob.Id);
        Assert.Null(persistedAlice!.CoupleId);
        Assert.Null(persistedBob!.CoupleId); // the partner too, not just whoever called Leave

        var couple = await db.Couples.FindAsync(created.Couple.Id);
        Assert.True(couple!.IsDeleted);

        var members = db.CoupleMembers.Where(m => m.CoupleId == created.Couple.Id).ToList();
        Assert.Equal(2, members.Count);
        Assert.All(members, m => Assert.NotNull(m.LeftAt));
    }

    [Fact]
    public async Task LeaveAsync_DoesNotDeleteEitherUserAccount()
    {
        var (service, db, currentUser) = Build();
        var alice = await AddUserAsync(db, "Alice");
        currentUser.UserId = alice.Id;
        var created = await service.CreateAsync();
        var bob = await AddUserAsync(db, "Bob");
        currentUser.UserId = bob.Id;
        await service.JoinAsync(new JoinCoupleRequestDto { InviteCode = created.Couple.InviteCode });

        currentUser.UserId = alice.Id;
        await service.LeaveAsync();

        Assert.NotNull(await db.Users.FindAsync(alice.Id));
        Assert.NotNull(await db.Users.FindAsync(bob.Id));
    }

    [Fact]
    public async Task LeaveAsync_CalledTwice_SecondCallIsAlsoAnIdempotentNoOp()
    {
        var (service, db, currentUser) = Build();
        var alice = await AddUserAsync(db, "Alice");
        currentUser.UserId = alice.Id;
        await service.CreateAsync();

        await service.LeaveAsync();
        var secondResult = await service.LeaveAsync();

        Assert.True(secondResult.Success);
        Assert.False(secondResult.Left);
    }

    [Fact]
    public async Task LeaveAsync_OldInviteCodeCanNoLongerBeUsedToJoin()
    {
        var (service, db, currentUser) = Build();
        var alice = await AddUserAsync(db, "Alice");
        currentUser.UserId = alice.Id;
        var created = await service.CreateAsync();
        var bob = await AddUserAsync(db, "Bob");
        currentUser.UserId = bob.Id;
        await service.JoinAsync(new JoinCoupleRequestDto { InviteCode = created.Couple.InviteCode });

        currentUser.UserId = alice.Id;
        await service.LeaveAsync();

        var carol = await AddUserAsync(db, "Carol");
        currentUser.UserId = carol.Id;
        await Assert.ThrowsAsync<NotFoundAppException>(
            () => service.JoinAsync(new JoinCoupleRequestDto { InviteCode = created.Couple.InviteCode }));
    }

    [Fact]
    public async Task LeaveAsync_ThenCreateNewCouple_Succeeds()
    {
        var (service, db, currentUser) = Build();
        var alice = await AddUserAsync(db, "Alice");
        currentUser.UserId = alice.Id;
        var created = await service.CreateAsync();
        var bob = await AddUserAsync(db, "Bob");
        currentUser.UserId = bob.Id;
        await service.JoinAsync(new JoinCoupleRequestDto { InviteCode = created.Couple.InviteCode });

        currentUser.UserId = alice.Id;
        await service.LeaveAsync();

        // Must not fail — neither the app-level "already in a couple" check nor the DB-level
        // filtered unique index on CoupleMembers.UserId should treat the ended membership as
        // still occupying Alice's one-active-couple slot.
        var recreated = await service.CreateAsync();

        Assert.NotEqual(created.Couple.Id, recreated.Couple.Id);
        Assert.Single(recreated.Couple.Members);
    }

    [Fact]
    public async Task RepartneringScenario_AFullyMovesToANewCoupleWithoutOldPartner()
    {
        var (service, db, currentUser) = Build();
        var alice = await AddUserAsync(db, "Alice");
        currentUser.UserId = alice.Id;
        var firstCouple = await service.CreateAsync();
        var bob = await AddUserAsync(db, "Bob");
        currentUser.UserId = bob.Id;
        await service.JoinAsync(new JoinCoupleRequestDto { InviteCode = firstCouple.Couple.InviteCode });

        currentUser.UserId = alice.Id;
        await service.LeaveAsync();
        var secondCouple = await service.CreateAsync();

        var carol = await AddUserAsync(db, "Carol");
        currentUser.UserId = carol.Id;
        var joined = await service.JoinAsync(new JoinCoupleRequestDto { InviteCode = secondCouple.Couple.InviteCode });

        Assert.Equal(2, joined.Couple.Members.Count);
        Assert.Contains(joined.Couple.Members, m => m.UserId == alice.Id);
        Assert.Contains(joined.Couple.Members, m => m.UserId == carol.Id);
        Assert.DoesNotContain(joined.Couple.Members, m => m.UserId == bob.Id);

        // The old couple is untouched by the new one — still ended, still just Alice+Bob's history.
        var oldCouple = await db.Couples.FindAsync(firstCouple.Couple.Id);
        Assert.True(oldCouple!.IsDeleted);
        var oldMembers = db.CoupleMembers.Where(m => m.CoupleId == firstCouple.Couple.Id).Select(m => m.UserId).ToList();
        Assert.Contains(bob.Id, oldMembers);
        Assert.DoesNotContain(carol.Id, oldMembers);
    }

    [Fact]
    public async Task RepartneringScenario_PartnerCanIndependentlyJoinAnotherCoupleAfterBeingLeft()
    {
        var (service, db, currentUser) = Build();
        var alice = await AddUserAsync(db, "Alice");
        currentUser.UserId = alice.Id;
        var firstCouple = await service.CreateAsync();
        var bob = await AddUserAsync(db, "Bob");
        currentUser.UserId = bob.Id;
        await service.JoinAsync(new JoinCoupleRequestDto { InviteCode = firstCouple.Couple.InviteCode });

        currentUser.UserId = alice.Id;
        await service.LeaveAsync();

        // Bob didn't initiate the leave — he should still be able to pair up again on his own.
        currentUser.UserId = bob.Id;
        var bobsNewCouple = await service.CreateAsync();

        Assert.NotEqual(firstCouple.Couple.Id, bobsNewCouple.Couple.Id);
        Assert.Single(bobsNewCouple.Couple.Members);
        Assert.Equal(bob.Id, bobsNewCouple.Couple.Members[0].UserId);

        var oldCouple = await db.Couples.FindAsync(firstCouple.Couple.Id);
        Assert.True(oldCouple!.IsDeleted);
    }

    [Fact]
    public async Task LeaveAsync_NeverAffectsAnUnrelatedCouple()
    {
        // There's no coupleId/partnerId in the request for a caller to smuggle in — LeaveAsync
        // can only ever resolve the *caller's own* ApplicationUser.CoupleId from the DB. This
        // test demonstrates that in effect: an entirely unrelated couple is untouched.
        var (service, db, currentUser) = Build();
        var alice = await AddUserAsync(db, "Alice");
        currentUser.UserId = alice.Id;
        var abCouple = await service.CreateAsync();
        var bob = await AddUserAsync(db, "Bob");
        currentUser.UserId = bob.Id;
        await service.JoinAsync(new JoinCoupleRequestDto { InviteCode = abCouple.Couple.InviteCode });

        var carol = await AddUserAsync(db, "Carol");
        currentUser.UserId = carol.Id;
        var cdCouple = await service.CreateAsync();
        var dave = await AddUserAsync(db, "Dave");
        currentUser.UserId = dave.Id;
        await service.JoinAsync(new JoinCoupleRequestDto { InviteCode = cdCouple.Couple.InviteCode });

        currentUser.UserId = alice.Id;
        await service.LeaveAsync();

        var untouchedCouple = await db.Couples.FindAsync(cdCouple.Couple.Id);
        Assert.False(untouchedCouple!.IsDeleted);
        var untouchedCarol = await db.Users.FindAsync(carol.Id);
        var untouchedDave = await db.Users.FindAsync(dave.Id);
        Assert.Equal(cdCouple.Couple.Id, untouchedCarol!.CoupleId);
        Assert.Equal(cdCouple.Couple.Id, untouchedDave!.CoupleId);
    }
}
