namespace Ours.Domain.Entities;

/// <summary>Controlled category vocabulary for vault items — same string-constant pattern as <see cref="TransactionCategory"/>.</summary>
public static class VaultCategory
{
    public const string Streaming = "Streaming";
    public const string Social = "Social";
    public const string Email = "Email";
    public const string Shopping = "Shopping";
    public const string Banking = "Banking";
    public const string Work = "Work";
    public const string WiFi = "WiFi";
    public const string Other = "Other";

    public static readonly IReadOnlyList<string> All = [Streaming, Social, Email, Shopping, Banking, Work, WiFi, Other];

    public static bool IsValid(string? value) => value is not null && All.Contains(value);
}
