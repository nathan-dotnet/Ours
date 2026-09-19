using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Ours.Application.DTOs.Push;
using Ours.Application.Services;

namespace Ours.Api.Controllers;

/// <summary>Registers/unregisters this device's Expo push token against the signed-in user — see PushTokenService.</summary>
[ApiController]
[Authorize]
[Route("api/push-tokens")]
public class PushTokensController(PushTokenService pushTokenService) : ControllerBase
{
    /// <summary>Called right after the app obtains a push token (on login and whenever Expo rotates it).</summary>
    [HttpPost]
    public async Task<IActionResult> Register(RegisterPushTokenRequestDto request, CancellationToken ct)
    {
        await pushTokenService.RegisterAsync(request, ct);
        return NoContent();
    }

    /// <summary>Called on logout, so a signed-out device stops receiving notifications meant for the account.</summary>
    [HttpDelete]
    public async Task<IActionResult> Unregister(UnregisterPushTokenRequestDto request, CancellationToken ct)
    {
        await pushTokenService.UnregisterAsync(request.Token, ct);
        return NoContent();
    }
}
