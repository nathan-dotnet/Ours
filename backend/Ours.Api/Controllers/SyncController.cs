using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Ours.Application.DTOs.Sync;
using Ours.Application.Services;

namespace Ours.Api.Controllers;

/// <summary>
/// Generic sync endpoints shared by every synced entity type. Feature phases add a case to
/// <see cref="SyncService"/> rather than a new controller — see that class's doc comment.
/// </summary>
[ApiController]
[Authorize]
[Route("api/sync")]
public class SyncController(SyncService syncService) : ControllerBase
{
    /// <summary>Pull remote changes since a cursor (the `serverTime` from a previous pull, or omitted for a full sync).</summary>
    [HttpGet("pull")]
    public async Task<ActionResult<SyncPullResponseDto>> Pull([FromQuery] DateTimeOffset? since, CancellationToken ct)
    {
        var response = await syncService.PullAsync(since, ct);
        return Ok(response);
    }

    /// <summary>Push queued local changes.</summary>
    [HttpPost("push")]
    public async Task<ActionResult<SyncPushResponseDto>> Push(SyncPushRequestDto request, CancellationToken ct)
    {
        var response = await syncService.PushAsync(request, ct);
        return Ok(response);
    }
}
