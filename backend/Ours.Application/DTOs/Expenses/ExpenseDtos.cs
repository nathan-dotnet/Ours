using System.ComponentModel.DataAnnotations;

namespace Ours.Application.DTOs.Expenses;

/// <summary>
/// Shape of the "expense" sync payload (see <see cref="Sync.SyncPushItemDto"/>). Like
/// calendar_event, expenses only ever move through the generic sync push/pull — there is no
/// dedicated REST verb for them.
/// </summary>
public sealed class ExpensePayloadDto
{
    /// <summary>
    /// Sent/received as a plain JSON number, which System.Text.Json parses directly to/from
    /// <c>decimal</c> without ever going through a floating-point type — the mobile side has its
    /// own analogous safeguard converting to/from integer cents at its own boundary (see
    /// mobile/src/utils/money.ts). Range/positivity is validated in SyncService, not here, since
    /// [Range] on a nullable-unfriendly value type interacts awkwardly with "reject, don't clamp".
    /// </summary>
    [Required]
    public decimal Amount { get; init; }

    [Required, MaxLength(3)]
    public string Currency { get; init; } = "PHP";

    [MaxLength(2000)]
    public string? Description { get; init; }

    [Required, MaxLength(20)]
    public string Category { get; init; } = string.Empty;

    [Required]
    public DateOnly ExpenseDate { get; init; }

    [MaxLength(2000)]
    public string? Notes { get; init; }

    /// <summary>Optional "who actually paid" — must be an active member of the caller's own couple; validated in SyncService, never trusted as-is.</summary>
    public Guid? PaidByUserId { get; init; }

    /// <summary>
    /// Set by the server on pull; a client push doesn't need to (and can't) set who created an
    /// expense — the server always derives that from the authenticated user on first creation.
    /// </summary>
    public Guid? CreatedByUserId { get; init; }
}
