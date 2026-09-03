using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Ours.Application.Abstractions;
using Ours.Application.Common;
using Ours.Application.DTOs.Calendar;
using Ours.Application.DTOs.Couples;
using Ours.Application.DTOs.Expenses;
using Ours.Application.DTOs.Sync;
using Ours.Domain.Entities;

namespace Ours.Application.Services;

/// <summary>
/// Generic, entity-agnostic sync endpoint implementation. Phase 1 registered a handler for
/// "couple_profile" purely to prove the offline round trip end-to-end; Phase 2 adds
/// "calendar_event" (see <see cref="CalendarEventEntityType"/>) as the first real feature to
/// use it. Future phases add a case per new entity type (e.g. "expense") to
/// <see cref="PullAsync"/> and <see cref="PushAsync"/> rather than standing up a parallel sync
/// mechanism.
/// </summary>
public class SyncService(
    IApplicationDbContext db,
    ICurrentUserService currentUser,
    IDateTimeProvider clock)
{
    public const string CoupleProfileEntityType = "couple_profile";
    public const string CalendarEventEntityType = "calendar_event";
    public const string ExpenseEntityType = "expense";

    /// <summary>Application-level sanity ceiling — independent of the numeric(18,2) column's actual headroom — rejecting an obviously-mistyped amount (e.g. an extra zero) rather than silently accepting it.</summary>
    private const decimal MaxExpenseAmount = 10_000_000m;

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

        var expenses = await db.Expenses
            .Where(e => e.CoupleId == coupleId && (since == null || e.UpdatedAt > since))
            .ToListAsync(ct);
        foreach (var expense in expenses)
        {
            changes.Add(new SyncChangeDto
            {
                EntityType = ExpenseEntityType,
                EntityId = expense.Id,
                Operation = expense.IsDeleted ? SyncOperation.Delete : SyncOperation.Update,
                Payload = expense.IsDeleted ? null : new ExpensePayloadDto
                {
                    Amount = expense.Amount,
                    Currency = expense.Currency,
                    Description = expense.Description,
                    Category = expense.Category,
                    ExpenseDate = expense.ExpenseDate,
                    Notes = expense.Notes,
                    PaidByUserId = expense.PaidByUserId,
                    CreatedByUserId = expense.CreatedByUserId,
                },
                UpdatedAt = expense.UpdatedAt,
                UpdatedByUserId = expense.UpdatedByUserId,
                Version = expense.Version,
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
                ExpenseEntityType => await ApplyExpenseChangeAsync(coupleId, item, ct),
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

    /// <summary>Same create-vs-update-by-existence shape as <see cref="ApplyCalendarEventChangeAsync"/> — see its doc comment.</summary>
    private async Task<SyncPushResultItemDto> ApplyExpenseChangeAsync(Guid coupleId, SyncPushItemDto item, CancellationToken ct)
    {
        var existing = await db.Expenses.FirstOrDefaultAsync(e => e.Id == item.EntityId, ct);

        if (existing is not null && existing.CoupleId != coupleId)
        {
            return Rejected(item, "You may only sync your own couple's expenses.");
        }

        if (item.Operation == SyncOperation.Delete)
        {
            if (existing is null)
            {
                // Already gone (or a retry of a delete that already landed) — idempotent success.
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

        ExpensePayloadDto? payload;
        try
        {
            payload = item.Payload.Deserialize<ExpensePayloadDto>(JsonOptions);
        }
        catch (JsonException)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (payload is null)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (payload.Amount <= 0)
        {
            return Rejected(item, "Amount must be greater than zero.");
        }

        if (payload.Amount > MaxExpenseAmount)
        {
            return Rejected(item, "Amount exceeds the maximum allowed.");
        }

        if (!IsValidCurrencyCode(payload.Currency))
        {
            return Rejected(item, "Invalid currency code.");
        }

        if (!ExpenseCategory.IsValid(payload.Category))
        {
            return Rejected(item, "Invalid category.");
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
            existing = new Expense
            {
                Id = item.EntityId,
                CoupleId = coupleId,
                CreatedByUserId = currentUser.UserId,
                CreatedAt = now,
                Version = 0, // bumped to 1 below, alongside the update-path's bump — one place sets it
            };
            db.Expenses.Add(existing);
        }

        existing.Amount = payload.Amount;
        existing.Currency = payload.Currency;
        existing.Description = payload.Description;
        existing.Category = payload.Category;
        existing.ExpenseDate = payload.ExpenseDate;
        existing.Notes = payload.Notes;
        existing.PaidByUserId = payload.PaidByUserId;
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
