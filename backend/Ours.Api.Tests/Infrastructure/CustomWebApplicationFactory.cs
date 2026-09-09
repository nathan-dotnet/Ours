using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Ours.Infrastructure.Persistence;

namespace Ours.Api.Tests.Infrastructure;

/// <summary>
/// Boots the real API pipeline (auth, middleware, DI wiring) against an isolated in-memory
/// database instead of Postgres, and with a fixed test JWT secret, so the whole HTTP stack
/// can be exercised without any local infrastructure dependency.
/// </summary>
public class CustomWebApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _databaseName = Guid.NewGuid().ToString();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Default"] = "Host=localhost;Database=unused_in_tests",
                ["Jwt:Secret"] = "integration-test-secret-integration-test-secret",
                ["Jwt:Issuer"] = "Ours",
                ["Jwt:Audience"] = "OursApp",
                ["Jwt:AccessTokenMinutes"] = "15",
                // A real (test-only) AES-256 key — "integration-test-vault-key-32byt" is exactly
                // 32 bytes — so Program.cs's fail-fast Vault key check passes and VaultController
                // tests can actually encrypt/decrypt through the real service, not a fake one.
                ["Vault:CurrentKeyVersion"] = "1",
                ["Vault:Keys:1"] = "aW50ZWdyYXRpb24tdGVzdC12YXVsdC1rZXktMzJieXQ=",
            });
        });

        builder.ConfigureServices(services =>
        {
            // AddDbContext accumulates its options-configuration callback as a separate
            // IDbContextOptionsConfiguration<T> registration (so multiple AddDbContext calls
            // compose) — removing only DbContextOptions<T> leaves Program.cs's UseNpgsql(...)
            // callback registered too, and EF refuses to build options with two providers
            // configured. Both descriptors have to go before re-adding with UseInMemoryDatabase.
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<AppDbContext>>();
            services.AddDbContext<AppDbContext>(options => options.UseInMemoryDatabase(_databaseName));
        });
    }
}
