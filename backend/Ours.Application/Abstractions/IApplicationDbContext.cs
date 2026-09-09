using Microsoft.EntityFrameworkCore;
using Ours.Domain.Entities;

namespace Ours.Application.Abstractions;

/// <summary>
/// The application layer's view of persistence. Infrastructure's EF Core DbContext
/// implements this so use-case services can be written and unit-tested against an
/// interface instead of a concrete EF/Npgsql dependency.
/// </summary>
public interface IApplicationDbContext
{
    DbSet<ApplicationUser> Users { get; }
    DbSet<Couple> Couples { get; }
    DbSet<CoupleMember> CoupleMembers { get; }
    DbSet<RefreshToken> RefreshTokens { get; }
    DbSet<CalendarEvent> CalendarEvents { get; }
    DbSet<Account> Accounts { get; }
    DbSet<Transaction> Transactions { get; }
    DbSet<Budget> Budgets { get; }
    DbSet<VaultItem> VaultItems { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
