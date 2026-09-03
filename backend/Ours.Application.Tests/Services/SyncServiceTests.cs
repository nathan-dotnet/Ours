using System.Text.Json;
using Ours.Application.Common;
using Ours.Application.DTOs.Expenses;
using Ours.Application.DTOs.Sync;
using Ours.Application.Services;
using Ours.Application.Tests.Fakes;
using Ours.Domain.Entities;
using Xunit;

namespace Ours.Application.Tests.Services;

public class SyncServiceTests
{
    private static async Task<(SyncService Service, FakeDateTimeProvider Clock, Couple Couple, Infrastructure.Persistence.AppDbContext Db)> BuildAsync(FakeCurrentUserService currentUser)
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
        return (new SyncService(db, currentUser, clock), clock, couple, db);
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
        var (service, clock, couple, _) = await BuildAsync(currentUser);
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
        var (service, clock, couple, _) = await BuildAsync(currentUser);

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
        var (service, clock, couple, _) = await BuildAsync(currentUser);

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
        var (service, clock, couple, _) = await BuildAsync(currentUser);
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
        var (service, _, couple, _) = await BuildAsync(currentUser);

        var response = await service.PullAsync(since: null);

        var change = Assert.Single(response.Changes);
        Assert.Equal(couple.Id, change.EntityId);
    }

    [Fact]
    public async Task PullAsync_WithFutureSinceCursor_ReturnsNoChanges()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);

        var response = await service.PullAsync(since: clock.UtcNow.AddMinutes(5));

        Assert.Empty(response.Changes);
    }

    private static SyncPushItemDto CalendarEventPush(
        Guid entityId,
        DateTimeOffset clientUpdatedAt,
        string title = "Dinner",
        DateTimeOffset? startAt = null,
        DateTimeOffset? endAt = null,
        string operation = SyncOperation.Create,
        bool allDay = false,
        string? location = null) => new()
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
            allDay,
            location,
        }),
    };

    [Fact]
    public async Task PushAsync_CreatesCalendarEvent_WithClientGeneratedId()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);
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
        var (service, clock, _, _) = await BuildAsync(currentUser);
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
        var (service, clock, _, _) = await BuildAsync(currentUser);
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
    public async Task PushAsync_RoundTripsAllDayAndLocation_ThroughPushAndPull()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);
        var eventId = Guid.NewGuid();

        await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [CalendarEventPush(eventId, clock.UtcNow, "Beach trip", allDay: true, location: "Santa Monica")],
        });

        var pulled = await service.PullAsync(since: null);
        var change = Assert.Single(pulled.Changes, c => c.EntityId == eventId);
        // PullAsync is called in-process here (not over HTTP), so Payload is already the typed
        // DTO instance — unlike the API-level round trip (see CalendarSyncFlowTests), no JSON
        // round trip has happened yet to turn it into a JsonElement.
        var payload = Assert.IsType<Ours.Application.DTOs.Calendar.CalendarEventPayloadDto>(change.Payload);
        Assert.True(payload.AllDay);
        Assert.Equal("Santa Monica", payload.Location);
    }

    [Fact]
    public async Task PushAsync_RejectsStaleCalendarEventUpdate()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);
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
        var (service, clock, _, _) = await BuildAsync(currentUser);

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
        var (service, clock, _, _) = await BuildAsync(currentUser);

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
        var (service, clock, couple, _) = await BuildAsync(currentUser);
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
        var (service, clock, _, _) = await BuildAsync(currentUser);

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
        var (service, clock, _, db) = await BuildAsync(currentUser);
        var eventId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [CalendarEventPush(eventId, clock.UtcNow)] });

        // Same service/db, but now acting as a session for a second, genuinely-real (and active)
        // couple — FakeCurrentUserService's CoupleId is read fresh on every call, so switching it
        // simulates a second couple without needing a second in-memory database. It has to be a
        // real row (not just a fresh Guid) now that PushAsync itself verifies the caller's own
        // couple exists and is active before dispatching to any per-entity handler.
        var otherCouple = new Couple
        {
            Id = Guid.NewGuid(),
            InviteCode = "OURS-OTHER",
            CreatedByUserId = Guid.NewGuid(),
            UpdatedByUserId = Guid.NewGuid(),
            CreatedAt = clock.UtcNow,
            UpdatedAt = clock.UtcNow,
            Version = 1,
        };
        db.Couples.Add(otherCouple);
        await db.SaveChangesAsync();
        currentUser.CoupleId = otherCouple.Id;

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
        var (service, clock, couple, _) = await BuildAsync(currentUser);
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
        var (service, clock, _, _) = await BuildAsync(currentUser);
        await service.PushAsync(new SyncPushRequestDto { Changes = [CalendarEventPush(Guid.NewGuid(), clock.UtcNow, "Old event")] });

        var cursor = clock.UtcNow.AddSeconds(1);
        clock.UtcNow = clock.UtcNow.AddMinutes(5);
        var newEventId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [CalendarEventPush(newEventId, clock.UtcNow, "New event")] });

        var response = await service.PullAsync(since: cursor);

        var change = Assert.Single(response.Changes, c => c.EntityType == SyncService.CalendarEventEntityType);
        Assert.Equal(newEventId, change.EntityId);
    }

    private static SyncPushItemDto ExpensePush(
        Guid entityId,
        DateTimeOffset clientUpdatedAt,
        object amount,
        string currency = "PHP",
        string category = "Food",
        DateOnly? expenseDate = null,
        string operation = SyncOperation.Create,
        Guid? paidByUserId = null) => new()
    {
        EntityType = SyncService.ExpenseEntityType,
        EntityId = entityId,
        Operation = operation,
        ClientUpdatedAt = clientUpdatedAt,
        Payload = JsonSerializer.SerializeToElement(new
        {
            amount,
            currency,
            category,
            expenseDate = expenseDate ?? DateOnly.FromDateTime(clientUpdatedAt.UtcDateTime),
            description = "Dinner",
            paidByUserId,
        }),
    };

    [Fact]
    public async Task PushAsync_CreatesExpense_WithClientGeneratedId()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);
        var expenseId = Guid.NewGuid();

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [ExpensePush(expenseId, clock.UtcNow, 250.00m)],
        });

        var result = Assert.Single(response.Results);
        Assert.True(result.Accepted);
        Assert.Equal(1, result.ServerVersion);
    }

    [Fact]
    public async Task PushAsync_UpdatesExistingExpense_AndBumpsVersion()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);
        var expenseId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [ExpensePush(expenseId, clock.UtcNow, 250.00m)] });

        clock.UtcNow = clock.UtcNow.AddMinutes(1);
        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [ExpensePush(expenseId, clock.UtcNow, 300.00m, operation: SyncOperation.Update)],
        });

        Assert.True(Assert.Single(response.Results).Accepted);
        Assert.Equal(2, response.Results[0].ServerVersion);
    }

    [Fact]
    public async Task PushAsync_SoftDeletesExpense()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);
        var expenseId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [ExpensePush(expenseId, clock.UtcNow, 250.00m)] });

        clock.UtcNow = clock.UtcNow.AddMinutes(1);
        var deleteResponse = await service.PushAsync(new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = SyncService.ExpenseEntityType,
                    EntityId = expenseId,
                    Operation = SyncOperation.Delete,
                    ClientUpdatedAt = clock.UtcNow,
                    Payload = JsonSerializer.SerializeToElement<object?>(null),
                },
            ],
        });
        Assert.True(Assert.Single(deleteResponse.Results).Accepted);

        // A soft delete must still surface via pull (as a tombstone) so the partner's device
        // learns it's gone — a hard delete would make that impossible to detect.
        var pulled = await service.PullAsync(since: null);
        var change = Assert.Single(pulled.Changes, c => c.EntityId == expenseId);
        Assert.Equal(SyncOperation.Delete, change.Operation);
        Assert.Null(change.Payload);
    }

    [Fact]
    public async Task PushAsync_RejectsZeroAmount()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [ExpensePush(Guid.NewGuid(), clock.UtcNow, 0m)],
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_RejectsNegativeAmount()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [ExpensePush(Guid.NewGuid(), clock.UtcNow, -50.00m)],
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_RejectsExcessiveAmount()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [ExpensePush(Guid.NewGuid(), clock.UtcNow, 99_999_999.99m)],
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_RejectsInvalidCategory()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [ExpensePush(Guid.NewGuid(), clock.UtcNow, 100.00m, category: "NotACategory")],
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_RejectsInvalidCurrency()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [ExpensePush(Guid.NewGuid(), clock.UtcNow, 100.00m, currency: "php")], // lowercase — not a valid ISO 4217 code shape
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_RejectsInvalidPayload()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = SyncService.ExpenseEntityType,
                    EntityId = Guid.NewGuid(),
                    Operation = SyncOperation.Create,
                    ClientUpdatedAt = clock.UtcNow,
                    Payload = JsonSerializer.SerializeToElement("not an object"),
                },
            ],
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_RejectsPaidByUserId_WhenNotAnActiveMemberOfTheCallersCouple()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [ExpensePush(Guid.NewGuid(), clock.UtcNow, 100.00m, paidByUserId: Guid.NewGuid())],
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_AcceptsPaidByUserId_WhenItIsAnActiveMemberOfTheCallersCouple()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, couple, db) = await BuildAsync(currentUser);
        var partnerId = Guid.NewGuid();
        db.CoupleMembers.Add(new CoupleMember { Id = Guid.NewGuid(), CoupleId = couple.Id, UserId = partnerId, JoinedAt = clock.UtcNow });
        await db.SaveChangesAsync();

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [ExpensePush(Guid.NewGuid(), clock.UtcNow, 100.00m, paidByUserId: partnerId)],
        });

        Assert.True(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task MoneyPrecision_100Point10PlusPoint20_RoundTripsToExactly100Point30()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);
        var firstId = Guid.NewGuid();
        var secondId = Guid.NewGuid();

        await service.PushAsync(new SyncPushRequestDto { Changes = [ExpensePush(firstId, clock.UtcNow, 100.10m)] });
        await service.PushAsync(new SyncPushRequestDto { Changes = [ExpensePush(secondId, clock.UtcNow, 0.20m)] });

        var pulled = await service.PullAsync(since: null);
        var first = Assert.IsType<ExpensePayloadDto>(Assert.Single(pulled.Changes, c => c.EntityId == firstId).Payload);
        var second = Assert.IsType<ExpensePayloadDto>(Assert.Single(pulled.Changes, c => c.EntityId == secondId).Payload);

        // decimal arithmetic is exact — unlike the classic 0.1 + 0.2 !== 0.3 floating-point trap,
        // this is exactly 100.30m, not 100.30000000000001m.
        Assert.Equal(100.30m, first.Amount + second.Amount);
    }

    [Fact]
    public async Task MoneyPrecision_1999Point99PlusPoint01_RoundTripsToExactly2000()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);
        var firstId = Guid.NewGuid();
        var secondId = Guid.NewGuid();

        await service.PushAsync(new SyncPushRequestDto { Changes = [ExpensePush(firstId, clock.UtcNow, 1999.99m)] });
        await service.PushAsync(new SyncPushRequestDto { Changes = [ExpensePush(secondId, clock.UtcNow, 0.01m)] });

        var pulled = await service.PullAsync(since: null);
        var first = Assert.IsType<ExpensePayloadDto>(Assert.Single(pulled.Changes, c => c.EntityId == firstId).Payload);
        var second = Assert.IsType<ExpensePayloadDto>(Assert.Single(pulled.Changes, c => c.EntityId == secondId).Payload);

        Assert.Equal(2000.00m, first.Amount + second.Amount);
    }

    [Fact]
    public async Task PushAsync_RejectsExpenseBelongingToAnotherCouple()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, db) = await BuildAsync(currentUser);
        var expenseId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [ExpensePush(expenseId, clock.UtcNow, 100.00m)] });

        var otherCouple = new Couple { Id = Guid.NewGuid(), InviteCode = "OURS-OTHR", CreatedByUserId = Guid.NewGuid(), UpdatedByUserId = Guid.NewGuid(), Version = 1 };
        db.Couples.Add(otherCouple);
        await db.SaveChangesAsync();
        currentUser.CoupleId = otherCouple.Id;

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [ExpensePush(expenseId, clock.UtcNow.AddMinutes(1), 999.00m, operation: SyncOperation.Update)],
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_RejectsAnyExpenseMutation_WhenTheCallersCoupleHasEnded()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, couple, db) = await BuildAsync(currentUser);
        couple.IsDeleted = true;
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<ForbiddenAppException>(() => service.PushAsync(new SyncPushRequestDto
        {
            Changes = [ExpensePush(Guid.NewGuid(), clock.UtcNow, 100.00m)],
        }));
    }

    [Fact]
    public async Task PushAsync_RejectsAnyMutation_WhenTheCallersCoupleHasEnded()
    {
        // Simulates a stale JWT: the couple ended (e.g. the partner left) after this token was
        // issued, so the coupleId claim is still present but no longer refers to an active couple.
        // Rejected up front — the whole request 403s before reaching any per-entity handler.
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, couple, db) = await BuildAsync(currentUser);
        couple.IsDeleted = true;
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<ForbiddenAppException>(() => service.PushAsync(new SyncPushRequestDto
        {
            Changes = [CalendarEventPush(Guid.NewGuid(), clock.UtcNow, "Should be rejected")],
        }));
    }

    [Fact]
    public async Task PushAsync_RejectsMutation_WhenCoupleIdClaimNoLongerExistsAtAll()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid(), CoupleId = Guid.NewGuid() };
        var db = TestDbContextFactory.Create();
        var service = new SyncService(db, currentUser, new FakeDateTimeProvider());

        await Assert.ThrowsAsync<ForbiddenAppException>(() => service.PushAsync(new SyncPushRequestDto
        {
            Changes = [CalendarEventPush(Guid.NewGuid(), DateTimeOffset.UtcNow, "Should be rejected")],
        }));
    }
}
