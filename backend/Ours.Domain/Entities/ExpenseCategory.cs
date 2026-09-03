namespace Ours.Domain.Entities;

/// <summary>
/// Controlled set of expense categories — a small fixed vocabulary, not a user-manageable
/// category system (out of scope for this MVP; see the Phase 3A spec). Mirrors the
/// <see cref="Ours.Application.DTOs.Sync.SyncOperation"/> string-constant pattern rather than a
/// C# enum, since the value travels as-is through JSON payloads on both ends.
/// </summary>
public static class ExpenseCategory
{
    public const string Food = "Food";
    public const string Transportation = "Transportation";
    public const string Shopping = "Shopping";
    public const string Bills = "Bills";
    public const string Entertainment = "Entertainment";
    public const string Health = "Health";
    public const string Travel = "Travel";
    public const string Home = "Home";
    public const string Other = "Other";

    public static readonly IReadOnlyList<string> All =
    [
        Food, Transportation, Shopping, Bills, Entertainment, Health, Travel, Home, Other,
    ];

    public static bool IsValid(string? value) => value is not null && All.Contains(value);
}
