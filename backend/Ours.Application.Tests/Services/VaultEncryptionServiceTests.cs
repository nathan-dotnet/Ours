using Ours.Application.Abstractions;
using Ours.Application.Tests.Fakes;
using Xunit;

namespace Ours.Application.Tests.Services;

public class VaultEncryptionServiceTests
{
    [Fact]
    public void EncryptThenDecrypt_ReturnsTheOriginalPlaintext()
    {
        var service = TestVaultEncryptionService.Create();

        var encrypted = service.Encrypt("hunter2-super-secret");
        var decrypted = service.Decrypt(encrypted);

        Assert.Equal("hunter2-super-secret", decrypted);
    }

    [Fact]
    public void Encrypt_NeverProducesPlaintextInTheCiphertextBytes()
    {
        var service = TestVaultEncryptionService.Create();
        const string plaintext = "correct-horse-battery-staple";

        var encrypted = service.Encrypt(plaintext);

        var ciphertextAsLatin1 = System.Text.Encoding.Latin1.GetString(encrypted.Ciphertext);
        Assert.DoesNotContain(plaintext, ciphertextAsLatin1);
    }

    [Fact]
    public void TwoEncryptionsOfTheSamePlaintext_ProduceDifferentCiphertextAndNonce()
    {
        var service = TestVaultEncryptionService.Create();

        var first = service.Encrypt("same-password");
        var second = service.Encrypt("same-password");

        // A fresh random nonce every call is what guarantees this — reusing a nonce with the
        // same key is the one mistake that would break GCM's security guarantees entirely.
        Assert.NotEqual(Convert.ToBase64String(first.Nonce), Convert.ToBase64String(second.Nonce));
        Assert.NotEqual(Convert.ToBase64String(first.Ciphertext), Convert.ToBase64String(second.Ciphertext));
        // Both still decrypt to the same original value.
        Assert.Equal("same-password", service.Decrypt(first));
        Assert.Equal("same-password", service.Decrypt(second));
    }

    [Fact]
    public void Decrypt_WithTheWrongKey_ThrowsRatherThanReturningGarbageOrThePlaintext()
    {
        var service = TestVaultEncryptionService.Create();
        var otherService = TestVaultEncryptionService.CreateWithDifferentKey();
        var encrypted = service.Encrypt("a-real-password");

        Assert.ThrowsAny<System.Security.Cryptography.CryptographicException>(() => otherService.Decrypt(encrypted));
    }

    [Fact]
    public void Decrypt_WithATamperedCiphertext_FailsAuthenticationRatherThanSucceeding()
    {
        var service = TestVaultEncryptionService.Create();
        var encrypted = service.Encrypt("a-real-password");
        var tamperedCiphertext = (byte[])encrypted.Ciphertext.Clone();
        tamperedCiphertext[0] ^= 0xFF; // flip a bit — GCM's auth tag must now fail to verify

        var tampered = new EncryptedSecret(tamperedCiphertext, encrypted.Nonce, encrypted.Tag, encrypted.KeyVersion);

        Assert.Throws<System.Security.Cryptography.AuthenticationTagMismatchException>(() => service.Decrypt(tampered));
    }

    [Fact]
    public void Decrypt_WithATamperedAuthTag_FailsAuthentication()
    {
        var service = TestVaultEncryptionService.Create();
        var encrypted = service.Encrypt("a-real-password");
        var tamperedTag = (byte[])encrypted.Tag.Clone();
        tamperedTag[0] ^= 0xFF;

        var tampered = new EncryptedSecret(encrypted.Ciphertext, encrypted.Nonce, tamperedTag, encrypted.KeyVersion);

        Assert.Throws<System.Security.Cryptography.AuthenticationTagMismatchException>(() => service.Decrypt(tampered));
    }

    [Fact]
    public void Decrypt_ForAnUnconfiguredKeyVersion_ThrowsAClearError()
    {
        var service = TestVaultEncryptionService.Create();
        var encrypted = service.Encrypt("a-real-password");
        var wrongVersion = new EncryptedSecret(encrypted.Ciphertext, encrypted.Nonce, encrypted.Tag, KeyVersion: 999);

        Assert.Throws<InvalidOperationException>(() => service.Decrypt(wrongVersion));
    }

    [Fact]
    public void RejectsAKeyThatIsNotExactly32Bytes()
    {
        Assert.Throws<InvalidOperationException>(() => new Ours.Infrastructure.Services.VaultEncryptionService(
            Microsoft.Extensions.Options.Options.Create(new Ours.Infrastructure.Services.VaultEncryptionOptions
            {
                CurrentKeyVersion = 1,
                Keys = new Dictionary<string, string> { ["1"] = Convert.ToBase64String(new byte[16]) }, // AES-128 length, not AES-256
            })));
    }

    [Fact]
    public void EmptyPlaintext_StillEncryptsAndDecryptsCorrectly()
    {
        // Not a realistic vault password, but the encryption primitive itself shouldn't choke on it.
        var service = TestVaultEncryptionService.Create();

        var encrypted = service.Encrypt("");

        Assert.Equal("", service.Decrypt(encrypted));
    }
}
