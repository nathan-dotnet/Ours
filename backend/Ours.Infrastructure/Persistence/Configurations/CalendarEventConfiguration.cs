using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ours.Domain.Entities;

namespace Ours.Infrastructure.Persistence.Configurations;

public class CalendarEventConfiguration : IEntityTypeConfiguration<CalendarEvent>
{
    public void Configure(EntityTypeBuilder<CalendarEvent> builder)
    {
        builder.HasKey(e => e.Id);

        builder.Property(e => e.Title).HasMaxLength(200).IsRequired();
        builder.Property(e => e.Description).HasMaxLength(2000);

        // The couple relationship is unidirectional (no Couple.CalendarEvents navigation) —
        // nothing server-side needs to load a couple's events by traversing from Couple, since
        // every read comes through sync pull's own query.
        builder.HasOne<Couple>()
            .WithMany()
            .HasForeignKey(e => e.CoupleId)
            .OnDelete(DeleteBehavior.Cascade);

        // Every sync pull query filters by (CoupleId, UpdatedAt > since) — this index is what
        // that query hits, and will be for every future synced entity added the same way.
        builder.HasIndex(e => new { e.CoupleId, e.UpdatedAt });
    }
}
