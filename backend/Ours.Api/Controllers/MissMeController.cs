using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Ours.Application.DTOs.MissMe;
using Ours.Application.Services;

namespace Ours.Api.Controllers;

/// <summary>
/// The "miss you" gesture between partners. Not part of the generic sync mechanism — see
/// MissMeInteraction's doc comment for why — so it gets its own two small endpoints instead.
/// </summary>
[ApiController]
[Authorize]
[Route("api/miss-me")]
public class MissMeController(MissMeService missMeService) : ControllerBase
{
    /// <summary>Cooldown state, any unanswered MissMe from the partner, and a short recent history — everything the Home screen needs in one call.</summary>
    [HttpGet("status")]
    public async Task<ActionResult<MissMeStatusResponseDto>> Status(CancellationToken ct)
    {
        var response = await missMeService.GetStatusAsync(ct);
        return Ok(response);
    }

    /// <summary>Sends a MissMe (subject to the server-enforced cooldown) or a MissYouToo reply.</summary>
    [HttpPost("send")]
    public async Task<ActionResult<MissMeSendResponseDto>> Send(MissMeSendRequestDto request, CancellationToken ct)
    {
        var response = await missMeService.SendAsync(request, ct);
        return Ok(response);
    }
}
