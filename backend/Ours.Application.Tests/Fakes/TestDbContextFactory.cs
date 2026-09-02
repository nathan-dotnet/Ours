using Microsoft.EntityFrameworkCore;
using Ours.Infrastructure.Persistence;

namespace Ours.Application.Tests.Fakes;

public static class TestDbContextFactory
{
    /// <summary>A fresh, isolated in-memory AppDbContext — one per test, never shared.</summary>
    public static AppDbContext Create()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }
}
