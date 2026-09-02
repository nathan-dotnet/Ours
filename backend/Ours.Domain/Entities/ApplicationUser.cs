using Microsoft.AspNetCore.Identity;

namespace Ours.Domain.Entities;

/// <summary>
/// The Identity-backed user account. Kept intentionally thin — profile/relationship
/// data that is shared between partners lives on <see cref="Couple"/> instead.
/// </summary>
public class ApplicationUser : IdentityUser<Guid>
{
    public string DisplayName { get; set; } = string.Empty;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// A user belongs to at most one couple in V1. Nullable until they create/join one.
    /// </summary>
    public Guid? CoupleId { get; set; }

    public Couple? Couple { get; set; }
}
