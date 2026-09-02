namespace Ours.Infrastructure.Identity;

/// <summary>Bound from configuration section "Jwt". The secret must come from configuration/
/// environment/user-secrets — never hard-coded — see backend/README.md.</summary>
public class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Secret { get; set; } = string.Empty;
    public string Issuer { get; set; } = "Ours";
    public string Audience { get; set; } = "OursApp";
    public int AccessTokenMinutes { get; set; } = 15;
}
