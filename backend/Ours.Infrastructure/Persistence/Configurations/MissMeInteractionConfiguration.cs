using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ours.Domain.Entities;

namespace Ours.Infrastructure.Persistence.Configurations;

public class MissMeInteractionConfiguration : IEntityTypeConfiguration<MissMeInteraction>
{
    public void Configure(EntityTypeBuilder<MissMeInteraction> builder)
    {
        builder.HasKey(m => m.Id);

        builder.Property(m => m.Type).HasMaxLength(20).IsRequired();

        builder.HasOne<Couple>()
            .WithMany()
            .HasForeignKey(m => m.CoupleId)
            .OnDelete(DeleteBehavior.Cascade);

        // Self-reference (a MissYouToo pointing at the MissMe it replies to). Restrict rather than
        // Cascade: the couple-level cascade above already removes every row for a deleted couple,
        // so this FK never needs its own delete behavior — Restrict just avoids EF/Npgsql
        // rejecting a second cascade path into the same table.
        builder.HasOne<MissMeInteraction>()
            .WithMany()
            .HasForeignKey(m => m.InResponseToId)
            .OnDelete(DeleteBehavior.Restrict);

        // The cooldown check and "latest MissMe I sent" lookup both filter by (CoupleId, SenderUserId, Type) and sort by CreatedAt.
        builder.HasIndex(m => new { m.CoupleId, m.SenderUserId, m.Type, m.CreatedAt });

        // "Recent history for this couple" and "latest MissMe someone sent me" both filter by (CoupleId, ReceiverUserId) and sort by CreatedAt.
        builder.HasIndex(m => new { m.CoupleId, m.ReceiverUserId, m.CreatedAt });
    }
}
