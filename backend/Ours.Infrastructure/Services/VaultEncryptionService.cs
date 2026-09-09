using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Ours.Application.Abstractions;

namespace Ours.Infrastructure.Services;

/// <summary>
/// AES-256-GCM authenticated encryption — a modern AEAD cipher, not a custom/home-grown scheme.
/// A fresh random nonce every call is what makes two encryptions of the same plaintext produce
/// different ciphertext; the authentication tag is what makes a tampered ciphertext fail to
/// decrypt at all rather than silently returning garbage.
/// </summary>
public class VaultEncryptionService : IVaultEncryptionService
{
    private const int NonceSizeBytes = 12; // AesGcm.NonceByteSizes.MaxSize
    private const int TagSizeBytes = 16; // AesGcm.TagByteSizes.MaxSize
    private const int KeySizeBytes = 32; // AES-256

    private readonly VaultEncryptionOptions _options;
    private readonly IReadOnlyDictionary<int, byte[]> _keysByVersion;

    public VaultEncryptionService(IOptions<VaultEncryptionOptions> options)
    {
        _options = options.Value;
        var keys = new Dictionary<int, byte[]>();
        foreach (var (versionText, base64Key) in _options.Keys)
        {
            if (!int.TryParse(versionText, out var version))
            {
                throw new InvalidOperationException($"Vault:Keys contains a non-numeric key version '{versionText}'.");
            }

            byte[] key;
            try
            {
                key = Convert.FromBase64String(base64Key);
            }
            catch (FormatException)
            {
                throw new InvalidOperationException($"Vault:Keys:{versionText} is not valid base64.");
            }

            if (key.Length != KeySizeBytes)
            {
                throw new InvalidOperationException($"Vault:Keys:{versionText} must decode to exactly {KeySizeBytes} bytes (AES-256), got {key.Length}.");
            }

            keys[version] = key;
        }
        _keysByVersion = keys;
    }

    public EncryptedSecret Encrypt(string plaintext)
    {
        var key = GetKey(_options.CurrentKeyVersion);
        var plaintextBytes = Encoding.UTF8.GetBytes(plaintext);
        var nonce = RandomNumberGenerator.GetBytes(NonceSizeBytes);
        var ciphertext = new byte[plaintextBytes.Length];
        var tag = new byte[TagSizeBytes];

        using var aesGcm = new AesGcm(key, TagSizeBytes);
        aesGcm.Encrypt(nonce, plaintextBytes, ciphertext, tag);

        return new EncryptedSecret(ciphertext, nonce, tag, _options.CurrentKeyVersion);
    }

    public string Decrypt(EncryptedSecret secret)
    {
        var key = GetKey(secret.KeyVersion);
        var plaintextBytes = new byte[secret.Ciphertext.Length];

        using var aesGcm = new AesGcm(key, TagSizeBytes);
        // Throws CryptographicException if the tag doesn't match — a tampered ciphertext (or the
        // wrong key/nonce/tag combination) never silently decrypts to garbage.
        aesGcm.Decrypt(secret.Nonce, secret.Ciphertext, secret.Tag, plaintextBytes);

        return Encoding.UTF8.GetString(plaintextBytes);
    }

    private byte[] GetKey(int version) =>
        _keysByVersion.TryGetValue(version, out var key)
            ? key
            : throw new InvalidOperationException($"No vault encryption key configured for version {version}.");
}
