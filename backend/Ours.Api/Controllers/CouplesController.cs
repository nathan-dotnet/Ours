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
}
