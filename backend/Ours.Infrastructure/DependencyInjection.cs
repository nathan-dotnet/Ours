using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Ours.Application.Abstractions;
using Ours.Application.Services;
using Ours.Domain.Entities;
using Ours.Infrastructure.Email;
using Ours.Infrastructure.Identity;
using Ours.Infrastructure.Persistence;
using Ours.Infrastructure.Services;

namespace Ours.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Default")
            ?? throw new InvalidOperationException("Missing ConnectionStrings:Default configuration.");

        services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));
        services.AddScoped<IApplicationDbContext>(sp => sp.GetRequiredService<AppDbContext>());

        services.AddIdentityCore<ApplicationUser>(options =>
            {
                options.Password.RequiredLength = 8;
                options.Password.RequireNonAlphanumeric = false;
                options.Password.RequireUppercase = false;
                options.User.RequireUniqueEmail = true;
            })
            .AddRoles<IdentityRole<Guid>>()
            .AddEntityFrameworkStores<AppDbContext>()
            .AddDefaultTokenProviders();

        // GeneratePasswordResetTokenAsync/ResetPasswordAsync use Identity's "Default" token
        // provider, which is DataProtectorTokenProvider — this is what makes the reset token
        // time-limited. 1 hour rather than the framework default (1 day) for a tighter window.
        services.Configure<DataProtectionTokenProviderOptions>(options =>
        {
            options.TokenLifespan = TimeSpan.FromHours(1);
        });

        services.Configure<JwtOptions>(configuration.GetSection(JwtOptions.SectionName));
        services.Configure<AppOptions>(configuration.GetSection(AppOptions.SectionName));
        services.Configure<EmailOptions>(configuration.GetSection(EmailOptions.SectionName));
        services.Configure<VaultEncryptionOptions>(configuration.GetSection(VaultEncryptionOptions.SectionName));

        services.AddHttpContextAccessor();
        services.AddScoped<ICurrentUserService, CurrentUserService>();
        services.AddSingleton<IDateTimeProvider, DateTimeProvider>();
        services.AddSingleton<IInviteCodeGenerator, InviteCodeGenerator>();
        services.AddScoped<IJwtTokenService, JwtTokenService>();
        services.AddScoped<IIdentityService, IdentityService>();
        // Singleton: holds only the parsed key material from configuration, no per-request state.
        services.AddSingleton<IVaultEncryptionService, VaultEncryptionService>();

        services.AddScoped<IEmailService>(sp =>
        {
            var emailOptions = sp.GetRequiredService<IOptions<EmailOptions>>().Value;
            return emailOptions.Provider.Equals("smtp", StringComparison.OrdinalIgnoreCase)
                ? ActivatorUtilities.CreateInstance<SmtpEmailService>(sp)
                : ActivatorUtilities.CreateInstance<DevelopmentEmailService>(sp);
        });

        services.AddScoped<AuthService>();
        services.AddScoped<CoupleService>();
        services.AddScoped<SyncService>();
        services.AddScoped<VaultService>();

        return services;
    }
}
