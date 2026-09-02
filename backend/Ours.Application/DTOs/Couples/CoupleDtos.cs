using System.ComponentModel.DataAnnotations;
using Ours.Application.DTOs.Auth;

namespace Ours.Application.DTOs.Couples;

public sealed class JoinCoupleRequestDto
{
    [Required, MaxLength(20)]
    public string InviteCode { get; init; } = string.Empty;
}

/// <summary>
/// Shape of the "couple_profile" sync payload (see <see cref="Sync.SyncPushItemDto"/>). Couple
/// profile edits always flow through the generic sync push, never a dedicated REST verb — that
/// keeps a single write path whether the device is online or offline.
/// </summary>
public sealed class CoupleProfilePayloadDto
{
    [MaxLength(100)]
    public string? Nickname { get; init; }

    public DateOnly? AnniversaryDate { get; init; }
}

public sealed class CoupleMemberDto
{
    public Guid UserId { get; init; }
    public string DisplayName { get; init; } = string.Empty;
    public DateTimeOffset JoinedAt { get; init; }
}

public sealed class CoupleDto
{
    public Guid Id { get; init; }
    public string InviteCode { get; init; } = string.Empty;
    public string? Nickname { get; init; }
    public DateOnly? AnniversaryDate { get; init; }
    public DateTimeOffset UpdatedAt { get; init; }
    public Guid UpdatedByUserId { get; init; }
    public int Version { get; init; }
    public IReadOnlyList<CoupleMemberDto> Members { get; init; } = [];
}

/// <summary>
/// Returned by create/join: the couple plus a freshly-minted token pair, since the access
/// token's "coupleId" claim only becomes valid once membership exists.
/// </summary>
public sealed class CoupleActionResponseDto
{
    public CoupleDto Couple { get; init; } = null!;
    public AuthResponseDto Auth { get; init; } = null!;
}
