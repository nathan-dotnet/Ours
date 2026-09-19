using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ours.Domain.Entities;

namespace Ours.Infrastructure.Persistence.Configurations;

public class DistributionConfiguration : IEntityTypeConfiguration<Distribution>
{
    public void Configure(EntityTypeBuilder<Distribution> builder)
    {
        builder.HasKey(d => d.Id);

        builder.Property(d => d.Currency).HasMaxLength(3).IsRequired();

        // Exact numeric storage — never float/double — same as every other money column here.
        builder.Property(d => d.CombinedIncome).HasColumnType("numeric(18,2)");
        builder.Property(d => d.BudgetAmount).HasColumnType("numeric(18,2)");
        builder.Property(d => d.SavingsAmount).HasColumnType("numeric(18,2)");
        builder.Property(d => d.WantsAmount).HasColumnType("numeric(18,2)");
        builder.Property(d => d.BudgetPercent).HasColumnType("numeric(5,2)");
        builder.Property(d => d.SavingsPercent).HasColumnType("numeric(5,2)");
        builder.Property(d => d.WantsPercent).HasColumnType("numeric(5,2)");

        builder.HasOne<Couple>()
            .WithMany()
            .HasForeignKey(d => d.CoupleId)
            .OnDelete(DeleteBehavior.Cascade);

        // Restrict, not Cascade: an Account is never hard-deleted (see AccountConfiguration),
        // so there's no cascade path this could ever need — same reasoning as Transaction's
        // account FKs.
        builder.HasOne<Account>().WithMany().HasForeignKey(d => d.BudgetAccountId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Account>().WithMany().HasForeignKey(d => d.SavingsAccountId).OnDelete(DeleteBehavior.Restrict);

        // "Has this period already been distributed?" and "history for this couple" both filter
        // by (CoupleId, Year, Month) and sort by CreatedAt.
        builder.HasIndex(d => new { d.CoupleId, d.Year, d.Month });
    }
}
