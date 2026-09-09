using System.Net;
using System.Net.Http.Json;
using Ours.Api.Tests.Infrastructure;
using Ours.Application.DTOs.Auth;
using Ours.Application.DTOs.Couples;
using Ours.Application.DTOs.MissMe;
using Ours.Domain.Entities;
using Xunit;

namespace Ours.Api.Tests;

/// <summary>
/// Exercises the Miss Me gesture over real HTTP: sending, the server-enforced cooldown, the
/// Miss You Too reply, couple isolation, and the same partner-switching/stale-token invariants
/// every other couple-scoped feature in this app carries (see VaultSyncFlowTests).
/// </summary>
public class MissMeFlowTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public MissMeFlowTests(CustomWebApplicationFactory factory) => _factory = factory;

    private static async Task<AuthResponseDto> RegisterAsync(HttpClient client, string email, string displayName)
    {
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequestDto
        {
            Email = email,
            Password = "Password123",
            DisplayName = displayName,
        });
        if (!response.IsSuccessStatusCode)
        {
            throw new Exception($"Register failed ({response.StatusCode}): {await response.Content.ReadAsStringAsync()}");
        }
        return (await response.Content.ReadFromJsonAsync<AuthResponseDto>())!;
    }

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);

    private static async Task<(HttpClient Client, CoupleActionResponseDto Alice, AuthResponseDto Bob)> CreatePairedCoupleAsync(
        CustomWebApplicationFactory factory, string suffix)
    {
        var client = factory.CreateClient();
        var alice = await RegisterAsync(client, $"alice-missme-{suffix}@flow.test", "Alice");
        var bob = await RegisterAsync(client, $"bob-missme-{suffix}@flow.test", "Bob");

        Authorize(client, alice.AccessToken);
        var created = (await (await client.PostAsync("/api/couples", null)).Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;

        Authorize(client, bob.AccessToken);
        var joinResponse = await client.PostAsJsonAsync("/api/couples/join", new JoinCoupleRequestDto { InviteCode = created.Couple.InviteCode });
        var joined = (await joinResponse.Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;

        return (client, created, joined.Auth);
    }

    [Fact]
    public async Task Send_MissMe_PartnerSeesItAsPendingOnStatus()
    {
        var (client, alice, bobAuth) = await CreatePairedCoupleAsync(_factory, "pending");

        Authorize(client, alice.Auth.AccessToken);
        var sendResponse = await client.PostAsJsonAsync("/api/miss-me/send", new MissMeSendRequestDto { Type = MissMeInteractionType.MissMe });
        Assert.Equal(HttpStatusCode.OK, sendResponse.StatusCode);
        var sent = (await sendResponse.Content.ReadFromJsonAsync<MissMeSendResponseDto>())!;
        Assert.True(sent.Sent);
        Assert.Equal("Alice", sent.Interaction!.SenderDisplayName);

        Authorize(client, bobAuth.AccessToken);
        var status = (await (await client.GetAsync("/api/miss-me/status")).Content.ReadFromJsonAsync<MissMeStatusResponseDto>())!;
        Assert.NotNull(status.PendingFromPartner);
        Assert.Equal(sent.Interaction.Id, status.PendingFromPartner!.Id);
        Assert.Equal("Alice", status.PendingFromPartner.SenderDisplayName);
    }

    [Fact]
    public async Task Send_SecondMissMeWithinCooldown_IsWithheld_NotAnError()
    {
        var (client, alice, _) = await CreatePairedCoupleAsync(_factory, "cooldown");
        Authorize(client, alice.Auth.AccessToken);

        var first = await client.PostAsJsonAsync("/api/miss-me/send", new MissMeSendRequestDto { Type = MissMeInteractionType.MissMe });
        Assert.True((await first.Content.ReadFromJsonAsync<MissMeSendResponseDto>())!.Sent);

        var second = await client.PostAsJsonAsync("/api/miss-me/send", new MissMeSendRequestDto { Type = MissMeInteractionType.MissMe });
        Assert.Equal(HttpStatusCode.OK, second.StatusCode); // withheld, not rejected
        var secondBody = (await second.Content.ReadFromJsonAsync<MissMeSendResponseDto>())!;
        Assert.False(secondBody.Sent);
        Assert.NotNull(secondBody.NextAvailableAt);

        var status = (await (await client.GetAsync("/api/miss-me/status")).Content.ReadFromJsonAsync<MissMeStatusResponseDto>())!;
        Assert.False(status.CanSend);
    }

    [Fact]
    public async Task Send_MissYouToo_RespondsToPartnersMissMe_AndClearsPending()
    {
        var (client, alice, bobAuth) = await CreatePairedCoupleAsync(_factory, "reply");

        Authorize(client, alice.Auth.AccessToken);
        var missMe = (await (await client.PostAsJsonAsync("/api/miss-me/send", new MissMeSendRequestDto { Type = MissMeInteractionType.MissMe }))
            .Content.ReadFromJsonAsync<MissMeSendResponseDto>())!;

        Authorize(client, bobAuth.AccessToken);
        var replyResponse = await client.PostAsJsonAsync("/api/miss-me/send", new MissMeSendRequestDto
        {
            Type = MissMeInteractionType.MissYouToo,
            InResponseToId = missMe.Interaction!.Id,
        });
        Assert.Equal(HttpStatusCode.OK, replyResponse.StatusCode);
        var reply = (await replyResponse.Content.ReadFromJsonAsync<MissMeSendResponseDto>())!;
        Assert.True(reply.Sent);
        Assert.Equal("Bob", reply.Interaction!.SenderDisplayName);

        var statusAfter = (await (await client.GetAsync("/api/miss-me/status")).Content.ReadFromJsonAsync<MissMeStatusResponseDto>())!;
        Assert.Null(statusAfter.PendingFromPartner);
        Assert.Equal(2, statusAfter.RecentHistory.Count);
    }

    [Fact]
    public async Task Send_RejectsUnauthenticatedRequests()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/miss-me/send", new MissMeSendRequestDto { Type = MissMeInteractionType.MissMe });

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Status_RejectsUnauthenticatedRequests()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/miss-me/status");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Send_UserWithNoCouple_IsForbidden()
    {
        var client = _factory.CreateClient();
        var solo = await RegisterAsync(client, "solo-missme@flow.test", "Solo");
        Authorize(client, solo.AccessToken);

        var response = await client.PostAsJsonAsync("/api/miss-me/send", new MissMeSendRequestDto { Type = MissMeInteractionType.MissMe });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Send_CannotReplyToAnotherCouplesMissMe()
    {
        var (clientAB, aliceAB, _) = await CreatePairedCoupleAsync(_factory, "cross-ab");
        var (clientCD, aliceCD, _) = await CreatePairedCoupleAsync(_factory, "cross-cd");

        Authorize(clientAB, aliceAB.Auth.AccessToken);
        var abMissMe = (await (await clientAB.PostAsJsonAsync("/api/miss-me/send", new MissMeSendRequestDto { Type = MissMeInteractionType.MissMe }))
            .Content.ReadFromJsonAsync<MissMeSendResponseDto>())!;

        // Alice of couple CD tries to reply to a MissMe that belongs to couple AB entirely.
        Authorize(clientCD, aliceCD.Auth.AccessToken);
        var response = await clientCD.PostAsJsonAsync("/api/miss-me/send", new MissMeSendRequestDto
        {
            Type = MissMeInteractionType.MissYouToo,
            InResponseToId = abMissMe.Interaction!.Id,
        });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task StaleToken_CannotSendMissMe_AfterLeavingTheCouple()
    {
        var (client, alice, _) = await CreatePairedCoupleAsync(_factory, "staletoken");
        Authorize(client, alice.Auth.AccessToken);
        await client.PostAsync("/api/couples/leave", null);

        // Still using the pre-leave access token — its coupleId claim is now stale.
        var response = await client.PostAsJsonAsync("/api/miss-me/send", new MissMeSendRequestDto { Type = MissMeInteractionType.MissMe });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task PartnerSwitching_OldMissMeHistoryNeverLeaksToTheNewCouple()
    {
        var (clientAB, aliceAB, bobAuth) = await CreatePairedCoupleAsync(_factory, "switch");
        Authorize(clientAB, aliceAB.Auth.AccessToken);
        await clientAB.PostAsJsonAsync("/api/miss-me/send", new MissMeSendRequestDto { Type = MissMeInteractionType.MissMe });

        // A leaves B, then joins/creates a couple with Carol.
        Assert.Equal(HttpStatusCode.OK, (await clientAB.PostAsync("/api/couples/leave", null)).StatusCode);

        var clientAC = _factory.CreateClient();
        var carol = await RegisterAsync(clientAC, "carol-missme-switch@flow.test", "Carol");
        var aliceLogin = await clientAC.PostAsJsonAsync("/api/auth/login", new LoginRequestDto
        {
            Email = "alice-missme-switch@flow.test",
            Password = "Password123",
        });
        var aliceFreshAuth = (await aliceLogin.Content.ReadFromJsonAsync<AuthResponseDto>())!;
        Authorize(clientAC, aliceFreshAuth.AccessToken);
        var acCouple = (await (await clientAC.PostAsync("/api/couples", null)).Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;

        Authorize(clientAC, acCouple.Auth.AccessToken);
        var statusWithCarol = (await (await clientAC.GetAsync("/api/miss-me/status")).Content.ReadFromJsonAsync<MissMeStatusResponseDto>())!;

        Assert.Empty(statusWithCarol.RecentHistory);
        Assert.Null(statusWithCarol.PendingFromPartner);
        Assert.True(statusWithCarol.CanSend); // the old couple's cooldown never carries over into the new one
    }
}
