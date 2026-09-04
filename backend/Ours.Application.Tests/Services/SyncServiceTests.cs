using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Ours.Application.Common;
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

    // ---------------------------------------------------------------------------------------
    // Money System (Phase 3): Account, Transaction, Budget
    // ---------------------------------------------------------------------------------------

    private static SyncPushItemDto AccountPush(
        Guid entityId,
        DateTimeOffset clientUpdatedAt,
        string name = "BPI",
        string type = "Bank",
        decimal openingBalance = 10_000m,
        bool isActive = true,
        string operation = SyncOperation.Create) => new()
    {
        EntityType = SyncService.AccountEntityType,
        EntityId = entityId,
        Operation = operation,
        ClientUpdatedAt = clientUpdatedAt,
        Payload = JsonSerializer.SerializeToElement(new { name, type, icon = "bpi", openingBalance, currency = "PHP", isActive }),
    };

    private static SyncPushItemDto TransactionPush(
        Guid entityId,
        DateTimeOffset clientUpdatedAt,
        Guid accountId,
        string type = "Expense",
        object amount = null!,
        string? category = "Food",
        Guid? destinationAccountId = null,
        string operation = SyncOperation.Create,
        Guid? paidByUserId = null) => new()
    {
        EntityType = SyncService.TransactionEntityType,
        EntityId = entityId,
        Operation = operation,
        ClientUpdatedAt = clientUpdatedAt,
        Payload = JsonSerializer.SerializeToElement(new
        {
            type,
            amount = amount ?? 500m,
            currency = "PHP",
            accountId,
            destinationAccountId,
            category,
            transactionDate = DateOnly.FromDateTime(clientUpdatedAt.UtcDateTime),
            description = "Test",
            paidByUserId,
        }),
    };

    private static SyncPushItemDto BudgetPush(
        Guid entityId,
        DateTimeOffset clientUpdatedAt,
        string category = "Food",
        int year = 2026,
        int month = 9,
        object amount = null!,
        string operation = SyncOperation.Create) => new()
    {
        EntityType = SyncService.BudgetEntityType,
        EntityId = entityId,
        Operation = operation,
        ClientUpdatedAt = clientUpdatedAt,
        Payload = JsonSerializer.SerializeToElement(new { category, year, month, amount = amount ?? 5_000m, currency = "PHP" }),
    };

    // --- Accounts ---

    [Fact]
    public async Task PushAsync_CreatesAccount_WithClientGeneratedId()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);
        var accountId = Guid.NewGuid();

        var response = await service.PushAsync(new SyncPushRequestDto { Changes = [AccountPush(accountId, clock.UtcNow)] });

        var result = Assert.Single(response.Results);
        Assert.True(result.Accepted);
        Assert.Equal(1, result.ServerVersion);
    }

    [Fact]
    public async Task PushAsync_UpdatesAccount_ButNeverMovesOpeningBalance()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, db) = await BuildAsync(currentUser);
        var accountId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [AccountPush(accountId, clock.UtcNow, openingBalance: 10_000m)] });

        clock.UtcNow = clock.UtcNow.AddMinutes(1);
        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [AccountPush(accountId, clock.UtcNow, name: "BPI Savings", openingBalance: 999_999m, operation: SyncOperation.Update)],
        });

        Assert.True(Assert.Single(response.Results).Accepted);
        var account = await db.Accounts.FirstAsync(a => a.Id == accountId);
        Assert.Equal("BPI Savings", account.Name);
        Assert.Equal(10_000m, account.OpeningBalance); // unchanged despite the update payload
    }

    [Fact]
    public async Task PushAsync_DeactivatesAccount_ViaUpdateNotDelete()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, db) = await BuildAsync(currentUser);
        var accountId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [AccountPush(accountId, clock.UtcNow)] });

        await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [AccountPush(accountId, clock.UtcNow.AddMinutes(1), isActive: false, operation: SyncOperation.Update)],
        });

        Assert.False((await db.Accounts.FirstAsync(a => a.Id == accountId)).IsActive);
    }

    [Fact]
    public async Task PushAsync_RejectsAccountDeleteOperation()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);
        var accountId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [AccountPush(accountId, clock.UtcNow)] });

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = SyncService.AccountEntityType,
                    EntityId = accountId,
                    Operation = SyncOperation.Delete,
                    ClientUpdatedAt = clock.UtcNow.AddMinutes(1),
                    Payload = JsonSerializer.SerializeToElement<object?>(null),
                },
            ],
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_RejectsInvalidAccountType()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [AccountPush(Guid.NewGuid(), clock.UtcNow, type: "Crypto")],
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_RejectsAccountFromAnotherCouple()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, db) = await BuildAsync(currentUser);
        var accountId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [AccountPush(accountId, clock.UtcNow)] });

        var otherCouple = new Couple { Id = Guid.NewGuid(), InviteCode = "OURS-OTHR", CreatedByUserId = Guid.NewGuid(), UpdatedByUserId = Guid.NewGuid(), Version = 1 };
        db.Couples.Add(otherCouple);
        await db.SaveChangesAsync();
        currentUser.CoupleId = otherCouple.Id;

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [AccountPush(accountId, clock.UtcNow.AddMinutes(1), name: "Hijacked", operation: SyncOperation.Update)],
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    // --- Transactions: Expense / Income / Transfer ---

    [Fact]
    public async Task PushAsync_CreatesExpense_DecreasesNothingByItself_UntilRead()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, db) = await BuildAsync(currentUser);
        var accountId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [AccountPush(accountId, clock.UtcNow, openingBalance: 10_000m)] });

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [TransactionPush(Guid.NewGuid(), clock.UtcNow.AddMinutes(1), accountId, type: "Expense", amount: 500m)],
        });
        Assert.True(Assert.Single(response.Results).Accepted);

        var account = await db.Accounts.FirstAsync(a => a.Id == accountId);
        var transactions = await db.Transactions.Where(t => t.AccountId == accountId).ToListAsync();
        Assert.Equal(9_500m, MoneyCalculator.CalculateAccountBalance(account.OpeningBalance, accountId, transactions));
    }

    [Fact]
    public async Task PushAsync_CreatesIncome_IncreasesCalculatedBalance()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, db) = await BuildAsync(currentUser);
        var accountId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [AccountPush(accountId, clock.UtcNow, openingBalance: 9_500m)] });

        await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [TransactionPush(Guid.NewGuid(), clock.UtcNow.AddMinutes(1), accountId, type: "Income", amount: 20_000m, category: "Salary")],
        });

        var account = await db.Accounts.FirstAsync(a => a.Id == accountId);
        var transactions = await db.Transactions.Where(t => t.AccountId == accountId).ToListAsync();
        Assert.Equal(29_500m, MoneyCalculator.CalculateAccountBalance(account.OpeningBalance, accountId, transactions));
    }

    [Fact]
    public async Task PushAsync_CreatesTransfer_MovesMoneyBetweenAccounts_TotalUnchanged()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, db) = await BuildAsync(currentUser);
        var bpi = Guid.NewGuid();
        var cash = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [AccountPush(bpi, clock.UtcNow, name: "BPI", openingBalance: 10_000m), AccountPush(cash, clock.UtcNow, name: "Cash", openingBalance: 5_000m)],
        });

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [TransactionPush(Guid.NewGuid(), clock.UtcNow.AddMinutes(1), bpi, type: "Transfer", amount: 2_000m, category: null, destinationAccountId: cash)],
        });
        Assert.True(Assert.Single(response.Results).Accepted);

        var accounts = await db.Accounts.ToListAsync();
        var transactions = await db.Transactions.ToListAsync();
        Assert.Equal(8_000m, MoneyCalculator.CalculateAccountBalance(10_000m, bpi, transactions));
        Assert.Equal(7_000m, MoneyCalculator.CalculateAccountBalance(5_000m, cash, transactions));
        Assert.Equal(15_000m, MoneyCalculator.CalculateTotalBalance(accounts, transactions)); // unchanged
    }

    [Fact]
    public async Task PushAsync_RejectsTransfer_ToTheSameAccount()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);
        var accountId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [AccountPush(accountId, clock.UtcNow)] });

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [TransactionPush(Guid.NewGuid(), clock.UtcNow.AddMinutes(1), accountId, type: "Transfer", amount: 100m, category: null, destinationAccountId: accountId)],
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_RejectsTransfer_ToAnotherCouplesAccount()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, db) = await BuildAsync(currentUser);
        var myAccount = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [AccountPush(myAccount, clock.UtcNow)] });

        var otherCouple = new Couple { Id = Guid.NewGuid(), InviteCode = "OURS-OTH2", CreatedByUserId = Guid.NewGuid(), UpdatedByUserId = Guid.NewGuid(), Version = 1 };
        db.Couples.Add(otherCouple);
        var otherAccount = new Account { Id = Guid.NewGuid(), CoupleId = otherCouple.Id, Name = "Their BPI", Type = "Bank", Icon = "bpi", Currency = "PHP", CreatedByUserId = Guid.NewGuid(), UpdatedByUserId = Guid.NewGuid(), Version = 1 };
        db.Accounts.Add(otherAccount);
        await db.SaveChangesAsync();

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [TransactionPush(Guid.NewGuid(), clock.UtcNow.AddMinutes(1), myAccount, type: "Transfer", amount: 100m, category: null, destinationAccountId: otherAccount.Id)],
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_RejectsTransactionAgainstAnotherCouplesAccount()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, db) = await BuildAsync(currentUser);

        var otherCouple = new Couple { Id = Guid.NewGuid(), InviteCode = "OURS-OTH3", CreatedByUserId = Guid.NewGuid(), UpdatedByUserId = Guid.NewGuid(), Version = 1 };
        db.Couples.Add(otherCouple);
        var otherAccount = new Account { Id = Guid.NewGuid(), CoupleId = otherCouple.Id, Name = "Their BPI", Type = "Bank", Icon = "bpi", Currency = "PHP", CreatedByUserId = Guid.NewGuid(), UpdatedByUserId = Guid.NewGuid(), Version = 1 };
        db.Accounts.Add(otherAccount);
        await db.SaveChangesAsync();

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [TransactionPush(Guid.NewGuid(), clock.UtcNow, otherAccount.Id, type: "Expense", amount: 100m)],
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_RejectsZeroAndNegativeAndExcessiveAmount()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);
        var accountId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [AccountPush(accountId, clock.UtcNow)] });

        foreach (var amount in new object[] { 0m, -50m, 99_999_999.99m })
        {
            var response = await service.PushAsync(new SyncPushRequestDto
            {
                Changes = [TransactionPush(Guid.NewGuid(), clock.UtcNow.AddMinutes(1), accountId, amount: amount)],
            });
            Assert.False(Assert.Single(response.Results).Accepted);
        }
    }

    [Fact]
    public async Task PushAsync_RejectsInvalidCategoryForExpense()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);
        var accountId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [AccountPush(accountId, clock.UtcNow)] });

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [TransactionPush(Guid.NewGuid(), clock.UtcNow.AddMinutes(1), accountId, category: "Salary")], // an income category, invalid for an expense
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_RejectsTransferWithACategory()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);
        var bpi = Guid.NewGuid();
        var cash = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [AccountPush(bpi, clock.UtcNow, name: "BPI"), AccountPush(cash, clock.UtcNow, name: "Cash")],
        });

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [TransactionPush(Guid.NewGuid(), clock.UtcNow.AddMinutes(1), bpi, type: "Transfer", amount: 100m, category: "Food", destinationAccountId: cash)],
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_RejectsInvalidPaidByUserId()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);
        var accountId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [AccountPush(accountId, clock.UtcNow)] });

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [TransactionPush(Guid.NewGuid(), clock.UtcNow.AddMinutes(1), accountId, paidByUserId: Guid.NewGuid())],
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_UpdateTransaction_ChangingAccount_MovesTheEffect()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, db) = await BuildAsync(currentUser);
        var bpi = Guid.NewGuid();
        var gcash = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [AccountPush(bpi, clock.UtcNow, name: "BPI", openingBalance: 10_000m), AccountPush(gcash, clock.UtcNow, name: "GCash", openingBalance: 5_000m)],
        });
        var txId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [TransactionPush(txId, clock.UtcNow.AddMinutes(1), bpi, amount: 500m)] });

        // Edit: move the expense from BPI to GCash.
        await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [TransactionPush(txId, clock.UtcNow.AddMinutes(2), gcash, amount: 500m, operation: SyncOperation.Update)],
        });

        var transactions = await db.Transactions.ToListAsync();
        Assert.Equal(10_000m, MoneyCalculator.CalculateAccountBalance(10_000m, bpi, transactions)); // BPI got it back
        Assert.Equal(4_500m, MoneyCalculator.CalculateAccountBalance(5_000m, gcash, transactions)); // GCash now down
    }

    [Fact]
    public async Task PushAsync_SoftDeletesTransaction_AndItSurfacesAsATombstoneOnPull()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);
        var accountId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [AccountPush(accountId, clock.UtcNow)] });
        var txId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [TransactionPush(txId, clock.UtcNow.AddMinutes(1), accountId)] });

        var deleteResponse = await service.PushAsync(new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = SyncService.TransactionEntityType,
                    EntityId = txId,
                    Operation = SyncOperation.Delete,
                    ClientUpdatedAt = clock.UtcNow.AddMinutes(2),
                    Payload = JsonSerializer.SerializeToElement<object?>(null),
                },
            ],
        });
        Assert.True(Assert.Single(deleteResponse.Results).Accepted);

        var pulled = await service.PullAsync(since: null);
        var change = Assert.Single(pulled.Changes, c => c.EntityId == txId);
        Assert.Equal(SyncOperation.Delete, change.Operation);
        Assert.Null(change.Payload);
    }

    // --- Budgets ---

    [Fact]
    public async Task PushAsync_CreatesBudget()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);

        var response = await service.PushAsync(new SyncPushRequestDto { Changes = [BudgetPush(Guid.NewGuid(), clock.UtcNow)] });

        Assert.True(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_RejectsDuplicateActiveBudget_ForSameCoupleYearMonthCategory()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);
        await service.PushAsync(new SyncPushRequestDto { Changes = [BudgetPush(Guid.NewGuid(), clock.UtcNow, category: "Food")] });

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [BudgetPush(Guid.NewGuid(), clock.UtcNow.AddMinutes(1), category: "Food")],
        });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_AllowsNewBudget_AfterOldOneForSameSlotWasDeleted()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);
        var firstId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [BudgetPush(firstId, clock.UtcNow, category: "Food")] });
        await service.PushAsync(new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = SyncService.BudgetEntityType,
                    EntityId = firstId,
                    Operation = SyncOperation.Delete,
                    ClientUpdatedAt = clock.UtcNow.AddMinutes(1),
                    Payload = JsonSerializer.SerializeToElement<object?>(null),
                },
            ],
        });

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [BudgetPush(Guid.NewGuid(), clock.UtcNow.AddMinutes(2), category: "Food")],
        });

        Assert.True(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task PushAsync_EditingABudgetsAmount_IsNotTreatedAsADuplicate()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, db) = await BuildAsync(currentUser);
        var budgetId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [BudgetPush(budgetId, clock.UtcNow, category: "Food", amount: 5_000m)] });

        var response = await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [BudgetPush(budgetId, clock.UtcNow.AddMinutes(1), category: "Food", amount: 6_000m, operation: SyncOperation.Update)],
        });

        Assert.True(Assert.Single(response.Results).Accepted);
        Assert.Equal(6_000m, (await db.Budgets.FirstAsync(b => b.Id == budgetId)).Amount);
    }

    [Fact]
    public async Task PushAsync_RejectsInvalidBudgetMonth()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);

        var response = await service.PushAsync(new SyncPushRequestDto { Changes = [BudgetPush(Guid.NewGuid(), clock.UtcNow, month: 13)] });

        Assert.False(Assert.Single(response.Results).Accepted);
    }

    [Fact]
    public async Task BudgetEffect_ExpenseInCategoryIncreasesSpent_TransferAndIncomeDoNot()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, db) = await BuildAsync(currentUser);
        var bpi = Guid.NewGuid();
        var cash = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [AccountPush(bpi, clock.UtcNow, name: "BPI"), AccountPush(cash, clock.UtcNow, name: "Cash")],
        });
        await service.PushAsync(new SyncPushRequestDto { Changes = [BudgetPush(Guid.NewGuid(), clock.UtcNow, category: "Food", amount: 5_000m)] });

        await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [TransactionPush(Guid.NewGuid(), clock.UtcNow.AddMinutes(1), bpi, type: "Expense", amount: 1_000m, category: "Food")],
        });
        await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [TransactionPush(Guid.NewGuid(), clock.UtcNow.AddMinutes(2), bpi, type: "Income", amount: 20_000m, category: "Salary")],
        });
        await service.PushAsync(new SyncPushRequestDto
        {
            Changes = [TransactionPush(Guid.NewGuid(), clock.UtcNow.AddMinutes(3), bpi, type: "Transfer", amount: 2_000m, category: null, destinationAccountId: cash)],
        });

        var transactions = await db.Transactions.ToListAsync();
        var spending = MoneyCalculator.CalculateCategorySpending(transactions, clock.UtcNow.Year, clock.UtcNow.Month);
        Assert.Equal(1_000m, spending["Food"]);
    }

    [Fact]
    public async Task Precision_TransactionAmount_RoundTripsExactlyThroughPushAndPull()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);
        var accountId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [AccountPush(accountId, clock.UtcNow)] });
        var firstId = Guid.NewGuid();
        var secondId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [TransactionPush(firstId, clock.UtcNow.AddMinutes(1), accountId, type: "Income", amount: 100.10m, category: "Salary")] });
        await service.PushAsync(new SyncPushRequestDto { Changes = [TransactionPush(secondId, clock.UtcNow.AddMinutes(2), accountId, type: "Income", amount: 0.20m, category: "Salary")] });

        var pulled = await service.PullAsync(since: null);
        var first = Assert.IsType<Ours.Application.DTOs.Money.TransactionPayloadDto>(Assert.Single(pulled.Changes, c => c.EntityId == firstId).Payload);
        var second = Assert.IsType<Ours.Application.DTOs.Money.TransactionPayloadDto>(Assert.Single(pulled.Changes, c => c.EntityId == secondId).Payload);

        Assert.Equal(100.30m, first.Amount + second.Amount);
    }

    [Fact]
    public async Task PushAsync_RejectsMoneyMutations_WhenTheCallersCoupleHasEnded()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, couple, db) = await BuildAsync(currentUser);
        var accountId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [AccountPush(accountId, clock.UtcNow)] });
        couple.IsDeleted = true;
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<ForbiddenAppException>(() => service.PushAsync(new SyncPushRequestDto
        {
            Changes = [TransactionPush(Guid.NewGuid(), clock.UtcNow.AddMinutes(1), accountId)],
        }));
    }

    [Fact]
    public async Task PullAsync_IncludesAccountsTransactionsAndBudgets()
    {
        var currentUser = new FakeCurrentUserService { UserId = Guid.NewGuid() };
        var (service, clock, _, _) = await BuildAsync(currentUser);
        var accountId = Guid.NewGuid();
        await service.PushAsync(new SyncPushRequestDto { Changes = [AccountPush(accountId, clock.UtcNow)] });
        await service.PushAsync(new SyncPushRequestDto { Changes = [TransactionPush(Guid.NewGuid(), clock.UtcNow.AddMinutes(1), accountId)] });
        await service.PushAsync(new SyncPushRequestDto { Changes = [BudgetPush(Guid.NewGuid(), clock.UtcNow.AddMinutes(2))] });

        var response = await service.PullAsync(since: null);

        Assert.Contains(response.Changes, c => c.EntityType == SyncService.AccountEntityType);
        Assert.Contains(response.Changes, c => c.EntityType == SyncService.TransactionEntityType);
        Assert.Contains(response.Changes, c => c.EntityType == SyncService.BudgetEntityType);
    }
}
