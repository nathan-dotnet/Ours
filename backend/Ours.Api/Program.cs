using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Ours.Api.Middleware;
using Ours.Application.Abstractions;
using Ours.Infrastructure;
using Ours.Infrastructure.Identity;
using Ours.Infrastructure.Persistence;
using Ours.Infrastructure.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDataProtection()
    .PersistKeysToDbContext<AppDbContext>();

builder.Services.AddInfrastructure(builder.Configuration);

builder.Services.AddControllers();
// Built-in OpenAPI document generation (Microsoft.AspNetCore.OpenApi). Phase 1 exposes the
// raw document at /openapi/v1.json in Development for exploration with any REST client;
// authenticated requests need a manually-added `Authorization: Bearer <token>` header.
builder.Services.AddOpenApi();

builder.Services.AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer();

// Bound via DI (IOptions<JwtOptions>) rather than a raw `builder.Configuration.Get<>()` read,
// so this always sees the final, fully-composed configuration — including whatever a test
// host's WebApplicationFactory overrides — instead of a snapshot taken mid-startup.
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<IOptions<JwtOptions>>((bearerOptions, jwtOptionsAccessor) =>
    {
        var jwtOptions = jwtOptionsAccessor.Value;
        bearerOptions.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtOptions.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.Secret)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
        };
    });

builder.Services.AddAuthorization();

// The mobile app talks to this API from an Expo dev server / native shell rather than a
// browser origin covered by a fixed allow-list, so CORS is left open here in Phase 1.
// Tighten this before any browser-based client (e.g. an admin web app) is added later.
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();

// Fail fast on missing config, checked here (after the container is fully built, so this also
// sees test-host overrides) rather than at first request.
var configuredJwtOptions = app.Services.GetRequiredService<IOptions<JwtOptions>>().Value;
if (string.IsNullOrWhiteSpace(configuredJwtOptions.Secret))
{
    throw new InvalidOperationException(
        "Jwt:Secret is not configured. Set it via `dotnet user-secrets set \"Jwt:Secret\" \"<value>\"` " +
        "(development) or the Jwt__Secret environment variable (production). See backend/README.md.");
}

var configuredVaultOptions = app.Services.GetRequiredService<IOptions<VaultEncryptionOptions>>().Value;
if (!configuredVaultOptions.Keys.ContainsKey(configuredVaultOptions.CurrentKeyVersion.ToString()))
{
    throw new InvalidOperationException(
        $"Vault:Keys:{configuredVaultOptions.CurrentKeyVersion} is not configured. Set it via " +
        $"`dotnet user-secrets set \"Vault:Keys:{configuredVaultOptions.CurrentKeyVersion}\" \"<base64 32-byte key>\"` " +
        "(development, e.g. `openssl rand -base64 32`) or the corresponding Vault__Keys__<version> " +
        "environment variable (production). See backend/README.md.");
}
// Constructing the service here (rather than waiting for the first request) is what actually
// validates the key's shape (valid base64, exactly 32 bytes) fails fast too.
_ = app.Services.GetRequiredService<IVaultEncryptionService>();

app.UseMiddleware<ExceptionHandlingMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();

// Exposed for WebApplicationFactory<Program> in integration tests.
public partial class Program;
