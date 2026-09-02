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
                    EntityType = "expense", // not registered with SyncService — genuinely unknown
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

    private static SyncPushItemDto CalendarEventPush(
        Guid entityId,
        DateTimeOffset clientUpdatedAt,
        string title = "Dinner",
        DateTimeOffset? startAt = null,
        DateTimeOffset? endAt = null,
        string operation = SyncOperation.Create) => new()
    {
        EntityType = SyncService.CalendarEventEntityType,
        EntityId = entityId,
        Operation = operation,
        ClientUpdatedAt = clientUpdatedAt,
        Payload = JsonSerializer.SerializeToElement(new
        {
            title,
            startAt = startAt ?? clientUpdatedAt,
            endAt = endAt ?? clientUpdatedAt.AddHours(1),
        }),
    };

    [Fact]
    public async Task PushAsync_CreatesCalendarEvent_WithClientGeneratedId()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _) = await BuildAsync(currentUser);
        var eventId = Guid.NewGuid();

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [CalendarEventPush(eventId, clock.UtcNow, "Dinner")],
        });

        var result = Assert.Single(response.Results);
        Assert.True(result.Accepted);
        Assert.Equal(1, result.ServerVersion);
        Assert.Equal(eventId, result.EntityId);
    }

    [Fact]
    public async Task PushAsync_RetriedCreate_IsIdempotent()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _) = await BuildAsync(currentUser);
        var eventId = Guid.NewGuid();
        var push = CalendarEventPush(eventId, clock.UtcNow, "Dinner");

        // Simulates the ack for the first push never reaching the client, which retries the
        // identical CREATE — it must not error or produce a duplicate row.
        await service.PushAsync(new SyncPushRequestDto { Changes = [push] });
        var response = await service.PushAsync(new SyncPushRequestDto { Changes = [push] });

        Assert.True(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_UpdatesExistingCalendarEvent_AndBumpsVersion()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _) = await BuildAsync(currentUser);
        var eventId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [CalendarEventPush(eventId, clock.UtcNow, "Dinner")] });

        clock.UtcNow = clock.UtcNow.AddMinutes(1);
        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [CalendarEventPush(eventId, clock.UtcNow, "Dinner (rescheduled)", operation: SyncOperation.Update)],
        });

        var result = Assert.Single(response.Results);
        Assert.True(result.Accepted);
        Assert.Equal(2, result.ServerVersion);
    }

    [Fact]
    public async Task PushAsync_RejectsStaleCalendarEventUpdate()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _) = await BuildAsync(currentUser);
        var eventId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [CalendarEventPush(eventId, clock.UtcNow)] });

        var staleTimestamp = clock.UtcNow.AddMinutes(-10);
        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [CalendarEventPush(eventId, staleTimestamp, "Too late", operation: SyncOperation.Update)],
        });

        var result = Assert.Single(response.Results);
        Assert.False(result.Accepted);
        Assert.Equal("stale_write", result.Error);
    }

    [Fact]
    public async Task PushAsync_RejectsMissingTitle()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _) = await BuildAsync(currentUser);

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [CalendarEventPush(Guid.NewGuid(), clock.UtcNow, title: " ")],
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_RejectsEndBeforeStart()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _) = await BuildAsync(currentUser);

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [CalendarEventPush(Guid.NewGuid(), clock.UtcNow, startAt: clock.UtcNow, endAt: clock.UtcNow.AddHours(-1))],
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_SoftDeletesCalendarEvent()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, couple) = await BuildAsync(currentUser);
        var eventId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [CalendarEventPush(eventId, clock.UtcNow)] });

        clock.UtcNow = clock.UtcNow.AddMinutes(1);
        var deleteResponse = await service.PushAsync(new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = SyncService.CalendarEventEntityType,
                    EntityId = eventId,
                    Operation = SyncOperation.Delete,
                    ClientUpdatedAt = clock.UtcNow,
                    Payload = JsonSerializer.SerializeToElement<object?>(null),
                },
            ],
        });
        Assert.True(Assert.Single(deleteResponse.Results).Accepted);

        // A soft delete must still surface via pull (as a tombstone) so the partner's device
        // learns the event is gone — a hard delete would make that impossible to detect.
        var pullResponse = await service.PullAsync(since: null);
        var change = Assert.Single(pullResponse.Changes, c => c.EntityId == eventId);
        Assert.Equal(SyncOperation.Delete, change.Operation);
        Assert.Null(change.Payload);
    }

    [Fact]
    public async Task PushAsync_DeletingAlreadyGoneEvent_IsIdempotent()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _) = await BuildAsync(currentUser);

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = SyncService.CalendarEventEntityType,
                    EntityId = Guid.NewGuid(), // never created — e.g. locally created then deleted before ever syncing
                    Operation = SyncOperation.Delete,
                    ClientUpdatedAt = clock.UtcNow,
                    Payload = JsonSerializer.SerializeToElement<object?>(null),
                },
            ],
        });

        Assert.True(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_RejectsCalendarEventBelongingToAnotherCouple()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _) = await BuildAsync(currentUser);
        var eventId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [CalendarEventPush(eventId, clock.UtcNow)] });

        // Same service/db, but now acting as a session for a different couple — FakeCurrentUserService's
        // CoupleId is read fresh on every call, so this simulates a second couple without needing a
        // second in-memory database.
        currentUser.CoupleId = Guid.NewGuid();
        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [CalendarEventPush(eventId, clock.UtcNow.AddMinutes(1), "Hijacked", operation: SyncOperation.Update)],
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PullAsync_WithNoSinceCursor_IncludesCalendarEvents()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, couple) = await BuildAsync(currentUser);
        var eventId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [CalendarEventPush(eventId, clock.UtcNow, "Dinner")] });

        var response = await service.PullAsync(since: null);

        Assert.Contains(response.Changes, c => c.EntityId == couple.Id && c.EntityType == SyncService.CoupleProfileEntityType);
        Assert.Contains(response.Changes, c => c.EntityId == eventId && c.EntityType == SyncService.CalendarEventEntityType);
    }

    [Fact]
    public async Task PullAsync_OnlyReturnsEventsChangedSinceCursor()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _) = await BuildAsync(currentUser);
        await service.PushAsync(new SyncPushRequestDto { Changes = [CalendarEventPush(Guid.NewGuid(), clock.UtcNow, "Old event")] });

        var cursor = clock.UtcNow.AddSeconds(1);
        clock.UtcNow = clock.UtcNow.AddMinutes(5);
        var newEventId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [CalendarEventPush(newEventId, clock.UtcNow, "New event")] });

        var response = await service.PullAsync(since: cursor);

        var change = Assert.Single(response.Changes, c => c.EntityType == SyncService.CalendarEventEntityType);
        Assert.Equal(newEventId, change.EntityId);
    }
}
