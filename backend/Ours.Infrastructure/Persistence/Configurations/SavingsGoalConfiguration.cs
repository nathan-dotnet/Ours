using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ours.Domain.Entities;

namespace Ours.Infrastructure.Persistence.Configurations;

public class SavingsGoalConfiguration : IEntityTypeConfiguration<SavingsGoal>
{
    public void Configure(EntityTypeBuilder<SavingsGoal> builder)
    {
        builder.HasKey(g => g.Id);

        builder.Property(g => g.Name).HasMaxLength(60).IsRequired();
        builder.Property(g => g.Currency).HasMaxLength(3).IsRequired();

        // Exact numeric storage — never float/double — same as Account.OpeningBalance/Budget.Amount.
        builder.Property(g => g.TargetAmount).HasColumnType("numeric(18,2)");
        builder.Property(g => g.AllocationPercent).HasColumnType("numeric(5,2)");

        builder.HasOne<Couple>()
            .WithMany()
            .HasForeignKey(g => g.CoupleId)
            .OnDelete(DeleteBehavior.Cascade);

        // Every sync pull query filters by (CoupleId, UpdatedAt > since).
        builder.HasIndex(g => new { g.CoupleId, g.UpdatedAt });
    }
}
