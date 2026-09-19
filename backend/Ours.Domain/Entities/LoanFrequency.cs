namespace Ours.Domain.Entities;

/// <summary>
/// Controlled set of loan repayment frequencies — same string-constant pattern as
/// <see cref="AccountType"/>. Only <see cref="Monthly"/> is supported today (every schedule
/// LoanScheduleCalculator generates assumes monthly recurrence), but keeping this as its own
/// open-but-validated field — rather than hardcoding "monthly" everywhere — means a future
/// frequency (biweekly, weekly) is a new constant + a new branch in the schedule generator, not
/// another migration.
/// </summary>
public static class LoanFrequency
{
    public const string Monthly = "Monthly";

    public static readonly IReadOnlyList<string> All = [Monthly];

    public static bool IsValid(string? value) => value is not null && All.Contains(value);
}
