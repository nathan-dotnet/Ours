using Ours.Domain.Common;

namespace Ours.Domain.Entities;

/// <summary>
/// A planned monthly spending limit for one expense category. Informational only — see the
/// Phase 3 spec's "Budget Calculation": nothing prevents a couple from spending past it, this
/// just drives the progress UI (spent is computed from Expense transactions, never stored here).
/// </summary>
public class Budget : ISyncableEntity
{
    /// <summary>Device-generated (see the mobile UUID convention) — trusted as-is on first create.</summary>
    public Guid Id { get; set; }

    public Guid CoupleId { get; set; }

    /// <summary>
    /// A preset from <see cref="TransactionCategory"/>.ExpenseCategories, or a couple's own custom
    /// name — see <see cref="TransactionCategory"/>. Budgets are always against spending, never
    /// income or transfers.
    /// </summary>
    public string Category { get; set; } = TransactionCategory.Other;

    public int Year { get; set; }

    /// <summary>1-12.</summary>
    public int Month { get; set; }

    public decimal Amount { get; set; }

    public string Currency { get; set; } = "PHP";

    public Guid CreatedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Guid UpdatedByUserId { get; set; }

    public int Version { get; set; } = 1;

    /// <summary>
    /// A deleted budget also frees up its (CoupleId, Year, Month, Category) slot for a new one —
    /// "active" and "not deleted" are the same concept for a Budget, so there's no separate
    /// IsActive flag to keep in sync with this.
    /// </summary>
    public bool IsDeleted { get; set; }
}
