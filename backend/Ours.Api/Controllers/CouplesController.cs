using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Ours.Application.DTOs.Couples;
using Ours.Application.Services;

namespace Ours.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/couples")]
public class CouplesController(CoupleService coupleService) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<CoupleActionResponseDto>> Create(CancellationToken ct)
    {
        var result = await coupleService.CreateAsync(ct);
        return Ok(result);
    }

    [HttpPost("join")]
    public async Task<ActionResult<CoupleActionResponseDto>> Join(JoinCoupleRequestDto request, CancellationToken ct)
    {
        var result = await coupleService.JoinAsync(request, ct);
        return Ok(result);
    }

    [HttpGet("me")]
    public async Task<ActionResult<CoupleDto>> Me(CancellationToken ct)
    {
        var couple = await coupleService.GetMyCoupleAsync(ct);
        return Ok(couple);
    }

    /// <summary>Ends the caller's own current couple. No coupleId/partnerId is accepted — the authenticated user's own membership (looked up server-side) is the only thing this can ever act on.</summary>
    [HttpPost("leave")]
    public async Task<ActionResult<LeaveCoupleResponseDto>> Leave(CancellationToken ct)
    {
        var result = await coupleService.LeaveAsync(ct);
        return Ok(result);
    }
}
