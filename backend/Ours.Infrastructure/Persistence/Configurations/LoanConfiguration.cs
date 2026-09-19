using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ours.Domain.Entities;

namespace Ours.Infrastructure.Persistence.Configurations;

public class LoanConfiguration : IEntityTypeConfiguration<Loan>
{
    public void Configure(EntityTypeBuilder<Loan> builder)
    {
        builder.HasKey(l => l.Id);

        builder.Property(l => l.Name).HasMaxLength(60).IsRequired();
        builder.Property(l => l.Provider).HasMaxLength(60);
        builder.Property(l => l.Currency).HasMaxLength(3).IsRequired();
        builder.Property(l => l.Frequency).HasMaxLength(20).IsRequired();

        // Exact numeric storage — never float/double — same as Account.OpeningBalance/SavingsGoal.TargetAmount.
        builder.Property(l => l.OriginalAmount).HasColumnType("numeric(18,2)");
        builder.Property(l => l.MonthlyPayment).HasColumnType("numeric(18,2)");
        builder.Property(l => l.FeesAmount).HasColumnType("numeric(18,2)");

        builder.HasOne<Couple>()
            .WithMany()
            .HasForeignKey(l => l.CoupleId)
            .OnDelete(DeleteBehavior.Cascade);

        // Restrict, not Cascade: an Account is never hard-deleted — same reasoning as every other
        // Account FK in this schema (Transaction's, Distribution's).
        builder.HasOne<Account>()
            .WithMany()
            .HasForeignKey(l => l.PaymentAccountId)
            .OnDelete(DeleteBehavior.Restrict);

        // A user row is never hard-deleted either; OwnerUserId is nullable (null = Joint).
        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(l => l.OwnerUserId)
            .OnDelete(DeleteBehavior.Restrict);

        // Every sync pull query filters by (CoupleId, UpdatedAt > since).
        builder.HasIndex(l => new { l.CoupleId, l.UpdatedAt });
    }
}
