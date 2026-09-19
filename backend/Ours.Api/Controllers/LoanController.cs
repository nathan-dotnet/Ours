using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Ours.Application.DTOs.Money;
using Ours.Application.Services;

namespace Ours.Api.Controllers;

/// <summary>
/// A loan's own record syncs through the generic <c>/api/sync</c> pipeline (entity type "loan"),
/// exactly like a SavingsGoal — see SyncService. "Pay" is the one thing that needs a synchronous,
/// server-enforced check (balance, overpayment, duplicate-payment protection), so it gets this
/// one small dedicated endpoint instead, same shape as DistributionController/MissMeController.
/// </summary>
[ApiController]
[Authorize]
[Route("api/loans")]
public class LoanController(LoanService loanService) : ControllerBase
{
    /// <summary>Records one payment toward a loan — idempotent on LoanPaymentRequestDto.PaymentId (a retried/duplicated request is a no-op, not a double debit).</summary>
    [HttpPost("{id:guid}/payments")]
    public async Task<ActionResult<LoanPaymentResponseDto>> Pay(Guid id, LoanPaymentRequestDto request, CancellationToken ct)
    {
        var response = await loanService.PayAsync(id, request, ct);
        return Ok(response);
    }
}
