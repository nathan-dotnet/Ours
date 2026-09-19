using Microsoft.EntityFrameworkCore;
using Ours.Application.Abstractions;
using Ours.Application.DTOs.Push;
using Ours.Domain.Entities;

namespace Ours.Application.Services;

/// <summary>
/// Keeps one device's Expo push token associated with whichever user is currently signed in on
/// it. The mobile app calls Register right after obtaining notification permission/a token (and
/// again if Expo ever rotates it), and Unregister on logout. Nothing here is user-facing data —
/// no GET — it exists purely so MissMeService (and anything else that sends a push later) has
/// somewhere to look up "which device(s) belong to this user".
/// </summary>
public class PushTokenService(IApplicationDbContext db, ICurrentUserService currentUser, IDateTimeProvider clock)
{
    public async Task RegisterAsync(RegisterPushTokenRequestDto request, CancellationToken ct = default)
    {
        var userId = currentUser.UserId;
        var now = clock.UtcNow;
        var existing = await db.PushTokens.FirstOrDefaultAsync(t => t.Token == request.Token, ct);

        if (existing is null)
        {
            db.PushTokens.Add(new PushToken
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Token = request.Token,
                Platform = request.Platform,
                CreatedAt = now,
                UpdatedAt = now,
            });
        }
        else
        {
            // Re-registering under a different account (a partner signs into the same physical
            // device) moves the token rather than leaving a stale row pointed at the old user.
            existing.UserId = userId;
            existing.Platform = request.Platform;
            existing.UpdatedAt = now;
        }

        await db.SaveChangesAsync(ct);
    }

    /// <summary>Idempotent — unregistering a token that's already gone (or never existed) is not an error.</summary>
    public async Task UnregisterAsync(string token, CancellationToken ct = default)
    {
        var existing = await db.PushTokens.FirstOrDefaultAsync(t => t.Token == token, ct);
        if (existing is null) return;

        db.PushTokens.Remove(existing);
        await db.SaveChangesAsync(ct);
    }
}
