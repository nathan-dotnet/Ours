using System.Text.Json;
using Ours.Application.DTOs.Sync;
using Ours.Application.Services;
using Ours.Application.Tests.Fakes;
using Ours.Domain.Entities;
using Xunit;

namespace Ours.Application.Tests.Services;

public class SyncServiceTests
{
    private static async Task<(SyncService Service, FakeDateTimeProvider Clock, Couple Couple)> BuildAsync(FakeCurrentUserService currentUser)
    {
        var db = TestDbContextFactory.Create();
        var clock = new FakeDateTimeProvider();

        var couple = new Couple
        {
            Id = Guid.NewGuid(),
            InviteCode = "OURS-TEST",
            CreatedByUserId = currentUser.UserId,
            UpdatedByUserId = currentUser.UserId,
            CreatedAt = clock.UtcNow,
            UpdatedAt = clock.UtcNow,
            Version = 1,
        };
        db.Couples.Add(couple);
        await db.SaveChangesAsync();

        currentUser.CoupleId = couple.Id;
        return (new SyncService(db, currentUser, clock), clock, couple);
    }

    private static SyncPushItemDto CoupleProfilePush(Guid entityId, DateTimeOffset clientUpdatedAt, string nickname) => new()
    {
        EntityType = SyncService.CoupleProfileEntityType,
        EntityId = entityId,
        Operation = SyncOperation.Update,
        ClientUpdatedAt = clientUpdatedAt,
        Payload = JsonSerializer.SerializeToElement(new { nickname }),
    };

    [Fact]
    public async Task PushAsync_AppliesUpdate_AndBumpsVersion()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, couple) = await BuildAsync(currentUser);
        clock.UtcNow = clock.UtcNow.AddMinutes(1);

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [CoupleProfilePush(couple.Id, clock.UtcNow, "Us Two")],
        });

        var result = Assert.Single(response.Results);
        Assert.True(result.Accepted);
        Assert.Equal(2, result.ServerVersion);
    }

    [Fact]
    public async Task PushAsync_RejectsStaleWrite()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, couple) = await BuildAsync(currentUser);

        var staleTimestamp = couple.UpdatedAt.AddMinutes(-10);
        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [CoupleProfilePush(couple.Id, staleTimestamp, "Too Late")],
        });

        var result = Assert.Single(response.Results);
        Assert.False(result.Accepted);
        Assert.Equal("stale_write", result.Error);
    }

    [Fact]
    public async Task PushAsync_RejectsUnknownEntityType()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, couple) = await BuildAsync(currentUser);

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = "calendar_event",
                    EntityId = couple.Id,
                    Operation = SyncOperation.Create,
                    ClientUpdatedAt = clock.UtcNow,
                    Payload = JsonSerializer.SerializeToElement(new { }),
                },
            ],
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_RejectsEntityIdNotMatchingCallersCouple()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, couple) = await BuildAsync(currentUser);
        var otherCoupleId = Guid.NewGuid();

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [CoupleProfilePush(otherCoupleId, clock.UtcNow, "Not Yours")],
        });

        var result = Assert.Single(response.Results);
        Assert.False(result.Accepted);
    }

    [Fact]
    public async Task PullAsync_WithNoSinceCursor_ReturnsCurrentState()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, _, couple) = await BuildAsync(currentUser);

        var response = await service.PullAsync(since: null);

        var change = Assert.Single(response.Changes);
        Assert.Equal(couple.Id, change.EntityId);
    }

    [Fact]
    public async Task PullAsync_WithFutureSinceCursor_ReturnsNoChanges()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _) = await BuildAsync(currentUser);

        var response = await service.PullAsync(since: clock.UtcNow.AddMinutes(5));

        Assert.Empty(response.Changes);
    }
}
