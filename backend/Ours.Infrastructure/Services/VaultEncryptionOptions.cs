namespace Ours.Infrastructure.Services;

/// <summary>
/// Bound from configuration section "Vault". The keys must come from configuration/environment/
/// user-secrets — never hard-coded — see backend/README.md. Keyed by version (as a string, since
/// configuration sections are string-keyed) so a key can be rotated later by adding a new entry
/// and bumping <see cref="CurrentKeyVersion"/> without losing the ability to decrypt older rows.
/// </summary>
public class VaultEncryptionOptions
{
    public const string SectionName = "Vault";

    /// <summary>Which entry in <see cref="Keys"/> new encryptions use.</summary>
    public int CurrentKeyVersion { get; set; } = 1;

    /// <summary>Version (as a string) -> base64-encoded 256-bit (32-byte) AES key.</summary>
    public Dictionary<string, string> Keys { get; set; } = [];
}
