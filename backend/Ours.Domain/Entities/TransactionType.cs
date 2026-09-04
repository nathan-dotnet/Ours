namespace Ours.Domain.Entities;

/// <summary>
/// The three fundamental kinds of money movement (see the Phase 3 "Money System" spec) — a
/// Transfer is NOT an Expense with a special category; it is a structurally different operation
/// that moves money between the couple's own accounts and must never count as spending.
/// </summary>
public static class TransactionType
{
    public const string Expense = "Expense";
    public const string Income = "Income";
    public const string Transfer = "Transfer";

    public static readonly IReadOnlyList<string> All = [Expense, Income, Transfer];

    public static bool IsValid(string? value) => value is not null && All.Contains(value);
}
