namespace Ours.Domain.Entities;

/// <summary>
/// Category vocabularies for transactions. Expense categories are an *open* vocabulary: the
/// values below are just the presets the app suggests (still mirrored on the mobile side as
/// quick-pick chips) — a couple may also type their own custom expense category (e.g. "Date
/// Night", "Baby Fund") so they can name budgets after however they actually organize their
/// spending. Income keeps a closed vocabulary (not something users have asked to customize), and
/// a Transfer never carries a category at all. Budgets are always against an expense category
/// (see <see cref="Budget"/>) and so share this same open vocabulary and length limit.
/// </summary>
public static class TransactionCategory
{
    public const string Other = "Other";

    /// <summary>Mirrors the Category column's max length on Transaction/Budget (see their EF configurations).</summary>
    public const int MaxExpenseCategoryLength = 30;

    public static readonly IReadOnlyList<string> ExpenseCategories =
    [
        "Food", "Groceries", "Transportation", "Shopping", "Bills", "Entertainment", "Health",
        "Personal", "Education", "Travel", "Household", Other,
    ];

    public static readonly IReadOnlyList<string> IncomeCategories =
    [
        "Salary", "Freelance", "Gift", "Refund", Other,
    ];

    /// <summary>A preset, or any custom name a couple typed — just non-empty and within the column's length limit.</summary>
    public static bool IsValidExpenseCategory(string? value) =>
        !string.IsNullOrWhiteSpace(value) && value.Length <= MaxExpenseCategoryLength;

    public static bool IsValidIncomeCategory(string? value) => value is not null && IncomeCategories.Contains(value);

    /// <summary>Validates a transaction's category against the vocabulary appropriate for its type — a Transfer (and a savings contribution/withdrawal/distribution allocation — see TransactionType) must have none at all.</summary>
    public static bool IsValidForType(string transactionType, string? category) => transactionType switch
    {
        TransactionType.Expense => IsValidExpenseCategory(category),
        TransactionType.Income => IsValidIncomeCategory(category),
        TransactionType.Transfer or TransactionType.SavingsContribution or TransactionType.SavingsWithdrawal or TransactionType.IncomeAllocation or TransactionType.LoanPayment => category is null,
        _ => false,
    };
}
