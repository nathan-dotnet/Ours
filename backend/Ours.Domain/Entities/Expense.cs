using Ours.Domain.Common;

namespace Ours.Domain.Entities;

/// <summary>
/// A couple-shared expense. Follows the same shape <see cref="CalendarEvent"/> established in
/// Phase 2 for the sync pipeline: sync metadata (UpdatedAt/UpdatedByUserId/Version/IsDeleted)
/// alongside the domain fields.
/// </summary>
public class Expense : ISyncableEntity
{
    /// <summary>Device-generated (see the mobile UUID convention) — trusted as-is on first create.</summary>
    public Guid Id { get; set; }

    public Guid CoupleId { get; set; }

    /// <summary>
    /// Exact monetary amount — <c>decimal</c>/Postgres <c>numeric</c> throughout, never a
    /// floating-point type, so it survives the full mobile -> sync -> API -> Postgres -> pull ->
    /// SQLite -> UI round trip without rounding drift. Always positive; there is no "negative
    /// expense" concept in this MVP.
    /// </summary>
    public decimal Amount { get; set; }

    /// <summary>ISO 4217 3-letter code (e.g. "PHP"). Not restricted to a fixed list server-side — see <see cref="ExpenseCategory"/> for the one field that *is* a controlled set.</summary>
    public string Currency { get; set; } = "PHP";

    public string? Description { get; set; }

    /// <summary>One of <see cref="ExpenseCategory"/>'s constants.</summary>
    public string Category { get; set; } = ExpenseCategory.Other;

    /// <summary>
    /// The day the expense actually happened — independent of <see cref="CreatedAt"/> (a user can
    /// log an expense after the fact). <c>DateOnly</c> has no time-of-day/timezone component at
    /// all, which is what prevents it from ever shifting by a day depending on the reader's offset.
    /// </summary>
    public DateOnly ExpenseDate { get; set; }

    public string? Notes { get; set; }

    /// <summary>
    /// Optional "who actually paid" — distinct from <see cref="CreatedByUserId"/> (who logged it).
    /// Null means unspecified. When set, must be an active member of this same couple — validated
    /// server-side in <c>SyncService.ApplyExpenseChangeAsync</c>, never trusted from the client.
    /// </summary>
    public Guid? PaidByUserId { get; set; }

    public Guid CreatedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Guid UpdatedByUserId { get; set; }

    public int Version { get; set; } = 1;

    public bool IsDeleted { get; set; }
}
