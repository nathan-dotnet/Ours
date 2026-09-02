using Microsoft.EntityFrameworkCore;
using Ours.Application.Abstractions;
using Ours.Application.Common;
using Ours.Application.DTOs.Auth;
using Ours.Domain.Entities;

namespace Ours.Application.Services;

public class AuthService(
    IIdentityService identityService,
    IApplicationDbContext db,
    IJwtTokenService jwtTokenService,
    IDateTimeProvider clock)
{
    private static readonly TimeSpan RefreshTokenLifetime = TimeSpan.FromDays(30);

    public async Task<AuthResponseDto> RegisterAsync(RegisterRequestDto request, CancellationToken ct = default)
    {
        var result = await identityService.CreateUserAsync(request.Email, request.Password, request.DisplayName);
        if (!result.Succeeded || result.User is null)
        {
            throw new ValidationAppException(string.Join(" ", result.Errors));
        }

        return await IssueTokensAsync(result.User, ct);
    }

    public async Task<AuthResponseDto> LoginAsync(LoginRequestDto request, CancellationToken ct = default)
    {
        var user = await identityService.FindByEmailAsync(request.Email);
        if (user is null || !await identityService.CheckPasswordAsync(user, request.Password))
        {
            throw new UnauthorizedAppException("Invalid email or password.");
        }

        return await IssueTokensAsync(user, ct);
    }

    public async Task<AuthResponseDto> RefreshAsync(RefreshRequestDto request, CancellationToken ct = default)
    {
        var tokenHash = jwtTokenService.HashRefreshToken(request.RefreshToken);
        var existing = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == tokenHash, ct);

        if (existing is null || !existing.IsActiveAt(clock.UtcNow))
        {
            throw new UnauthorizedAppException("Refresh token is invalid or expired.");
        }

        // Loaded through the identity abstraction rather than an EF Include — this is the
        // user record backing the token, and shouldn't depend on how that relationship happens
        // to be materialized (or on it being modeled as an EF navigation at all).
        var user = await identityService.FindByIdAsync(existing.UserId)
            ?? throw new UnauthorizedAppException("Refresh token is invalid or expired.");

        // Rotation: revoke the redeemed token immediately so it can't be replayed.
        existing.RevokedAt = clock.UtcNow;

        var response = await IssueTokensAsync(user, ct, skipSave: true);

        var newRawToken = response.RefreshToken;
        var newTokenHash = jwtTokenService.HashRefreshToken(newRawToken);
        var newToken = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == newTokenHash, ct);
        if (newToken is not null)
        {
            existing.ReplacedByTokenId = newToken.Id;
        }

        await db.SaveChangesAsync(ct);
        return response;
    }

    public async Task LogoutAsync(LogoutRequestDto request, CancellationToken ct = default)
    {
        var tokenHash = jwtTokenService.HashRefreshToken(request.RefreshToken);
        var existing = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == tokenHash, ct);
        if (existing is not null && existing.RevokedAt is null)
        {
            existing.RevokedAt = clock.UtcNow;
            await db.SaveChangesAsync(ct);
        }
        // Idempotent: an unknown/already-revoked token is not an error — the end state is what the caller wanted.
    }

    /// <summary>
    /// Mints a fresh access/refresh token pair for a user. Exposed (not just used internally
    /// for login/register) so other services can re-issue tokens after an action that changes
    /// what's in the token's claims — e.g. CoupleService after CoupleId is first set, since the
    /// couple-scoped endpoints and sync pull/push read CoupleId from the token, not the client.
    /// </summary>
    public async Task<AuthResponseDto> IssueTokensAsync(ApplicationUser user, CancellationToken ct = default, bool skipSave = false)
    {
        var (accessToken, expiresAt) = jwtTokenService.GenerateAccessToken(user);
        var rawRefreshToken = jwtTokenService.GenerateRefreshToken();

        db.RefreshTokens.Add(new RefreshToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            TokenHash = jwtTokenService.HashRefreshToken(rawRefreshToken),
            CreatedAt = clock.UtcNow,
            ExpiresAt = clock.UtcNow.Add(RefreshTokenLifetime),
        });

        if (!skipSave)
        {
            await db.SaveChangesAsync(ct);
        }

        return new AuthResponseDto
        {
            AccessToken = accessToken,
            AccessTokenExpiresAt = expiresAt,
            RefreshToken = rawRefreshToken,
            User = new UserDto
            {
                Id = user.Id,
                Email = user.Email ?? string.Empty,
                DisplayName = user.DisplayName,
                CoupleId = user.CoupleId,
            },
        };
    }
}
