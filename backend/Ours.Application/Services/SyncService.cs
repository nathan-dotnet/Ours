using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Ours.Application.Abstractions;
using Ours.Application.Common;
using Ours.Application.DTOs.Calendar;
using Ours.Application.DTOs.Couples;
using Ours.Application.DTOs.Money;
using Ours.Application.DTOs.Sync;
using Ours.Domain.Entities;

namespace Ours.Application.Services;

/// <summary>
/// Generic, entity-agnostic sync endpoint implementation. Phase 1 registered a handler for
/// "couple_profile" purely to prove the offline round trip end-to-end; Phase 2 added
/// "calendar_event"; Phase 3 adds the Money System's three entities — "account",
/// "money_transaction", and "budget" — the same way. Adding a new synced feature means adding a
/// case per entity type to <see cref="PullAsync"/> and <see cref="PushAsync"/>, not a new
/// controller or a parallel sync mechanism.
/// </summary>
public class SyncService(
    IApplicationDbContext db,
    ICurrentUserService currentUser,
    IDateTimeProvider clock)
{
    public const string CoupleProfileEntityType = "couple_profile";
    public const string CalendarEventEntityType = "calendar_event";
    public const string AccountEntityType = "account";
    public const string TransactionEntityType = "money_transaction";
    public const string BudgetEntityType = "budget";

    /// <summary>Application-level sanity ceiling — independent of any column's actual numeric(18,2) headroom — rejecting an obviously-mistyped amount (e.g. an extra zero) rather than silently accepting it. Shared by every money amount: Transaction.Amount, Account.OpeningBalance, Budget.Amount.</summary>
    private const decimal MaxMoneyAmount = 10_000_000m;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<SyncPullResponseDto> PullAsync(DateTimeOffset? since, CancellationToken ct = default)
    {
        var coupleId = currentUser.CoupleId ?? throw new ForbiddenAppException("You must belong to a couple to sync.");
        var serverTime = clock.UtcNow;
        var changes = new List<SyncChangeDto>();

        var couple = await db.Couples.FirstOrDefaultAsync(c => c.Id == coupleId, ct);
        if (couple is not null && (since is null || couple.UpdatedAt > since))
        {
            changes.Add(new SyncChangeDto
            {
                EntityType = CoupleProfileEntityType,
                EntityId = couple.Id,
                Operation = couple.IsDeleted ? SyncOperation.Delete : SyncOperation.Update,
                Payload = couple.IsDeleted ? null : new CoupleProfilePayloadDto { Nickname = couple.Nickname, AnniversaryDate = couple.AnniversaryDate },
                UpdatedAt = couple.UpdatedAt,
                UpdatedByUserId = couple.UpdatedByUserId,
                Version = couple.Version,
            });
        }

        var events = await db.CalendarEvents
            .Where(e => e.CoupleId == coupleId && (since == null || e.UpdatedAt > since))
            .ToListAsync(ct);
        foreach (var calendarEvent in events)
        {
            changes.Add(new SyncChangeDto
            {
                EntityType = CalendarEventEntityType,
                EntityId = calendarEvent.Id,
                Operation = calendarEvent.IsDeleted ? SyncOperation.Delete : SyncOperation.Update,
                Payload = calendarEvent.IsDeleted ? null : new CalendarEventPayloadDto
                {
                    Title = calendarEvent.Title,
                    Description = calendarEvent.Description,
                    StartAt = calendarEvent.StartAt,
                    EndAt = calendarEvent.EndAt,
                    AllDay = calendarEvent.AllDay,
                    Location = calendarEvent.Location,
                    ReminderAt = calendarEvent.ReminderAt,
                    CreatedByUserId = calendarEvent.CreatedByUserId,
                },
                UpdatedAt = calendarEvent.UpdatedAt,
                UpdatedByUserId = calendarEvent.UpdatedByUserId,
                Version = calendarEvent.Version,
            });
        }

        var accounts = await db.Accounts
            .Where(a => a.CoupleId == coupleId && (since == null || a.UpdatedAt > since))
            .ToListAsync(ct);
        foreach (var account in accounts)
        {
            // Accounts are never deleted (see ApplyAccountChangeAsync) — always an upsert.
            changes.Add(new SyncChangeDto
            {
                EntityType = AccountEntityType,
                EntityId = account.Id,
                Operation = SyncOperation.Update,
                Payload = new AccountPayloadDto
                {
                    Name = account.Name,
                    Type = account.Type,
                    Icon = account.Icon,
                    OpeningBalance = account.OpeningBalance,
                    Currency = account.Currency,
                    IsActive = account.IsActive,
                },
                UpdatedAt = account.UpdatedAt,
                UpdatedByUserId = account.UpdatedByUserId,
                Version = account.Version,
            });
        }

        var transactions = await db.Transactions
            .Where(t => t.CoupleId == coupleId && (since == null || t.UpdatedAt > since))
            .ToListAsync(ct);
        foreach (var transaction in transactions)
        {
            changes.Add(new SyncChangeDto
            {
                EntityType = TransactionEntityType,
                EntityId = transaction.Id,
                Operation = transaction.IsDeleted ? SyncOperation.Delete : SyncOperation.Update,
                Payload = transaction.IsDeleted ? null : new TransactionPayloadDto
                {
                    Type = transaction.Type,
                    Amount = transaction.Amount,
                    Currency = transaction.Currency,
                    AccountId = transaction.AccountId,
                    DestinationAccountId = transaction.DestinationAccountId,
                    Category = transaction.Category,
                    Description = transaction.Description,
                    TransactionDate = transaction.TransactionDate,
                    Notes = transaction.Notes,
                    PaidByUserId = transaction.PaidByUserId,
                    CreatedByUserId = transaction.CreatedByUserId,
                },
                UpdatedAt = transaction.UpdatedAt,
                UpdatedByUserId = transaction.UpdatedByUserId,
                Version = transaction.Version,
            });
        }

        var budgets = await db.Budgets
            .Where(b => b.CoupleId == coupleId && (since == null || b.UpdatedAt > since))
            .ToListAsync(ct);
        foreach (var budget in budgets)
        {
            changes.Add(new SyncChangeDto
            {
                EntityType = BudgetEntityType,
                EntityId = budget.Id,
                Operation = budget.IsDeleted ? SyncOperation.Delete : SyncOperation.Update,
                Payload = budget.IsDeleted ? null : new BudgetPayloadDto
                {
                    Category = budget.Category,
                    Year = budget.Year,
                    Month = budget.Month,
                    Amount = budget.Amount,
                    Currency = budget.Currency,
                },
                UpdatedAt = budget.UpdatedAt,
                UpdatedByUserId = budget.UpdatedByUserId,
                Version = budget.Version,
            });
        }

        // Future entity types append their own "changed since `since`" checks here.

        return new SyncPullResponseDto { ServerTime = serverTime, Changes = changes };
    }

    public async Task<SyncPushResponseDto> PushAsync(SyncPushRequestDto request, CancellationToken ct = default)
    {
        var coupleId = currentUser.CoupleId ?? throw new ForbiddenAppException("You must belong to a couple to sync.");

        // The JWT's coupleId claim is only as fresh as the token itself (up to its lifetime) —
        // if the couple ended since this token was issued (the caller left, or their partner
        // did), the claim is stale. Checked once up front rather than per-entity-type handler,
        // so this covers couple_profile and every future entity type uniformly: an ended couple
        // can never accept a mutation, no matter what a stale-but-still-valid token claims.
        var coupleIsActive = await db.Couples.AnyAsync(c => c.Id == coupleId && !c.IsDeleted, ct);
        if (!coupleIsActive)
        {
            throw new ForbiddenAppException("Your couple is no longer active.");
        }

        var results = new List<SyncPushResultItemDto>();

        foreach (var item in request.Changes)
        {
            if (!SyncOperation.IsValid(item.Operation))
            {
                results.Add(Rejected(item, "Unknown operation."));
                continue;
            }

            var result = item.EntityType switch
            {
                CoupleProfileEntityType => await ApplyCoupleProfileChangeAsync(coupleId, item, ct),
                CalendarEventEntityType => await ApplyCalendarEventChangeAsync(coupleId, item, ct),
                AccountEntityType => await ApplyAccountChangeAsync(coupleId, item, ct),
                TransactionEntityType => await ApplyTransactionChangeAsync(coupleId, item, ct),
                BudgetEntityType => await ApplyBudgetChangeAsync(coupleId, item, ct),
                _ => Rejected(item, $"Unknown entity type '{item.EntityType}'."),
            };
            results.Add(result);
        }

        await db.SaveChangesAsync(ct);
        return new SyncPushResponseDto { Results = results };
    }

    private async Task<SyncPushResultItemDto> ApplyCoupleProfileChangeAsync(Guid coupleId, SyncPushItemDto item, CancellationToken ct)
    {
        if (item.EntityId != coupleId)
        {
            return Rejected(item, "You may only sync your own couple's profile.");
        }

        if (item.Operation == SyncOperation.Delete)
        {
            return Rejected(item, "A couple profile cannot be deleted.");
        }

        var couple = await db.Couples.FirstOrDefaultAsync(c => c.Id == coupleId, ct);
        if (couple is null)
        {
            return Rejected(item, "Couple not found.");
        }

        // Last-valid-server-write-wins: a push older than what the server already has is
        // rejected (not merged) so the client can pull the newer value instead of clobbering it.
        if (item.ClientUpdatedAt < couple.UpdatedAt)
        {
            return StaleWrite(item, couple.Version, couple.UpdatedAt);
        }

        CoupleProfilePayloadDto? payload;
        try
        {
            payload = item.Payload.Deserialize<CoupleProfilePayloadDto>(JsonOptions);
        }
        catch (JsonException)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (payload is null)
        {
            return Rejected(item, "Invalid payload.");
        }

        couple.Nickname = payload.Nickname;
        couple.AnniversaryDate = payload.AnniversaryDate;
        couple.UpdatedAt = clock.UtcNow;
        couple.UpdatedByUserId = currentUser.UserId;
        couple.Version += 1;

        return Accepted(item, couple.Version, couple.UpdatedAt);
    }

    /// <summary>
    /// Unlike couple_profile (a singleton that always already exists by the time sync ever
    /// runs), a calendar event might be genuinely new to the server — this is where offline
    /// CREATE actually lands. Whether the server has seen this id before (not the client's
    /// stated Operation) is what decides create-vs-update, which makes a retried push of an
    /// already-applied CREATE naturally idempotent.
    /// </summary>
    private async Task<SyncPushResultItemDto> ApplyCalendarEventChangeAsync(Guid coupleId, SyncPushItemDto item, CancellationToken ct)
    {
        var existing = await db.CalendarEvents.FirstOrDefaultAsync(e => e.Id == item.EntityId, ct);

        if (existing is not null && existing.CoupleId != coupleId)
        {
            return Rejected(item, "You may only sync your own couple's events.");
        }

        if (item.Operation == SyncOperation.Delete)
        {
            if (existing is null)
            {
                // Already gone (or a retry of a delete that already landed) — deleting is
                // idempotent, so this counts as success rather than an error.
                return Accepted(item, serverVersion: null, serverUpdatedAt: null);
            }
            if (item.ClientUpdatedAt < existing.UpdatedAt)
            {
                return StaleWrite(item, existing.Version, existing.UpdatedAt);
            }

            existing.IsDeleted = true;
            existing.UpdatedAt = clock.UtcNow;
            existing.UpdatedByUserId = currentUser.UserId;
            existing.Version += 1;
            return Accepted(item, existing.Version, existing.UpdatedAt);
        }

        if (existing is not null && item.ClientUpdatedAt < existing.UpdatedAt)
        {
            return StaleWrite(item, existing.Version, existing.UpdatedAt);
        }

        CalendarEventPayloadDto? payload;
        try
        {
            payload = item.Payload.Deserialize<CalendarEventPayloadDto>(JsonOptions);
        }
        catch (JsonException)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (payload is null)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (string.IsNullOrWhiteSpace(payload.Title))
        {
            return Rejected(item, "Title is required.");
        }

        if (payload.EndAt < payload.StartAt)
        {
            return Rejected(item, "End time must be after start time.");
        }

        var now = clock.UtcNow;

        if (existing is null)
        {
            // First time the server has seen this id — trust the device-generated UUID as the
            // entity id (offline-first: ids are minted on-device, not assigned by the server).
            existing = new CalendarEvent
            {
                Id = item.EntityId,
                CoupleId = coupleId,
                CreatedByUserId = currentUser.UserId,
                CreatedAt = now,
                Version = 0, // bumped to 1 below, alongside the update-path's bump — one place sets it
            };
            db.CalendarEvents.Add(existing);
        }

        existing.Title = payload.Title;
        existing.Description = payload.Description;
        existing.StartAt = payload.StartAt;
        existing.EndAt = payload.EndAt;
        existing.AllDay = payload.AllDay;
        existing.Location = payload.Location;
        existing.ReminderAt = payload.ReminderAt;
        existing.UpdatedAt = now;
        existing.UpdatedByUserId = currentUser.UserId;
        existing.Version += 1;

        return Accepted(item, existing.Version, existing.UpdatedAt);
    }

    /// <summary>
    /// Accounts are never deleted through sync (see the Phase 3 spec: "Do not allow destructive
    /// deletion" — a partner's historical transactions may still reference this account). The
    /// only way to retire one is UPDATE with IsActive = false. OpeningBalance is accepted from
    /// the payload only on first CREATE; an UPDATE can never move it, since that would be a
    /// silent, unexplained balance mutation with no corresponding Transaction — see
    /// MoneyCalculator, which trusts OpeningBalance as a fixed starting point forever.
    /// </summary>
    private async Task<SyncPushResultItemDto> ApplyAccountChangeAsync(Guid coupleId, SyncPushItemDto item, CancellationToken ct)
    {
        if (item.Operation == SyncOperation.Delete)
        {
            return Rejected(item, "Accounts cannot be deleted — deactivate instead.");
        }

        var existing = await db.Accounts.FirstOrDefaultAsync(a => a.Id == item.EntityId, ct);

        if (existing is not null && existing.CoupleId != coupleId)
        {
            return Rejected(item, "You may only sync your own couple's accounts.");
        }

        if (existing is not null && item.ClientUpdatedAt < existing.UpdatedAt)
        {
            return StaleWrite(item, existing.Version, existing.UpdatedAt);
        }

        AccountPayloadDto? payload;
        try
        {
            payload = item.Payload.Deserialize<AccountPayloadDto>(JsonOptions);
        }
        catch (JsonException)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (payload is null)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (string.IsNullOrWhiteSpace(payload.Name))
        {
            return Rejected(item, "Name is required.");
        }

        if (!AccountType.IsValid(payload.Type))
        {
            return Rejected(item, "Invalid account type.");
        }

        if (!IsValidCurrencyCode(payload.Currency))
        {
            return Rejected(item, "Invalid currency code.");
        }

        if (Math.Abs(payload.OpeningBalance) > MaxMoneyAmount)
        {
            return Rejected(item, "Opening balance exceeds the maximum allowed.");
        }

        var now = clock.UtcNow;

        if (existing is null)
        {
            existing = new Account
            {
                Id = item.EntityId,
                CoupleId = coupleId,
                CreatedByUserId = currentUser.UserId,
                CreatedAt = now,
                OpeningBalance = payload.OpeningBalance, // set once, at creation, only
                Version = 0, // bumped to 1 below, alongside the update-path's bump — one place sets it
            };
            db.Accounts.Add(existing);
        }

        existing.Name = payload.Name;
        existing.Type = payload.Type;
        existing.Icon = payload.Icon;
        existing.Currency = payload.Currency;
        existing.IsActive = payload.IsActive;
        existing.UpdatedAt = now;
        existing.UpdatedByUserId = currentUser.UserId;
        existing.Version += 1;

        return Accepted(item, existing.Version, existing.UpdatedAt);
    }

    /// <summary>Same create-vs-update-by-existence + soft-delete shape as <see cref="ApplyCalendarEventChangeAsync"/>. Every financial-consistency rule (§45-47 of the spec) lives here as validation — the balance itself is never stored/mutated directly (see MoneyCalculator).</summary>
    private async Task<SyncPushResultItemDto> ApplyTransactionChangeAsync(Guid coupleId, SyncPushItemDto item, CancellationToken ct)
    {
        var existing = await db.Transactions.FirstOrDefaultAsync(t => t.Id == item.EntityId, ct);

        if (existing is not null && existing.CoupleId != coupleId)
        {
            return Rejected(item, "You may only sync your own couple's transactions.");
        }

        if (item.Operation == SyncOperation.Delete)
        {
            if (existing is null)
            {
                return Accepted(item, serverVersion: null, serverUpdatedAt: null);
            }
            if (item.ClientUpdatedAt < existing.UpdatedAt)
            {
                return StaleWrite(item, existing.Version, existing.UpdatedAt);
            }

            existing.IsDeleted = true;
            existing.UpdatedAt = clock.UtcNow;
            existing.UpdatedByUserId = currentUser.UserId;
            existing.Version += 1;
            return Accepted(item, existing.Version, existing.UpdatedAt);
        }

        if (existing is not null && item.ClientUpdatedAt < existing.UpdatedAt)
        {
            return StaleWrite(item, existing.Version, existing.UpdatedAt);
        }

        TransactionPayloadDto? payload;
        try
        {
            payload = item.Payload.Deserialize<TransactionPayloadDto>(JsonOptions);
        }
        catch (JsonException)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (payload is null)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (!TransactionType.IsValid(payload.Type))
        {
            return Rejected(item, "Invalid transaction type.");
        }

        if (payload.Amount <= 0)
        {
            return Rejected(item, "Amount must be greater than zero.");
        }

        if (payload.Amount > MaxMoneyAmount)
        {
            return Rejected(item, "Amount exceeds the maximum allowed.");
        }

        if (!IsValidCurrencyCode(payload.Currency))
        {
            return Rejected(item, "Invalid currency code.");
        }

        if (!TransactionCategory.IsValidForType(payload.Type, payload.Category))
        {
            return Rejected(item, payload.Type == TransactionType.Transfer
                ? "A transfer cannot have a category."
                : "Invalid category.");
        }

        var sourceAccount = await db.Accounts.FirstOrDefaultAsync(a => a.Id == payload.AccountId && a.CoupleId == coupleId, ct);
        if (sourceAccount is null)
        {
            return Rejected(item, "Account must belong to your couple.");
        }

        if (payload.Type == TransactionType.Transfer)
        {
            if (payload.DestinationAccountId is null)
            {
                return Rejected(item, "A transfer requires a destination account.");
            }
            if (payload.DestinationAccountId == payload.AccountId)
            {
                return Rejected(item, "Source and destination accounts must be different.");
            }
            var destinationAccount = await db.Accounts.FirstOrDefaultAsync(a => a.Id == payload.DestinationAccountId && a.CoupleId == coupleId, ct);
            if (destinationAccount is null)
            {
                return Rejected(item, "Destination account must belong to your couple.");
            }
            // MVP: no currency conversion — a transfer only makes sense between accounts sharing
            // one currency, and the transaction's own currency must agree with both.
            if (sourceAccount.Currency != destinationAccount.Currency || payload.Currency != sourceAccount.Currency)
            {
                return Rejected(item, "Transfer requires matching currencies.");
            }
        }
        else if (payload.DestinationAccountId is not null)
        {
            return Rejected(item, "Only a transfer may have a destination account.");
        }

        if (payload.PaidByUserId is Guid paidByUserId)
        {
            // Never trust the client's claim that a given user id is the couple's partner — a
            // fake or stale (e.g. an ex-partner's) id must be rejected, not silently stored.
            var isActiveMember = await db.CoupleMembers
                .AnyAsync(m => m.CoupleId == coupleId && m.UserId == paidByUserId && m.LeftAt == null, ct);
            if (!isActiveMember)
            {
                return Rejected(item, "paidByUserId must be an active member of your couple.");
            }
        }

        var now = clock.UtcNow;

        if (existing is null)
        {
            // First time the server has seen this id — trust the device-generated UUID, same as
            // calendar events (offline-first: ids are minted on-device, not assigned server-side).
            existing = new Transaction
            {
                Id = item.EntityId,
                CoupleId = coupleId,
                CreatedByUserId = currentUser.UserId,
                CreatedAt = now,
                Version = 0, // bumped to 1 below, alongside the update-path's bump — one place sets it
            };
            db.Transactions.Add(existing);
        }

        existing.Type = payload.Type;
        existing.Amount = payload.Amount;
        existing.Currency = payload.Currency;
        existing.AccountId = payload.AccountId;
        existing.DestinationAccountId = payload.DestinationAccountId;
        existing.Category = payload.Category;
        existing.Description = payload.Description;
        existing.TransactionDate = payload.TransactionDate;
        existing.Notes = payload.Notes;
        existing.PaidByUserId = payload.PaidByUserId;
        existing.UpdatedAt = now;
        existing.UpdatedByUserId = currentUser.UserId;
        existing.Version += 1;

        return Accepted(item, existing.Version, existing.UpdatedAt);
    }

    /// <summary>Same create-vs-update-by-existence + soft-delete shape as calendar events/transactions, plus the "at most one active budget per couple+year+month+category" rule (also enforced by a filtered unique index — see BudgetConfiguration — as a defense-in-depth backstop).</summary>
    private async Task<SyncPushResultItemDto> ApplyBudgetChangeAsync(Guid coupleId, SyncPushItemDto item, CancellationToken ct)
    {
        var existing = await db.Budgets.FirstOrDefaultAsync(b => b.Id == item.EntityId, ct);

        if (existing is not null && existing.CoupleId != coupleId)
        {
            return Rejected(item, "You may only sync your own couple's budgets.");
        }

        if (item.Operation == SyncOperation.Delete)
        {
            if (existing is null)
            {
                return Accepted(item, serverVersion: null, serverUpdatedAt: null);
            }
            if (item.ClientUpdatedAt < existing.UpdatedAt)
            {
                return StaleWrite(item, existing.Version, existing.UpdatedAt);
            }

            existing.IsDeleted = true;
            existing.UpdatedAt = clock.UtcNow;
            existing.UpdatedByUserId = currentUser.UserId;
            existing.Version += 1;
            return Accepted(item, existing.Version, existing.UpdatedAt);
        }

        if (existing is not null && item.ClientUpdatedAt < existing.UpdatedAt)
        {
            return StaleWrite(item, existing.Version, existing.UpdatedAt);
        }

        BudgetPayloadDto? payload;
        try
        {
            payload = item.Payload.Deserialize<BudgetPayloadDto>(JsonOptions);
        }
        catch (JsonException)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (payload is null)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (!TransactionCategory.IsValidExpenseCategory(payload.Category))
        {
            return Rejected(item, "Invalid category.");
        }

        if (payload.Month is < 1 or > 12)
        {
            return Rejected(item, "Month must be between 1 and 12.");
        }

        if (payload.Year is < 2000 or > 2100)
        {
            return Rejected(item, "Invalid year.");
        }

        if (payload.Amount <= 0)
        {
            return Rejected(item, "Amount must be greater than zero.");
        }

        if (payload.Amount > MaxMoneyAmount)
        {
            return Rejected(item, "Amount exceeds the maximum allowed.");
        }

        if (!IsValidCurrencyCode(payload.Currency))
        {
            return Rejected(item, "Invalid currency code.");
        }

        var duplicateExists = await db.Budgets.AnyAsync(
            b => b.CoupleId == coupleId && b.Year == payload.Year && b.Month == payload.Month
                 && b.Category == payload.Category && !b.IsDeleted && b.Id != item.EntityId, ct);
        if (duplicateExists)
        {
            return Rejected(item, "A budget for this category and month already exists.");
        }

        var now = clock.UtcNow;

        if (existing is null)
        {
            existing = new Budget
            {
                Id = item.EntityId,
                CoupleId = coupleId,
                CreatedByUserId = currentUser.UserId,
                CreatedAt = now,
                Version = 0, // bumped to 1 below, alongside the update-path's bump — one place sets it
            };
            db.Budgets.Add(existing);
        }

        existing.Category = payload.Category;
        existing.Year = payload.Year;
        existing.Month = payload.Month;
        existing.Amount = payload.Amount;
        existing.Currency = payload.Currency;
        existing.UpdatedAt = now;
        existing.UpdatedByUserId = currentUser.UserId;
        existing.Version += 1;

        return Accepted(item, existing.Version, existing.UpdatedAt);
    }

    private static bool IsValidCurrencyCode(string? currency) =>
        currency is not null && currency.Length == 3 && currency.All(c => c is >= 'A' and <= 'Z');

    private static SyncPushResultItemDto Accepted(SyncPushItemDto item, int? serverVersion, DateTimeOffset? serverUpdatedAt) => new()
    {
        EntityId = item.EntityId,
        EntityType = item.EntityType,
        Accepted = true,
        ServerVersion = serverVersion,
        ServerUpdatedAt = serverUpdatedAt,
    };

    private static SyncPushResultItemDto StaleWrite(SyncPushItemDto item, int serverVersion, DateTimeOffset serverUpdatedAt) => new()
    {
        EntityId = item.EntityId,
        EntityType = item.EntityType,
        Accepted = false,
        Error = "stale_write",
        ServerVersion = serverVersion,
        ServerUpdatedAt = serverUpdatedAt,
    };

    private static SyncPushResultItemDto Rejected(SyncPushItemDto item, string error) => new()
    {
        EntityId = item.EntityId,
        EntityType = item.EntityType,
        Accepted = false,
        Error = error,
    };
}
