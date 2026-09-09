using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Ours.Api.Tests.Infrastructure;
using Ours.Application.DTOs.Auth;
using Ours.Application.DTOs.Couples;
using Ours.Application.DTOs.Sync;
using Ours.Application.DTOs.Vault;
using Ours.Application.Services;
using Xunit;

namespace Ours.Api.Tests;

/// <summary>
/// Exercises the Vault over real HTTP: the generic sync push/pull for create/update/delete, the
/// one dedicated endpoint (reveal), couple isolation, and the partner-switching invariant every
/// other feature in this app carries.
/// </summary>
public class VaultSyncFlowTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public VaultSyncFlowTests(CustomWebApplicationFactory factory) => _factory = factory;

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
        var alice = await RegisterAsync(client, $"alice-vault-{suffix}@flow.test", "Alice");
        var bob = await RegisterAsync(client, $"bob-vault-{suffix}@flow.test", "Bob");

        Authorize(client, alice.AccessToken);
        var created = (await (await client.PostAsync("/api/couples", null)).Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;

        Authorize(client, bob.AccessToken);
        var joinResponse = await client.PostAsJsonAsync("/api/couples/join", new JoinCoupleRequestDto { InviteCode = created.Couple.InviteCode });
        var joined = (await joinResponse.Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;

        return (client, created, joined.Auth);
    }

    private static SyncPushItemDto CreateVaultItemPush(Guid id, string title, string password) => new()
    {
        EntityType = SyncService.VaultItemEntityType,
        EntityId = id,
        Operation = SyncOperation.Create,
        ClientUpdatedAt = DateTimeOffset.UtcNow,
        Payload = JsonSerializer.SerializeToElement(new
        {
            title,
            username = "alice@example.com",
            password,
            websiteUrl = "https://netflix.com",
            category = "Streaming",
            notes = "Family account",
        }),
    };

    [Fact]
    public async Task PartnerCreatesVaultItem_OtherPartnerPullsItAndCanRevealIt()
    {
        var (client, alice, bobAuth) = await CreatePairedCoupleAsync(_factory, "pull");
        var itemId = Guid.NewGuid();

        Authorize(client, alice.Auth.AccessToken);
        var pushResponse = await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes = [CreateVaultItemPush(itemId, "Netflix", "correct horse battery staple")],
        });
        Assert.Equal(HttpStatusCode.OK, pushResponse.StatusCode);
        Assert.True((await pushResponse.Content.ReadFromJsonAsync<SyncPushResponseDto>())!.Results[0].Accepted);

        Authorize(client, bobAuth.AccessToken);
        var pullResult = (await (await client.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>())!;
        var change = Assert.Single(pullResult.Changes, c => c.EntityType == SyncService.VaultItemEntityType);
        Assert.Equal(itemId, change.EntityId);

        // Both partners are equally able to reveal the shared item.
        var revealResponse = await client.PostAsync($"/api/vault/{itemId}/reveal", null);
        Assert.Equal(HttpStatusCode.OK, revealResponse.StatusCode);
        var revealed = (await revealResponse.Content.ReadFromJsonAsync<VaultRevealResponseDto>())!;
        Assert.Equal("correct horse battery staple", revealed.Password);
    }

    [Fact]
    public async Task ListAndPullResponses_NeverContainThePlaintextPassword()
    {
        var (client, alice, _) = await CreatePairedCoupleAsync(_factory, "noplaintext");
        var itemId = Guid.NewGuid();

        Authorize(client, alice.Auth.AccessToken);
        await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes = [CreateVaultItemPush(itemId, "Netflix", "correct horse battery staple")],
        });

        var pullResponse = await client.GetAsync("/api/sync/pull");
        var rawJson = await pullResponse.Content.ReadAsStringAsync();

        Assert.DoesNotContain("correct horse battery staple", rawJson);
    }

    [Fact]
    public async Task EditingOtherFields_WithoutResendingThePassword_KeepsItRevealable()
    {
        var (client, alice, _) = await CreatePairedCoupleAsync(_factory, "editnopw");
        var itemId = Guid.NewGuid();

        Authorize(client, alice.Auth.AccessToken);
        await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateVaultItemPush(itemId, "Netflix", "original-password")] });

        await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = SyncService.VaultItemEntityType,
                    EntityId = itemId,
                    Operation = SyncOperation.Update,
                    ClientUpdatedAt = DateTimeOffset.UtcNow.AddMinutes(1),
                    Payload = JsonSerializer.SerializeToElement(new { title = "Netflix Family", username = "alice@example.com", category = "Streaming" }),
                },
            ],
        });

        var revealResponse = await client.PostAsync($"/api/vault/{itemId}/reveal", null);
        var revealed = (await revealResponse.Content.ReadFromJsonAsync<VaultRevealResponseDto>())!;
        Assert.Equal("original-password", revealed.Password);
    }

    [Fact]
    public async Task DeleteOfflineThenSync_PartnerPullsTheDeletion_AndRevealNoLongerWorks()
    {
        var (client, alice, bobAuth) = await CreatePairedCoupleAsync(_factory, "delete");
        var itemId = Guid.NewGuid();

        Authorize(client, alice.Auth.AccessToken);
        await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateVaultItemPush(itemId, "WiFi", "wifi-password-123")] });
        var deleteResponse = await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = SyncService.VaultItemEntityType,
                    EntityId = itemId,
                    Operation = SyncOperation.Delete,
                    ClientUpdatedAt = DateTimeOffset.UtcNow.AddMinutes(1),
                    Payload = JsonSerializer.SerializeToElement<object?>(null),
                },
            ],
        });
        Assert.True((await deleteResponse.Content.ReadFromJsonAsync<SyncPushResponseDto>())!.Results[0].Accepted);

        Authorize(client, bobAuth.AccessToken);
        var pullResult = (await (await client.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>())!;
        var change = Assert.Single(pullResult.Changes, c => c.EntityId == itemId);
        Assert.Equal(SyncOperation.Delete, change.Operation);

        var revealResponse = await client.PostAsync($"/api/vault/{itemId}/reveal", null);
        Assert.Equal(HttpStatusCode.NotFound, revealResponse.StatusCode);
    }

    [Fact]
    public async Task CoupleAB_CannotSeeCoupleCDsVaultItems()
    {
        var (clientAB, aliceAB, _) = await CreatePairedCoupleAsync(_factory, "ab");
        var (clientCD, aliceCD, _) = await CreatePairedCoupleAsync(_factory, "cd");

        Authorize(clientAB, aliceAB.Auth.AccessToken);
        await clientAB.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateVaultItemPush(Guid.NewGuid(), "AB's Gmail", "ab-password")] });

        Authorize(clientCD, aliceCD.Auth.AccessToken);
        var cdItemId = Guid.NewGuid();
        await clientCD.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateVaultItemPush(cdItemId, "CD's Gmail", "cd-password")] });

        var pullResult = (await (await clientCD.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>())!;
        var vaultChanges = pullResult.Changes.Where(c => c.EntityType == SyncService.VaultItemEntityType).ToList();
        Assert.Single(vaultChanges);
        Assert.Equal(cdItemId, vaultChanges[0].EntityId);
    }

    [Fact]
    public async Task UserFromAnotherCouple_CannotRevealSomeoneElsesVaultItem()
    {
        var (clientAB, aliceAB, _) = await CreatePairedCoupleAsync(_factory, "reveal-ab");
        var (clientCD, aliceCD, _) = await CreatePairedCoupleAsync(_factory, "reveal-cd");

        Authorize(clientAB, aliceAB.Auth.AccessToken);
        var itemId = Guid.NewGuid();
        await clientAB.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateVaultItemPush(itemId, "AB's Bank", "ab-bank-password")] });

        // Carol (couple CD) tries to reveal an item that belongs to couple AB.
        Authorize(clientCD, aliceCD.Auth.AccessToken);
        var revealResponse = await clientCD.PostAsync($"/api/vault/{itemId}/reveal", null);

        Assert.Equal(HttpStatusCode.NotFound, revealResponse.StatusCode);
        var body = await revealResponse.Content.ReadAsStringAsync();
        Assert.DoesNotContain("ab-bank-password", body);
    }

    [Fact]
    public async Task Reveal_RejectsUnauthenticatedRequests()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsync($"/api/vault/{Guid.NewGuid()}/reveal", null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task UserWithNoCouple_CannotRevealAnything()
    {
        var client = _factory.CreateClient();
        var solo = await RegisterAsync(client, "solo-vault@flow.test", "Solo");
        Authorize(client, solo.AccessToken);

        var response = await client.PostAsync($"/api/vault/{Guid.NewGuid()}/reveal", null);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task StaleToken_CannotPushVaultMutations_AfterLeavingTheCouple()
    {
        var (client, alice, _) = await CreatePairedCoupleAsync(_factory, "staletoken");
        Authorize(client, alice.Auth.AccessToken);
        await client.PostAsync("/api/couples/leave", null);

        // Still using the pre-leave access token — its coupleId claim is now stale.
        var response = await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes = [CreateVaultItemPush(Guid.NewGuid(), "Should be rejected", "password")],
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task PartnerSwitching_OldVaultItemIsInvisibleAndUnrevealable_AfterLeavingAndRepartnering()
    {
        var (clientAB, aliceAB, bobAuth) = await CreatePairedCoupleAsync(_factory, "switch");
        Authorize(clientAB, aliceAB.Auth.AccessToken);
        var oldItemId = Guid.NewGuid();
        await clientAB.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateVaultItemPush(oldItemId, "Netflix", "old-couple-password")] });

        // A leaves B.
        Assert.Equal(HttpStatusCode.OK, (await clientAB.PostAsync("/api/couples/leave", null)).StatusCode);

        // A joins/creates a couple with C.
        var clientAC = _factory.CreateClient();
        var carol = await RegisterAsync(clientAC, "carol-vault-switch@flow.test", "Carol");
        var aliceLogin = await clientAC.PostAsJsonAsync("/api/auth/login", new LoginRequestDto
        {
            Email = "alice-vault-switch@flow.test",
            Password = "Password123",
        });
        var aliceFreshAuth = (await aliceLogin.Content.ReadFromJsonAsync<AuthResponseDto>())!;
        Authorize(clientAC, aliceFreshAuth.AccessToken);
        var acCouple = (await (await clientAC.PostAsync("/api/couples", null)).Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;

        Authorize(clientAC, acCouple.Auth.AccessToken);
        var pullAfterSwitch = (await (await clientAC.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>())!;
        Assert.DoesNotContain(pullAfterSwitch.Changes, c => c.EntityType == SyncService.VaultItemEntityType);

        // A can no longer reveal the old item under her new couple's session.
        var revealOldResponse = await clientAC.PostAsync($"/api/vault/{oldItemId}/reveal", null);
        Assert.Equal(HttpStatusCode.NotFound, revealOldResponse.StatusCode);

        // A creates a fresh vault item with C.
        var newItemId = Guid.NewGuid();
        await clientAC.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [CreateVaultItemPush(newItemId, "New Couple Wifi", "new-couple-password")] });

        // B (the old partner) must never see A+C's new vault item.
        Authorize(clientAB, bobAuth.AccessToken);
        var bobPull = (await (await clientAB.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>())!;
        Assert.DoesNotContain(bobPull.Changes, c => c.EntityType == SyncService.VaultItemEntityType && c.EntityId == newItemId);
        // Bob's own token is stale at this point too (leaving ended the AB couple for both
        // members) — his reveal attempt is rejected for that reason (403, same as
        // StaleToken_CannotPushVaultMutations_AfterLeavingTheCouple) before it could ever get far
        // enough to check whether newItemId belongs to him, which it never could regardless.
        var bobRevealNewResponse = await clientAB.PostAsync($"/api/vault/{newItemId}/reveal", null);
        Assert.Equal(HttpStatusCode.Forbidden, bobRevealNewResponse.StatusCode);
    }
}
