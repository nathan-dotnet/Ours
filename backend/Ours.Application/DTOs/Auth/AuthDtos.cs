using System.ComponentModel.DataAnnotations;

namespace Ours.Application.DTOs.Auth;

public sealed class RegisterRequestDto
{
    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; init; } = string.Empty;

    [Required, MinLength(8), MaxLength(100)]
    public string Password { get; init; } = string.Empty;

    [Required, MaxLength(100)]
    public string DisplayName { get; init; } = string.Empty;
}

public sealed class LoginRequestDto
{
    [Required, EmailAddress, MaxLength(256)]
    public string Email { get; init; } = string.Empty;

    [Required]
    public string Password { get; init; } = string.Empty;
}

public sealed class RefreshRequestDto
{
    [Required]
    public string RefreshToken { get; init; } = string.Empty;
}

public sealed class LogoutRequestDto
{
    [Required]
    public string RefreshToken { get; init; } = string.Empty;
}

public sealed class UserDto
{
    public Guid Id { get; init; }
    public string Email { get; init; } = string.Empty;
    public string DisplayName { get; init; } = string.Empty;
    public Guid? CoupleId { get; init; }
}

public sealed class AuthResponseDto
{
    public string AccessToken { get; init; } = string.Empty;
    public DateTimeOffset AccessTokenExpiresAt { get; init; }
    public string RefreshToken { get; init; } = string.Empty;
    public UserDto User { get; init; } = null!;
}
