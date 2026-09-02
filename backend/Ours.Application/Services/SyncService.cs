using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Ours.Application.Abstractions;
using Ours.Application.Common;
using Ours.Application.DTOs.Couples;
using Ours.Application.DTOs.Sync;

namespace Ours.Application.Services;

/// <summary>
/// Generic, entity-agnostic sync endpoint implementation. Phase 1 only registers a handler
/// for "couple_profile" (see <see cref="CoupleProfileEntityType"/>) — it exists purely to
/// prove the offline round trip end-to-end. Future phases add a case per new entity type
/// (e.g. "calendar_event", "expense") to <see cref="PullAsync"/> and <see cref="PushAsync"/>
/// rather than standing up a parallel sync mechanism.
/// </summary>
public class SyncService(
    IApplicationDbContext db,
    ICurrentUserService currentUser,
    IDateTimeProvider clock)
{
    public const string CoupleProfileEntityType = "couple_profile";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<SyncPullResponseDto> PullAsync(DateTimeOffset? since, CancellationToken ct = default)
    {
        var coupleId = currentUser.CoupleId ?? throw new ForbiddenAppException("You must belong to a couple to sync.");
        var serverTime = clock.UtcNow;
        var changes = new List<SyncChangeDto>();

        var couple = await db.Couples.FirstOrDefaultAsync(c => c.Id == coupleId, ct);
        if (couple is not null && (since is null || couple.UpdatedAt > since))
        {
            changes.Add(new SyncChangeDto
            {
                EntityType = CoupleProfileEntityType,
                EntityId = couple.Id,
                Operation = couple.IsDeleted ? SyncOperation.Delete : SyncOperation.Update,
                Payload = couple.IsDeleted ? null : new CoupleProfilePayloadDto { Nickname = couple.Nickname, AnniversaryDate = couple.AnniversaryDate },
                UpdatedAt = couple.UpdatedAt,
                UpdatedByUserId = couple.UpdatedByUserId,
                Version = couple.Version,
            });
        }

        // Future entity types append their own "changed since `since`" checks here.

        return new SyncPullResponseDto { ServerTime = serverTime, Changes = changes };
    }

    public async Task<SyncPushResponseDto> PushAsync(SyncPushRequestDto request, CancellationToken ct = default)
    {
        var coupleId = currentUser.CoupleId ?? throw new ForbiddenAppException("You must belong to a couple to sync.");
        var results = new List<SyncPushResultItemDto>();

        foreach (var item in request.Changes)
        {
            if (!SyncOperation.IsValid(item.Operation))
            {
                results.Add(Rejected(item, "Unknown operation."));
                continue;
            }

            var result = item.EntityType switch
            {
                CoupleProfileEntityType => await ApplyCoupleProfileChangeAsync(coupleId, item, ct),
                _ => Rejected(item, $"Unknown entity type '{item.EntityType}'."),
            };
            results.Add(result);
        }

        await db.SaveChangesAsync(ct);
        return new SyncPushResponseDto { Results = results };
    }

    private async Task<SyncPushResultItemDto> ApplyCoupleProfileChangeAsync(Guid coupleId, SyncPushItemDto item, CancellationToken ct)
    {
        if (item.EntityId != coupleId)
        {
            return Rejected(item, "You may only sync your own couple's profile.");
        }

        if (item.Operation == SyncOperation.Delete)
        {
            return Rejected(item, "A couple profile cannot be deleted.");
        }

        var couple = await db.Couples.FirstOrDefaultAsync(c => c.Id == coupleId, ct);
        if (couple is null)
        {
            return Rejected(item, "Couple not found.");
        }

        // Last-valid-server-write-wins: a push older than what the server already has is
        // rejected (not merged) so the client can pull the newer value instead of clobbering it.
        if (item.ClientUpdatedAt < couple.UpdatedAt)
        {
            return new SyncPushResultItemDto
            {
                EntityId = item.EntityId,
                EntityType = item.EntityType,
                Accepted = false,
                Error = "stale_write",
                ServerVersion = couple.Version,
                ServerUpdatedAt = couple.UpdatedAt,
            };
        }

        CoupleProfilePayloadDto? payload;
        try
        {
            payload = item.Payload.Deserialize<CoupleProfilePayloadDto>(JsonOptions);
        }
        catch (JsonException)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (payload is null)
        {
            return Rejected(item, "Invalid payload.");
        }

        couple.Nickname = payload.Nickname;
        couple.AnniversaryDate = payload.AnniversaryDate;
        couple.UpdatedAt = clock.UtcNow;
        couple.UpdatedByUserId = currentUser.UserId;
        couple.Version += 1;

        return new SyncPushResultItemDto
        {
            EntityId = couple.Id,
            EntityType = item.EntityType,
            Accepted = true,
            ServerVersion = couple.Version,
            ServerUpdatedAt = couple.UpdatedAt,
        };
    }

    private static SyncPushResultItemDto Rejected(SyncPushItemDto item, string error) => new()
    {
        EntityId = item.EntityId,
        EntityType = item.EntityType,
        Accepted = false,
        Error = error,
    };
}
