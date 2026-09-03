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

        // Enforces "a user belongs to at most one *active* couple" (app-level check on
        // ApplicationUser.CoupleId is the primary mechanism; this is the DB-level backstop) and,
        // together with the application-layer count check, "max 2 members per couple". Filtered
        // so an ended membership (LeftAt set — see CoupleService.LeaveAsync) never blocks a
        // genuinely new one for the same user.
        builder.HasIndex(m => m.UserId).IsUnique().HasFilter("\"LeftAt\" IS NULL");

        builder.HasOne(m => m.User)
            .WithMany()
            .HasForeignKey(m => m.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
