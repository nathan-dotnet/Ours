using Microsoft.EntityFrameworkCore;
using Ours.Application.Common;
using Ours.Application.DTOs.MissMe;
using Ours.Application.Services;
using Ours.Application.Tests.Fakes;
using Ours.Domain.Entities;
using Ours.Infrastructure.Persistence;
using Xunit;

namespace Ours.Application.Tests.Services;

public class MissMeServiceTests
{
    private static async Task<(MissMeService Service, FakeDateTimeProvider Clock, Guid AliceId, Guid BobId, AppDbContext Db)> BuildPairedCoupleAsync(
        FakeCurrentUserService currentUser, bool withPartner = true)
    {
        var db = TestDbContextFactory.Create();
        var clock = new FakeDateTimeProvider();

        var aliceId = Guid.NewGuid();
        var bobId = Guid.NewGuid();

        var couple = new Couple
        {
            Id = Guid.NewGuid(),
            InviteCode = "OURS-TEST",
            CreatedByUserId = aliceId,
            UpdatedByUserId = aliceId,
            CreatedAt = clock.UtcNow,
            UpdatedAt = clock.UtcNow,
            Version = 1,
        };
        db.Couples.Add(couple);

        db.Users.Add(new ApplicationUser { Id = aliceId, Email = "alice@test.com", UserName = "alice@test.com", DisplayName = "Alice", CreatedAt = clock.UtcNow });
        db.CoupleMembers.Add(new CoupleMember { Id = Guid.NewGuid(), CoupleId = couple.Id, UserId = aliceId, JoinedAt = clock.UtcNow });

        if (withPartner)
        {
            db.Users.Add(new ApplicationUser { Id = bobId, Email = "bob@test.com", UserName = "bob@test.com", DisplayName = "Bob", CreatedAt = clock.UtcNow });
            db.CoupleMembers.Add(new CoupleMember { Id = Guid.NewGuid(), CoupleId = couple.Id, UserId = bobId, JoinedAt = clock.UtcNow });
        }

        await db.SaveChangesAsync();

        currentUser.UserId = aliceId;
        currentUser.CoupleId = couple.Id;

        return (new MissMeService(db, currentUser, clock), clock, aliceId, bobId, db);
    }

    [Fact]
    public async Task SendAsync_MissMe_CreatesInteraction_AndStartsCooldown()
    {
        var currentUser = new FakeCurrentUserService();
        var (service, clock, aliceId, bobId, _) = await BuildPairedCoupleAsync(currentUser);

        var response = await service.SendAsync(new MissMeSendRequestDto { Type = MissMeInteractionType.MissMe });

        Assert.True(response.Sent);
        Assert.NotNull(response.Interaction);
        Assert.Equal(aliceId, response.Interaction!.SenderUserId);
        Assert.Equal("Alice", response.Interaction.SenderDisplayName);
        Assert.Equal(bobId, response.Interaction.ReceiverUserId);
        Assert.Equal(MissMeInteractionType.MissMe, response.Interaction.Type);
        Assert.Equal(clock.UtcNow + MissMeService.Cooldown, response.NextAvailableAt);
    }

    [Fact]
    public async Task SendAsync_MissMe_WithinCooldown_IsWithheldNotThrown()
    {
        var currentUser = new FakeCurrentUserService();
        var (service, clock, _, _, _) = await BuildPairedCoupleAsync(currentUser);

        var first = await service.SendAsync(new MissMeSendRequestDto { Type = MissMeInteractionType.MissMe });
        Assert.True(first.Sent);

        clock.UtcNow = clock.UtcNow.AddMinutes(10); // still within the 30-minute cooldown
        var second = await service.SendAsync(new MissMeSendRequestDto { Type = MissMeInteractionType.MissMe });

        Assert.False(second.Sent);
        Assert.Null(second.Interaction);
        Assert.Equal(first.NextAvailableAt, second.NextAvailableAt);
    }

    [Fact]
    public async Task SendAsync_MissMe_AfterCooldownElapses_SucceedsAgain()
    {
        var currentUser = new FakeCurrentUserService();
        var (service, clock, _, _, _) = await BuildPairedCoupleAsync(currentUser);

        await service.SendAsync(new MissMeSendRequestDto { Type = MissMeInteractionType.MissMe });
        clock.UtcNow = clock.UtcNow.Add(MissMeService.Cooldown).AddSeconds(1);

        var second = await service.SendAsync(new MissMeSendRequestDto { Type = MissMeInteractionType.MissMe });

        Assert.True(second.Sent);
    }

    [Fact]
    public async Task SendAsync_MissMe_WithoutAPartnerYet_ThrowsValidation()
    {
        var currentUser = new FakeCurrentUserService();
        var (service, _, _, _, _) = await BuildPairedCoupleAsync(currentUser, withPartner: false);

        await Assert.ThrowsAsync<ValidationAppException>(() => service.SendAsync(new MissMeSendRequestDto { Type = MissMeInteractionType.MissMe }));
    }

    [Fact]
    public async Task SendAsync_RejectsInvalidType()
    {
        var currentUser = new FakeCurrentUserService();
        var (service, _, _, _, _) = await BuildPairedCoupleAsync(currentUser);

        await Assert.ThrowsAsync<ValidationAppException>(() => service.SendAsync(new MissMeSendRequestDto { Type = "SuperMiss" }));
    }

    [Fact]
    public async Task SendAsync_RejectsWhenCallerHasNoCouple()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid(), CoupleId = null };
        var db = TestDbContextFactory.Create();
        var service = new MissMeService(db, currentUser, new FakeDateTimeProvider());

        await Assert.ThrowsAsync<ForbiddenAppException>(() => service.SendAsync(new MissMeSendRequestDto { Type = MissMeInteractionType.MissMe }));
    }

    [Fact]
    public async Task SendAsync_MissYouToo_RepliesToPartnersPendingMissMe()
    {
        var aliceUser = new FakeCurrentUserService();
        var (aliceService, clock, aliceId, bobId, db) = await BuildPairedCoupleAsync(aliceUser);

        var missMe = await aliceService.SendAsync(new MissMeSendRequestDto { Type = MissMeInteractionType.MissMe });

        var bobUser = new FakeCurrentUserService { UserId = bobId, CoupleId = aliceUser.CoupleId };
        var bobService = new MissMeService(db, bobUser, clock);

        var reply = await bobService.SendAsync(new MissMeSendRequestDto
        {
            Type = MissMeInteractionType.MissYouToo,
            InResponseToId = missMe.Interaction!.Id,
        });

        Assert.True(reply.Sent);
        Assert.Equal(bobId, reply.Interaction!.SenderUserId);
        Assert.Equal(aliceId, reply.Interaction.ReceiverUserId);
        Assert.Equal(missMe.Interaction.Id, reply.Interaction.InResponseToId);
    }

    [Fact]
    public async Task SendAsync_MissYouToo_TwiceForTheSameMissMe_IsIdempotent()
    {
        var aliceUser = new FakeCurrentUserService();
        var (aliceService, clock, _, bobId, db) = await BuildPairedCoupleAsync(aliceUser);
        var missMe = await aliceService.SendAsync(new MissMeSendRequestDto { Type = MissMeInteractionType.MissMe });

        var bobService = new MissMeService(db, new FakeCurrentUserService { UserId = bobId, CoupleId = aliceUser.CoupleId }, clock);
        var firstReply = await bobService.SendAsync(new MissMeSendRequestDto { Type = MissMeInteractionType.MissYouToo, InResponseToId = missMe.Interaction!.Id });
        var secondReply = await bobService.SendAsync(new MissMeSendRequestDto { Type = MissMeInteractionType.MissYouToo, InResponseToId = missMe.Interaction.Id });

        Assert.Equal(firstReply.Interaction!.Id, secondReply.Interaction!.Id);
        Assert.Equal(1, await db.MissMeInteractions.CountAsync(m => m.Type == MissMeInteractionType.MissYouToo));
    }

    [Fact]
    public async Task SendAsync_MissYouToo_RejectsReplyingToSomeoneElsesMissMe()
    {
        var aliceUser = new FakeCurrentUserService();
        var (aliceService, clock, aliceId, _, db) = await BuildPairedCoupleAsync(aliceUser);
        var missMe = await aliceService.SendAsync(new MissMeSendRequestDto { Type = MissMeInteractionType.MissMe });

        // Alice herself (the sender, not the receiver) tries to "reply" to her own MissMe.
        await Assert.ThrowsAsync<NotFoundAppException>(() =>
            aliceService.SendAsync(new MissMeSendRequestDto { Type = MissMeInteractionType.MissYouToo, InResponseToId = missMe.Interaction!.Id }));
    }

    [Fact]
    public async Task SendAsync_MissYouToo_WithoutInResponseToId_ThrowsValidation()
    {
        var aliceUser = new FakeCurrentUserService();
        var (service, _, _, _, _) = await BuildPairedCoupleAsync(aliceUser);

        await Assert.ThrowsAsync<ValidationAppException>(() => service.SendAsync(new MissMeSendRequestDto { Type = MissMeInteractionType.MissYouToo }));
    }

    [Fact]
    public async Task GetStatusAsync_ShowsPendingFromPartner_UntilReplied()
    {
        var aliceUser = new FakeCurrentUserService();
        var (aliceService, clock, aliceId, bobId, db) = await BuildPairedCoupleAsync(aliceUser);
        var missMe = await aliceService.SendAsync(new MissMeSendRequestDto { Type = MissMeInteractionType.MissMe });

        var bobUser = new FakeCurrentUserService { UserId = bobId, CoupleId = aliceUser.CoupleId };
        var bobService = new MissMeService(db, bobUser, clock);

        var statusBeforeReply = await bobService.GetStatusAsync();
        Assert.NotNull(statusBeforeReply.PendingFromPartner);
        Assert.Equal(missMe.Interaction!.Id, statusBeforeReply.PendingFromPartner!.Id);
        Assert.Equal("Alice", statusBeforeReply.PendingFromPartner.SenderDisplayName);

        await bobService.SendAsync(new MissMeSendRequestDto { Type = MissMeInteractionType.MissYouToo, InResponseToId = missMe.Interaction.Id });

        var statusAfterReply = await bobService.GetStatusAsync();
        Assert.Null(statusAfterReply.PendingFromPartner);
    }

    [Fact]
    public async Task GetStatusAsync_ReportsCooldownState_AndOrdersHistoryNewestFirst()
    {
        var aliceUser = new FakeCurrentUserService();
        var (aliceService, clock, _, bobId, db) = await BuildPairedCoupleAsync(aliceUser);

        var initialStatus = await aliceService.GetStatusAsync();
        Assert.True(initialStatus.CanSend);
        Assert.Null(initialStatus.NextAvailableAt);

        var sent = await aliceService.SendAsync(new MissMeSendRequestDto { Type = MissMeInteractionType.MissMe });
        var afterSend = await aliceService.GetStatusAsync();
        Assert.False(afterSend.CanSend);
        Assert.Equal(sent.NextAvailableAt, afterSend.NextAvailableAt);

        clock.UtcNow = clock.UtcNow.AddMinutes(1);
        var bobService = new MissMeService(db, new FakeCurrentUserService { UserId = bobId, CoupleId = aliceUser.CoupleId }, clock);
        var reply = await bobService.SendAsync(new MissMeSendRequestDto { Type = MissMeInteractionType.MissYouToo, InResponseToId = sent.Interaction!.Id });

        var history = (await aliceService.GetStatusAsync()).RecentHistory;
        Assert.Equal(2, history.Count);
        Assert.Equal(reply.Interaction!.Id, history[0].Id); // newest first
        Assert.Equal(sent.Interaction.Id, history[1].Id);
    }

    [Fact]
    public async Task GetStatusAsync_RejectsWhenCallerHasNoCouple()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid(), CoupleId = null };
        var db = TestDbContextFactory.Create();
        var service = new MissMeService(db, currentUser, new FakeDateTimeProvider());

        await Assert.ThrowsAsync<ForbiddenAppException>(() => service.GetStatusAsync());
    }

    [Fact]
    public async Task GetStatusAsync_RejectsWhenCoupleIsNoLongerActive()
    {
        var currentUser = new FakeCurrentUserService();
        var (service, _, _, _, db) = await BuildPairedCoupleAsync(currentUser);

        var couple = await db.Couples.SingleAsync();
        couple.IsDeleted = true;
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<ForbiddenAppException>(() => service.GetStatusAsync());
    }
}
