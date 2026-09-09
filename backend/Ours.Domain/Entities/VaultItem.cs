using Ours.Domain.Common;

namespace Ours.Domain.Entities;

/// <summary>
/// A shared credential in the couple's password vault. Follows <see cref="CalendarEvent"/>'s
/// sync shape. The password itself is <b>never</b> stored in plaintext here — only the AES-GCM
/// ciphertext plus what's needed to authenticate/decrypt it (<see cref="Nonce"/>,
/// <see cref="AuthTag"/>, <see cref="KeyVersion"/>) — see
/// <c>Ours.Application.Abstractions.IVaultEncryptionService</c>, the one place plaintext ever
/// exists server-side, and only for the instant it takes to encrypt or decrypt it.
/// </summary>
public class VaultItem : ISyncableEntity
{
    /// <summary>Device-generated (see the mobile UUID convention) — trusted as-is on first create.</summary>
    public Guid Id { get; set; }

    public Guid CoupleId { get; set; }

    public string Title { get; set; } = string.Empty;

    public string? Username { get; set; }

    /// <summary>AES-GCM ciphertext. Meaningless without <see cref="Nonce"/>/<see cref="AuthTag"/> and the key identified by <see cref="KeyVersion"/>.</summary>
    public byte[] EncryptedPassword { get; set; } = [];

    /// <summary>96-bit GCM nonce — freshly random on every encryption, even for the same plaintext, so ciphertexts never repeat.</summary>
    public byte[] Nonce { get; set; } = [];

    /// <summary>128-bit GCM authentication tag — decryption fails outright if the ciphertext was tampered with.</summary>
    public byte[] AuthTag { get; set; } = [];

    /// <summary>Which server-side key encrypted this row — lets the key be rotated later without a data migration (old rows keep decrypting with their original key version).</summary>
    public int KeyVersion { get; set; }

    public string? WebsiteUrl { get; set; }

    /// <summary>One of <see cref="VaultCategory"/>'s constants.</summary>
    public string Category { get; set; } = VaultCategory.Other;

    public string? Notes { get; set; }

    public Guid CreatedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public Guid UpdatedByUserId { get; set; }

    public int Version { get; set; } = 1;

    public bool IsDeleted { get; set; }
}
