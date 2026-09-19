using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ours.Domain.Entities;

namespace Ours.Infrastructure.Persistence.Configurations;

public class PushTokenConfiguration : IEntityTypeConfiguration<PushToken>
{
    public void Configure(EntityTypeBuilder<PushToken> builder)
    {
        builder.HasKey(p => p.Id);

        builder.Property(p => p.Token).HasMaxLength(200).IsRequired();
        builder.Property(p => p.Platform).HasMaxLength(10).IsRequired();

        // A physical device/install has exactly one row regardless of which user is currently
        // signed in on it — re-registering the same token moves it (see PushTokenService) rather
        // than accumulating duplicates.
        builder.HasIndex(p => p.Token).IsUnique();

        // MissMeService's send-time lookup ("every token for this user") filters by UserId.
        builder.HasIndex(p => p.UserId);

        builder.HasOne<ApplicationUser>()
            .WithMany()
            .HasForeignKey(p => p.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
