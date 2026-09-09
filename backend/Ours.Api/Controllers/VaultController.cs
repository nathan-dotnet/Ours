using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Ours.Application.DTOs.Vault;
using Ours.Application.Services;

namespace Ours.Api.Controllers;

/// <summary>
/// Create/update/delete for vault items go through the generic <c>/api/sync/push</c> and
/// <c>/api/sync/pull</c>, same as every other feature — see SyncService's "vault_item" case.
/// This controller exists only for the one action that can't be a sync operation: decrypting a
/// specific item's password on demand (a sync payload can never carry plaintext downstream).
/// </summary>
[ApiController]
[Authorize]
[Route("api/vault")]
public class VaultController(VaultService vaultService) : ControllerBase
{
    /// <summary>Decrypts and returns one vault item's password. POST (not GET) so it's never cached or logged via a query string, even though it takes no body.</summary>
    [HttpPost("{id:guid}/reveal")]
    public async Task<ActionResult<VaultRevealResponseDto>> Reveal(Guid id, CancellationToken ct)
    {
        var password = await vaultService.RevealAsync(id, ct);
        return Ok(new VaultRevealResponseDto { Password = password });
    }
}
