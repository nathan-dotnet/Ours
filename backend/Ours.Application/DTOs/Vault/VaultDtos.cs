using System.ComponentModel.DataAnnotations;

namespace Ours.Application.DTOs.Vault;

/// <summary>
/// Shape of the "vault_item" sync payload (see <see cref="Sync.SyncPushItemDto"/>). Unlike every
/// other synced entity, this DTO's fields split cleanly by direction:
///  - <see cref="Password"/> is push-only — the new plaintext value, present only when the user
///    is setting/changing it (omitted on an edit that leaves the password alone, so the server
///    knows not to touch the existing encrypted value — see the Vault spec's "don't unnecessarily
///    re-encrypt"). Never populated on a pulled change.
///  - <see cref="EncryptedPassword"/>/<see cref="Nonce"/>/<see cref="AuthTag"/>/<see cref="KeyVersion"/>
///    are pull-only — the server's authoritative encrypted representation, base64-encoded for
///    JSON transport. A push never needs to set these; the server derives them from
///    <see cref="Password"/> via IVaultEncryptionService.
/// </summary>
public sealed class VaultItemPayloadDto
{
    [Required, MaxLength(200)]
    public string Title { get; init; } = string.Empty;

    [MaxLength(200)]
    public string? Username { get; init; }

    /// <summary>Push-only new plaintext password. Never logged, never echoed back — see SyncService.ApplyVaultItemChangeAsync.</summary>
    [MaxLength(200)]
    public string? Password { get; init; }

    [MaxLength(500)]
    public string? WebsiteUrl { get; init; }

    [Required, MaxLength(20)]
    public string Category { get; init; } = string.Empty;

    [MaxLength(2000)]
    public string? Notes { get; init; }

    /// <summary>Pull-only. Base64 AES-GCM ciphertext.</summary>
    public string? EncryptedPassword { get; init; }

    /// <summary>Pull-only. Base64 GCM nonce.</summary>
    public string? Nonce { get; init; }

    /// <summary>Pull-only. Base64 GCM authentication tag.</summary>
    public string? AuthTag { get; init; }

    /// <summary>Pull-only. Which server key encrypted this row.</summary>
    public int? KeyVersion { get; init; }

    /// <summary>Set by the server on pull; a client push never sets this — derived from the authenticated user on first creation.</summary>
    public Guid? CreatedByUserId { get; init; }
}

/// <summary>Response for the one dedicated (non-sync) vault endpoint — see VaultController.Reveal. Never included in a list/pull response.</summary>
public sealed class VaultRevealResponseDto
{
    public string Password { get; init; } = string.Empty;
}
