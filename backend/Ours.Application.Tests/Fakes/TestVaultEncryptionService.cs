using Microsoft.Extensions.Options;
using Ours.Infrastructure.Services;

namespace Ours.Application.Tests.Fakes;

/// <summary>
/// Not a stub — the real <see cref="VaultEncryptionService"/> (AES-GCM is fast and deterministic
/// given a key, so there's no reason to fake it), just constructed with a fixed test-only key
/// instead of reading configuration/user-secrets.
/// </summary>
public static class TestVaultEncryptionService
{
    // Exactly 32 bytes ("test-only-vault-key-32-bytes-ok!"), base64-encoded — a real AES-256 key,
    // just one that only ever exists in this test project, never anywhere a real vault password
    // would be encrypted with it.
    private const string TestKeyBase64 = "dGVzdC1vbmx5LXZhdWx0LWtleS0zMi1ieXRlcy1vayE=";

    // A different (also test-only) 32-byte key, for tests proving decryption fails under the wrong key.
    private const string OtherTestKeyBase64 = "YW5vdGhlci10ZXN0LW9ubHktdmF1bHQta2V5LTMyYiE=";

    public static VaultEncryptionService Create() => new(Options.Create(new VaultEncryptionOptions
    {
        CurrentKeyVersion = 1,
        Keys = new Dictionary<string, string> { ["1"] = TestKeyBase64 },
    }));

    public static VaultEncryptionService CreateWithDifferentKey() => new(Options.Create(new VaultEncryptionOptions
    {
        CurrentKeyVersion = 1,
        Keys = new Dictionary<string, string> { ["1"] = OtherTestKeyBase64 },
    }));
}
