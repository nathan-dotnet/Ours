using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ours.Domain.Entities;

namespace Ours.Infrastructure.Persistence.Configurations;

public class ExpenseConfiguration : IEntityTypeConfiguration<Expense>
{
    public void Configure(EntityTypeBuilder<Expense> builder)
    {
        builder.HasKey(e => e.Id);

        // Exact numeric storage — never float/double — so amounts survive round trips without
        // rounding drift. (18,2) comfortably covers any realistic personal-expense amount while
        // leaving room to grow; application-level validation (see SyncService) applies its own,
        // much lower sanity ceiling on top of this.
        builder.Property(e => e.Amount).HasColumnType("numeric(18,2)");

        builder.Property(e => e.Currency).HasMaxLength(3).IsRequired();
        builder.Property(e => e.Category).HasMaxLength(20).IsRequired();
        builder.Property(e => e.Description).HasMaxLength(2000);
        builder.Property(e => e.Notes).HasMaxLength(2000);

        // The couple relationship is unidirectional, same as CalendarEvent — nothing server-side
        // needs to load a couple's expenses by traversing from Couple.
        builder.HasOne<Couple>()
            .WithMany()
            .HasForeignKey(e => e.CoupleId)
            .OnDelete(DeleteBehavior.Cascade);

        // Every sync pull query filters by (CoupleId, UpdatedAt > since) — mirrors CalendarEvent's index.
        builder.HasIndex(e => new { e.CoupleId, e.UpdatedAt });

        // Supports "expenses for this couple in this month" — the primary read pattern for the
        // Money screen (computed client-side from the local mirror, but the same shape of query
        // underlies the sync pull's per-couple scan and would matter for any future server-side
        // reporting endpoint).
        builder.HasIndex(e => new { e.CoupleId, e.ExpenseDate });
    }
}
