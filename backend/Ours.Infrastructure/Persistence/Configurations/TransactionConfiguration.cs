using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ours.Domain.Entities;

namespace Ours.Infrastructure.Persistence.Configurations;

public class TransactionConfiguration : IEntityTypeConfiguration<Transaction>
{
    public void Configure(EntityTypeBuilder<Transaction> builder)
    {
        builder.HasKey(t => t.Id);

        builder.Property(t => t.Type).HasMaxLength(20).IsRequired();
        builder.Property(t => t.Currency).HasMaxLength(3).IsRequired();
        builder.Property(t => t.Category).HasMaxLength(TransactionCategory.MaxExpenseCategoryLength);
        builder.Property(t => t.Description).HasMaxLength(2000);
        builder.Property(t => t.Notes).HasMaxLength(2000);

        // Exact numeric storage — never float/double — same as Account.OpeningBalance.
        builder.Property(t => t.Amount).HasColumnType("numeric(18,2)");

        builder.HasOne<Couple>()
            .WithMany()
            .HasForeignKey(t => t.CoupleId)
            .OnDelete(DeleteBehavior.Cascade);

        // Two independent (unnamed-navigation) relationships to Account — Restrict rather than
        // Cascade on both, since this app never hard-deletes an Account (or a Couple) in normal
        // operation anyway; soft-delete (IsDeleted) is what every other entity here uses too.
        builder.HasOne<Account>()
            .WithMany()
            .HasForeignKey(t => t.AccountId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<Account>()
            .WithMany()
            .HasForeignKey(t => t.DestinationAccountId)
            .OnDelete(DeleteBehavior.Restrict);

        // Same Restrict reasoning as the Account FKs above — a SavingsGoal is never hard-deleted
        // (see SavingsGoalConfiguration), so there's no cascade path this could ever need anyway.
        builder.HasOne<SavingsGoal>()
            .WithMany()
            .HasForeignKey(t => t.SavingsGoalId)
            .OnDelete(DeleteBehavior.Restrict);

        // Same Restrict reasoning again — a Loan is never hard-deleted (see LoanConfiguration).
        builder.HasOne<Loan>()
            .WithMany()
            .HasForeignKey(t => t.LoanId)
            .OnDelete(DeleteBehavior.Restrict);

        // Every sync pull query filters by (CoupleId, UpdatedAt > since).
        builder.HasIndex(t => new { t.CoupleId, t.UpdatedAt });

        // "This account's history" and "this month's spending" — the two primary read patterns.
        builder.HasIndex(t => new { t.CoupleId, t.TransactionDate });
        builder.HasIndex(t => new { t.AccountId, t.TransactionDate });
        builder.HasIndex(t => new { t.DestinationAccountId, t.TransactionDate });
        builder.HasIndex(t => new { t.CoupleId, t.Type });

        // A goal's progress (MoneyCalculator.CalculateSavingsGoalBalance) sums every transaction touching it.
        builder.HasIndex(t => t.SavingsGoalId);

        // A loan's remaining balance (MoneyCalculator.CalculateLoanPaidAmount) sums every transaction touching it.
        builder.HasIndex(t => t.LoanId);
    }
}
