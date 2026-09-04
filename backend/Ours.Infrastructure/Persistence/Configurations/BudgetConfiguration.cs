using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ours.Domain.Entities;

namespace Ours.Infrastructure.Persistence.Configurations;

public class BudgetConfiguration : IEntityTypeConfiguration<Budget>
{
    public void Configure(EntityTypeBuilder<Budget> builder)
    {
        builder.HasKey(b => b.Id);

        builder.Property(b => b.Category).HasMaxLength(20).IsRequired();
        builder.Property(b => b.Currency).HasMaxLength(3).IsRequired();
        builder.Property(b => b.Amount).HasColumnType("numeric(18,2)");

        builder.HasOne<Couple>()
            .WithMany()
            .HasForeignKey(b => b.CoupleId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(b => new { b.CoupleId, b.UpdatedAt });

        // Same filtered-unique-index pattern as CoupleMember.LeftAt: enforced at the DB level,
        // not just in SyncService, that at most one *non-deleted* budget exists per
        // couple+year+month+category — a deleted budget's slot is immediately reusable.
        builder.HasIndex(b => new { b.CoupleId, b.Year, b.Month, b.Category })
            .IsUnique()
            .HasFilter("\"IsDeleted\" = false");
    }
}
