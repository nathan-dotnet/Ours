using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Ours.Domain.Entities;

namespace Ours.Infrastructure.Persistence.Configurations;

public class LoanPaymentScheduleConfiguration : IEntityTypeConfiguration<LoanPaymentSchedule>
{
    public void Configure(EntityTypeBuilder<LoanPaymentSchedule> builder)
    {
        builder.HasKey(s => s.Id);

        builder.Property(s => s.PlannedAmount).HasColumnType("numeric(18,2)");
        builder.Property(s => s.DueDate).IsRequired();

        builder.HasOne<Couple>()
            .WithMany()
            .HasForeignKey(s => s.CoupleId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne<Loan>()
            .WithMany()
            .HasForeignKey(s => s.LoanId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(s => new { s.CoupleId, s.UpdatedAt });
        builder.HasIndex(s => new { s.CoupleId, s.DueDate });
        builder.HasIndex(s => s.LoanId);
    }
}