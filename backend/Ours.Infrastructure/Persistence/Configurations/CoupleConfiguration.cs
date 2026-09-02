using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ours.Domain.Entities;

namespace Ours.Infrastructure.Persistence.Configurations;

public class CoupleConfiguration : IEntityTypeConfiguration<Couple>
{
    public void Configure(EntityTypeBuilder<Couple> builder)
    {
        builder.HasKey(c => c.Id);

        builder.Property(c => c.InviteCode).HasMaxLength(20).IsRequired();
        builder.HasIndex(c => c.InviteCode).IsUnique();

        builder.Property(c => c.Nickname).HasMaxLength(100);

        builder.HasMany(c => c.Members)
            .WithOne(m => m.Couple)
            .HasForeignKey(m => m.CoupleId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class CoupleMemberConfiguration : IEntityTypeConfiguration<CoupleMember>
{
    public void Configure(EntityTypeBuilder<CoupleMember> builder)
    {
        builder.HasKey(m => m.Id);

        // Enforces "a user belongs to at most one couple" and "max 2 members per couple"
        // (the latter together with the application-layer count check) at the data level.
        builder.HasIndex(m => m.UserId).IsUnique();

        builder.HasOne(m => m.User)
            .WithMany()
            .HasForeignKey(m => m.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
