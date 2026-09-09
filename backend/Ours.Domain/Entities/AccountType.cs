namespace Ours.Domain.Entities;

/// <summary>Controlled set of account types — same string-constant pattern as <see cref="ExpenseCategory"/> used to be (see <see cref="TransactionCategory"/> now).</summary>
public static class AccountType
{
    public const string Bank = "Bank";
    public const string EWallet = "EWallet";
    public const string Cash = "Cash";
    public const string Savings = "Savings";
    public const string Other = "Other";

    public static readonly IReadOnlyList<string> All = [Bank, EWallet, Cash, Savings, Other];

    public static bool IsValid(string? value) => value is not null && All.Contains(value);
}
