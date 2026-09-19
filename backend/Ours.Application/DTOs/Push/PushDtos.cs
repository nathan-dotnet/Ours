using System.ComponentModel.DataAnnotations;

namespace Ours.Application.DTOs.Push;

public sealed class RegisterPushTokenRequestDto
{
    [Required, MaxLength(200)]
    public string Token { get; init; } = string.Empty;

    /// <summary>"ios" or "android".</summary>
    [Required, MaxLength(10)]
    public string Platform { get; init; } = string.Empty;
}

public sealed class UnregisterPushTokenRequestDto
{
    [Required, MaxLength(200)]
    public string Token { get; init; } = string.Empty;
}
