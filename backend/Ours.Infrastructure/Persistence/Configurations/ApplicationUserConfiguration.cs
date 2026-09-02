using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ours.Domain.Entities;

namespace Ours.Infrastructure.Persistence.Configurations;

public class ApplicationUserConfiguration : IEntityTypeConfiguration<ApplicationUser>
{
    public void Configure(EntityTypeBuilder<ApplicationUser> builder)
    {
        builder.Property(u => u.DisplayName).HasMaxLength(100).IsRequired();

        builder.HasOne(u => u.Couple)
            .WithMany()
            .HasForeignKey(u => u.CoupleId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
