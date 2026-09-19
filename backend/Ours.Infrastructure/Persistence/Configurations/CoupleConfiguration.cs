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

        // Exact numeric storage — never float/double — same as every other percentage/money column here.
        builder.Property(c => c.BudgetAllocationPercent).HasColumnType("numeric(5,2)");
        builder.Property(c => c.SavingsAllocationPercent).HasColumnType("numeric(5,2)");
        builder.Property(c => c.WantsAllocationPercent).HasColumnType("numeric(5,2)");

        // Restrict, not Cascade: an Account is never hard-deleted (see AccountConfiguration), so
        // there's no cascade path this could ever need — same reasoning as Transaction's own
        // Account FKs.
        builder.HasOne<Account>().WithMany().HasForeignKey(c => c.BudgetAccountId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne<Account>().WithMany().HasForeignKey(c => c.SavingsAccountId).OnDelete(DeleteBehavior.Restrict);

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

        builder.Property(m => m.MonthlyIncome).HasColumnType("numeric(18,2)");
        builder.Property(m => m.WantsAllocationPercent).HasColumnType("numeric(5,2)");

        builder.HasOne<Account>().WithMany().HasForeignKey(m => m.WantsAccountId).OnDelete(DeleteBehavior.Restrict);

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
