using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Ours.Application.DTOs.Money;
using Ours.Application.Services;

namespace Ours.Api.Controllers;

/// <summary>
/// The Money Calculator's "Distribute Money" action. Not part of the generic sync mechanism —
/// see Distribution's doc comment for why — so it gets its own two small endpoints instead,
/// same shape as MissMeController.
/// </summary>
[ApiController]
[Authorize]
[Route("api/distributions")]
public class DistributionController(DistributionService distributionService) : ControllerBase
{
    /// <summary>Has this income period already been distributed, plus a short recent history — everything the Calculator screen needs in one call.</summary>
    [HttpGet("status")]
    public async Task<ActionResult<DistributionStatusResponseDto>> Status([FromQuery] int year, [FromQuery] int month, CancellationToken ct)
    {
        var response = await distributionService.GetStatusAsync(year, month, ct);
        return Ok(response);
    }

    /// <summary>Executes a distribution (subject to the server's duplicate-period guard unless Force is set).</summary>
    [HttpPost]
    public async Task<ActionResult<DistributeMoneyResponseDto>> Distribute(DistributeMoneyRequestDto request, CancellationToken ct)
    {
        var response = await distributionService.DistributeAsync(request, ct);
        return Ok(response);
    }
}
