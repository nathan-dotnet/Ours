using Microsoft.EntityFrameworkCore;
using Ours.Application.Abstractions;
using Ours.Application.Common;

namespace Ours.Application.Services;

/// <summary>
/// Create/update/delete for vault items all go through the generic sync push/pull, same as every
/// other feature (see SyncService.ApplyVaultItemChangeAsync) — this service exists only for the
/// one action that genuinely cannot be expressed as a sync operation: decrypting a specific
/// item's password on demand. A sync payload can never carry plaintext downstream (see
/// VaultItemPayloadDto), so "reveal" needs its own narrow, authenticated endpoint instead.
/// </summary>
public class VaultService(IApplicationDbContext db, ICurrentUserService currentUser, IVaultEncryptionService vaultEncryption)
{
    /// <summary>
    /// Returns the plaintext password for one vault item — only ever in memory for the duration
    /// of this call and the HTTP response that carries it; never logged, cached, or persisted
    /// anywhere. Same active-couple-membership derivation as every other couple-scoped
    /// operation: coupleId always comes from the caller's own JWT claim, never the client, and a
    /// stale token from an ended couple is rejected exactly like SyncService.PushAsync rejects one.
    /// </summary>
    public async Task<string> RevealAsync(Guid itemId, CancellationToken ct = default)
    {
        var coupleId = currentUser.CoupleId ?? throw new ForbiddenAppException("You must belong to a couple to access the vault.");

        var coupleIsActive = await db.Couples.AnyAsync(c => c.Id == coupleId && !c.IsDeleted, ct);
        if (!coupleIsActive)
        {
            throw new ForbiddenAppException("Your couple is no longer active.");
        }

        var item = await db.VaultItems.FirstOrDefaultAsync(v => v.Id == itemId && !v.IsDeleted, ct);
        // Deliberately the same NotFound whether the id doesn't exist at all or belongs to
        // another couple entirely — nothing about a non-member's request should distinguish
        // "wrong id" from "not yours," the same way a 404 (not a 403) already reads elsewhere in
        // this app for a resource that isn't the caller's to see in the first place.
        if (item is null || item.CoupleId != coupleId)
        {
            throw new NotFoundAppException("Vault item not found.");
        }

        return vaultEncryption.Decrypt(new EncryptedSecret(item.EncryptedPassword, item.Nonce, item.AuthTag, item.KeyVersion));
    }
}
