using Ours.Domain.Common;

namespace Ours.Domain.Entities;

/// <summary>
/// Where a couple's money is stored (a bank account, e-wallet, or cash on hand). Follows
/// <see cref="CalendarEvent"/>'s sync shape.
///
/// Deliberately has no stored "current balance" column — see <c>MoneyCalculator</c>. The
/// balance is always <see cref="OpeningBalance"/> plus every non-deleted <see cref="Transaction"/>
/// touching this account, computed fresh every time, so there is exactly one place (not five)
/// that can ever disagree with itself, and an edited/deleted transaction never needs an explicit
/// "reverse the old effect" step — recomputing from current data is automatically correct.
/// </summary>
public class Account : ISyncableEntity
{
    /// <summary>Device-generated (see the mobile UUID convention) — trusted as-is on first create.</summary>
    public Guid Id { get; set; }

    public Guid CoupleId { get; set; }

    public string Name { get; set; } = string.Empty;

    /// <summary>One of <see cref="AccountType"/>'s constants.</summary>
    public string Type { get; set; } = AccountType.Other;

    /// <summary>
    /// A brand/icon identifier (e.g. "bpi", "gcash", "cash") the client maps to a local
    /// asset/emoji — never a URL to an external image (see the Phase 3 spec's "Account Logos").
    /// Unrecognized values fall back to a generic icon client-side; the server does not validate
    /// this against a fixed list, so new brands can be added mobile-side with no migration.
    /// </summary>
    public string Icon { get; set; } = "generic";

    /// <summary>
    /// Set once at creation and never changed by an UPDATE afterward — see the "Account balance
    /// model" section of the spec: a balance can only move by recording a Transaction, never by
    /// silently editing this field once transactions may already exist against the account.
    /// </summary>
    public decimal OpeningBalance { get; set; }

    public string Currency { get; set; } = "PHP";

    /// <summary>A deactivated account is hidden from the active dashboard/totals but its history (and the account row itself) is kept — see "Do not allow destructive deletion".</summary>
    public bool IsActive { get; set; } = true;

    public Guid CreatedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Guid UpdatedByUserId { get; set; }

    public int Version { get; set; } = 1;

    public bool IsDeleted { get; set; }
}
