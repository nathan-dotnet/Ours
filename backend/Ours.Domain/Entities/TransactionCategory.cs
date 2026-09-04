namespace Ours.Domain.Entities;

/// <summary>
/// Controlled category vocabularies — separate sets for Expense and Income (see the Phase 3
/// spec); a Transfer never carries a category at all. Budgets are always against an expense
/// category (see <see cref="Budget"/>).
/// </summary>
public static class TransactionCategory
{
    public const string Other = "Other";

    public static readonly IReadOnlyList<string> ExpenseCategories =
    [
        "Food", "Transportation", "Shopping", "Bills", "Entertainment", "Health", "Travel", "Home", Other,
    ];

    public static readonly IReadOnlyList<string> IncomeCategories =
    [
        "Salary", "Freelance", "Gift", "Refund", Other,
    ];

    public static bool IsValidExpenseCategory(string? value) => value is not null && ExpenseCategories.Contains(value);

    public static bool IsValidIncomeCategory(string? value) => value is not null && IncomeCategories.Contains(value);

    /// <summary>Validates a transaction's category against the vocabulary appropriate for its type — a Transfer must have none at all.</summary>
    public static bool IsValidForType(string transactionType, string? category) => transactionType switch
    {
        TransactionType.Expense => IsValidExpenseCategory(category),
        TransactionType.Income => IsValidIncomeCategory(category),
        TransactionType.Transfer => category is null,
        _ => false,
    };
}
