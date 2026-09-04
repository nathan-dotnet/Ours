using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ours.Domain.Entities;

namespace Ours.Infrastructure.Persistence.Configurations;

public class AccountConfiguration : IEntityTypeConfiguration<Account>
{
    public void Configure(EntityTypeBuilder<Account> builder)
    {
        builder.HasKey(a => a.Id);

        builder.Property(a => a.Name).HasMaxLength(100).IsRequired();
        builder.Property(a => a.Type).HasMaxLength(20).IsRequired();
        builder.Property(a => a.Icon).HasMaxLength(50).IsRequired();
        builder.Property(a => a.Currency).HasMaxLength(3).IsRequired();

        // Exact numeric storage — never float/double — same as Transaction.Amount.
        builder.Property(a => a.OpeningBalance).HasColumnType("numeric(18,2)");

        builder.HasOne<Couple>()
            .WithMany()
            .HasForeignKey(a => a.CoupleId)
            .OnDelete(DeleteBehavior.Cascade);

        // Every sync pull query filters by (CoupleId, UpdatedAt > since).
        builder.HasIndex(a => new { a.CoupleId, a.UpdatedAt });

        // "Which accounts show on the active dashboard" — the primary read pattern for Money.
        builder.HasIndex(a => new { a.CoupleId, a.IsActive });
    }
}
