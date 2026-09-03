namespace Ours.Application.Abstractions;

/// <summary>
/// Lives in Application (not Infrastructure, unlike JwtOptions) because AuthService itself needs
/// to read it to build the password-reset deep link — Infrastructure still owns the actual
/// configuration binding (see DependencyInjection.cs), same as everywhere else.
/// </summary>
public class AppOptions
{
    public const string SectionName = "App";

    /// <summary>Base URL for the password-reset deep link, e.g. "ours://reset-password".</summary>
    public string PasswordResetUrl { get; set; } = "ours://reset-password";
}
