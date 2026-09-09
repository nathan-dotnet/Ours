namespace Ours.Application.Abstractions;

/// <summary>
/// The AES-GCM ciphertext plus everything needed to authenticate and decrypt it. Deliberately
/// carries no plaintext — constructing one is the encryption boundary.
/// </summary>
public sealed record EncryptedSecret(byte[] Ciphertext, byte[] Nonce, byte[] Tag, int KeyVersion);

/// <summary>
/// The one place plaintext vault passwords ever exist server-side, and only transiently — a
/// concrete implementation (see Infrastructure) never persists, logs, or returns plaintext
/// itself; callers are responsible for not doing so either (see SyncService.ApplyVaultItemChangeAsync
/// and VaultService.RevealAsync, which never include a password in an exception message or log).
/// </summary>
public interface IVaultEncryptionService
{
    /// <summary>Encrypts with a fresh random nonce every call — even encrypting the same plaintext twice never produces the same ciphertext.</summary>
    EncryptedSecret Encrypt(string plaintext);

    /// <summary>Throws if the ciphertext was tampered with (auth tag mismatch) or no key exists for the given <see cref="EncryptedSecret.KeyVersion"/>.</summary>
    string Decrypt(EncryptedSecret secret);
}
