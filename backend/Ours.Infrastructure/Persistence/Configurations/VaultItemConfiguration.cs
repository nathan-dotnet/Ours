using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ours.Domain.Entities;

namespace Ours.Infrastructure.Persistence.Configurations;

public class VaultItemConfiguration : IEntityTypeConfiguration<VaultItem>
{
    public void Configure(EntityTypeBuilder<VaultItem> builder)
    {
        builder.HasKey(v => v.Id);

        builder.Property(v => v.Title).HasMaxLength(200).IsRequired();
        builder.Property(v => v.Username).HasMaxLength(200);
        builder.Property(v => v.WebsiteUrl).HasMaxLength(500);
        builder.Property(v => v.Category).HasMaxLength(20).IsRequired();
        builder.Property(v => v.Notes).HasMaxLength(2000);

        // byte[] -> bytea is Npgsql's default mapping; no HasColumnType needed. Never nullable —
        // every row has a password (required at creation), so these are always populated.
        builder.Property(v => v.EncryptedPassword).IsRequired();
        builder.Property(v => v.Nonce).IsRequired();
        builder.Property(v => v.AuthTag).IsRequired();

        builder.HasOne<Couple>()
            .WithMany()
            .HasForeignKey(v => v.CoupleId)
            .OnDelete(DeleteBehavior.Cascade);

        // Every sync pull query filters by (CoupleId, UpdatedAt > since) — mirrors every other synced entity's index.
        builder.HasIndex(v => new { v.CoupleId, v.UpdatedAt });

        // "Active (non-deleted) items for this couple" — the shape of every ordinary read.
        builder.HasIndex(v => new { v.CoupleId, v.IsDeleted });
    }
}
