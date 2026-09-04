using Ours.Application.Services;
using Ours.Domain.Entities;
using Xunit;

namespace Ours.Application.Tests.Services;

public class MoneyCalculatorTests
{
    private static Transaction Expense(Guid accountId, decimal amount, bool isDeleted = false) => new()
    {
        Id = Guid.NewGuid(),
        Type = TransactionType.Expense,
        Amount = amount,
        AccountId = accountId,
        TransactionDate = new DateOnly(2026, 9, 1),
        IsDeleted = isDeleted,
    };

    private static Transaction Income(Guid accountId, decimal amount, bool isDeleted = false) => new()
    {
        Id = Guid.NewGuid(),
        Type = TransactionType.Income,
        Amount = amount,
        AccountId = accountId,
        TransactionDate = new DateOnly(2026, 9, 1),
        IsDeleted = isDeleted,
    };

    private static Transaction Transfer(Guid from, Guid to, decimal amount, bool isDeleted = false) => new()
    {
        Id = Guid.NewGuid(),
        Type = TransactionType.Transfer,
        Amount = amount,
        AccountId = from,
        DestinationAccountId = to,
        TransactionDate = new DateOnly(2026, 9, 1),
        IsDeleted = isDeleted,
    };

    [Fact]
    public void CalculateAccountBalance_ExpenseDecreasesBalance()
    {
        var account = Guid.NewGuid();
        var balance = MoneyCalculator.CalculateAccountBalance(10_000m, account, [Expense(account, 500m)]);
        Assert.Equal(9_500m, balance);
    }

    [Fact]
    public void CalculateAccountBalance_IncomeIncreasesBalance()
    {
        var account = Guid.NewGuid();
        var balance = MoneyCalculator.CalculateAccountBalance(9_500m, account, [Income(account, 20_000m)]);
        Assert.Equal(29_500m, balance);
    }

    [Fact]
    public void CalculateAccountBalance_TransferMovesMoneyBetweenAccounts()
    {
        var bpi = Guid.NewGuid();
        var cash = Guid.NewGuid();
        var transactions = new[] { Transfer(bpi, cash, 2_000m) };

        Assert.Equal(8_000m, MoneyCalculator.CalculateAccountBalance(10_000m, bpi, transactions));
        Assert.Equal(7_000m, MoneyCalculator.CalculateAccountBalance(5_000m, cash, transactions));
    }

    [Fact]
    public void CalculateAccountBalance_ExcludesDeletedTransactions()
    {
        var account = Guid.NewGuid();
        var balance = MoneyCalculator.CalculateAccountBalance(10_000m, account, [Expense(account, 500m, isDeleted: true)]);
        Assert.Equal(10_000m, balance);
    }

    [Fact]
    public void CalculateAccountBalance_DeletingAnExpense_RestoresTheAmount()
    {
        // "Delete reverses the effect" is not a separate code path — recomputing from the
        // current (now-excluded) transaction set is what produces this automatically.
        var account = Guid.NewGuid();
        var expense = Expense(account, 500m);
        var beforeDelete = MoneyCalculator.CalculateAccountBalance(10_000m, account, [expense]);
        expense.IsDeleted = true;
        var afterDelete = MoneyCalculator.CalculateAccountBalance(10_000m, account, [expense]);

        Assert.Equal(9_500m, beforeDelete);
        Assert.Equal(10_000m, afterDelete);
    }

    [Fact]
    public void CalculateAccountBalance_EditingAnExpenseAccount_MovesTheEffectBetweenAccounts()
    {
        // Moving an expense from BPI to GCash: recompute both from the transaction's *new*
        // state — BPI gets its money back, GCash loses it — no explicit "undo" step needed.
        var bpi = Guid.NewGuid();
        var gcash = Guid.NewGuid();
        var expense = Expense(bpi, 500m);

        Assert.Equal(9_500m, MoneyCalculator.CalculateAccountBalance(10_000m, bpi, [expense]));

        expense.AccountId = gcash; // simulates the edit
        Assert.Equal(10_000m, MoneyCalculator.CalculateAccountBalance(10_000m, bpi, [expense]));
        Assert.Equal(4_500m, MoneyCalculator.CalculateAccountBalance(5_000m, gcash, [expense]));
    }

    [Fact]
    public void CalculateTotalBalance_TransferDoesNotChangeTheTotal()
    {
        var bpi = new Account { Id = Guid.NewGuid(), OpeningBalance = 10_000m, IsActive = true };
        var cash = new Account { Id = Guid.NewGuid(), OpeningBalance = 5_000m, IsActive = true };
        var transactions = new[] { Transfer(bpi.Id, cash.Id, 2_000m) };

        var total = MoneyCalculator.CalculateTotalBalance([bpi, cash], transactions);

        Assert.Equal(15_000m, total); // unchanged from 10,000 + 5,000
    }

    [Fact]
    public void CalculateTotalBalance_ExcludesInactiveAndDeletedAccounts()
    {
        var active = new Account { Id = Guid.NewGuid(), OpeningBalance = 1_000m, IsActive = true };
        var inactive = new Account { Id = Guid.NewGuid(), OpeningBalance = 1_000m, IsActive = false };
        var deleted = new Account { Id = Guid.NewGuid(), OpeningBalance = 1_000m, IsActive = true, IsDeleted = true };

        Assert.Equal(1_000m, MoneyCalculator.CalculateTotalBalance([active, inactive, deleted], []));
    }

    [Fact]
    public void CalculateMonthlySpending_OnlyCountsExpenses_NotIncomeOrTransfers()
    {
        var acc = Guid.NewGuid();
        var other = Guid.NewGuid();
        var transactions = new[]
        {
            Expense(acc, 500m),
            Income(acc, 20_000m),
            Transfer(acc, other, 2_000m),
        };

        Assert.Equal(500m, MoneyCalculator.CalculateMonthlySpending(transactions, 2026, 9));
    }

    [Fact]
    public void CalculateMonthlySpending_ExcludesOtherMonthsAndDeleted()
    {
        var acc = Guid.NewGuid();
        var transactions = new List<Transaction>
        {
            Expense(acc, 500m, isDeleted: true),
            new Transaction { Type = TransactionType.Expense, Amount = 300m, AccountId = acc, TransactionDate = new DateOnly(2026, 8, 15) },
        };

        Assert.Equal(0m, MoneyCalculator.CalculateMonthlySpending(transactions, 2026, 9));
    }

    [Fact]
    public void CalculateCategorySpending_GroupsByCategory_ExpenseOnly()
    {
        var acc = Guid.NewGuid();
        var transactions = new List<Transaction>
        {
            new() { Type = TransactionType.Expense, Amount = 2_500m, AccountId = acc, Category = "Food", TransactionDate = new DateOnly(2026, 9, 5) },
            new() { Type = TransactionType.Expense, Amount = 1_000m, AccountId = acc, Category = "Food", TransactionDate = new DateOnly(2026, 9, 10) },
            new() { Type = TransactionType.Expense, Amount = 3_000m, AccountId = acc, Category = "Bills", TransactionDate = new DateOnly(2026, 9, 12) },
            new() { Type = TransactionType.Income, Amount = 20_000m, AccountId = acc, Category = "Salary", TransactionDate = new DateOnly(2026, 9, 1) },
        };

        var byCategory = MoneyCalculator.CalculateCategorySpending(transactions, 2026, 9);

        Assert.Equal(3_500m, byCategory["Food"]);
        Assert.Equal(3_000m, byCategory["Bills"]);
        Assert.False(byCategory.ContainsKey("Salary"));
    }

    [Fact]
    public void CalculateBudgetRemaining_CanGoNegativeWhenOverBudget()
    {
        Assert.Equal(-500m, MoneyCalculator.CalculateBudgetRemaining(5_000m, 5_500m));
        Assert.Equal(4_500m, MoneyCalculator.CalculateBudgetRemaining(5_000m, 500m));
    }

    [Fact]
    public void Precision_100Point10PlusPoint20_IsExactly100Point30()
    {
        var acc = Guid.NewGuid();
        var transactions = new[] { Income(acc, 100.10m), Income(acc, 0.20m) };
        Assert.Equal(100.30m, MoneyCalculator.CalculateAccountBalance(0m, acc, transactions));
    }

    [Fact]
    public void Precision_1999Point99PlusPoint01_IsExactly2000()
    {
        var acc = Guid.NewGuid();
        var transactions = new[] { Income(acc, 1999.99m), Income(acc, 0.01m) };
        Assert.Equal(2000.00m, MoneyCalculator.CalculateAccountBalance(0m, acc, transactions));
    }
}
