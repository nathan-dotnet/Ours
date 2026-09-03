using Microsoft.AspNetCore.Mvc;
using Ours.Application.DTOs.Auth;
using Ours.Application.Services;

namespace Ours.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(AuthService authService) : ControllerBase
{
    [HttpPost("register")]
    public async Task<ActionResult<AuthResponseDto>> Register(RegisterRequestDto request, CancellationToken ct)
    {
        var response = await authService.RegisterAsync(request, ct);
        return Ok(response);
    }

    [HttpPost("login")]
    public async Task<ActionResult<AuthResponseDto>> Login(LoginRequestDto request, CancellationToken ct)
    {
        var response = await authService.LoginAsync(request, ct);
        return Ok(response);
    }

    [HttpPost("refresh")]
    public async Task<ActionResult<AuthResponseDto>> Refresh(RefreshRequestDto request, CancellationToken ct)
    {
        var response = await authService.RefreshAsync(request, ct);
        return Ok(response);
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout(LogoutRequestDto request, CancellationToken ct)
    {
        await authService.LogoutAsync(request, ct);
        return NoContent();
    }

    /// <summary>Always returns the same response whether or not the email belongs to an account — see AuthService.ForgotPasswordAsync.</summary>
    [HttpPost("forgot-password")]
    public async Task<ActionResult<MessageResponseDto>> ForgotPassword(ForgotPasswordRequestDto request, CancellationToken ct)
    {
        await authService.ForgotPasswordAsync(request, ct);
        return Ok(new MessageResponseDto { Message = "If an account with that email exists, a password reset link has been sent." });
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequestDto request, CancellationToken ct)
    {
        await authService.ResetPasswordAsync(request, ct);
        return NoContent();
    }
}
