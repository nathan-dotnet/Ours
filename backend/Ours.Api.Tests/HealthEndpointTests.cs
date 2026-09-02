using System.Net;
using Ours.Api.Tests.Infrastructure;
using Xunit;

namespace Ours.Api.Tests;

public class HealthEndpointTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public HealthEndpointTests(CustomWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Health_ReturnsOk()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task CouplesMe_WithoutToken_ReturnsUnauthorized()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/couples/me");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
