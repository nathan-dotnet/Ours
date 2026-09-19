using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Ours.Api.Tests.Infrastructure;
using Ours.Application.DTOs.Auth;
using Ours.Application.DTOs.Couples;
using Ours.Application.DTOs.Money;
using Ours.Application.DTOs.Sync;
using Ours.Application.Services;
using Xunit;

namespace Ours.Api.Tests;

/// <summary>
/// Exercises Loans over real HTTP end-to-end: a loan's own record syncs through the generic
/// /api/sync pipeline (entity type "loan" — see SyncService), and "Pay" goes through the
/// dedicated /api/loans/{id}/payments endpoint — real account-balance/loan-balance updates,
/// idempotency, and couple isolation, matching DistributionFlowTests' shape for the sibling
/// "dedicated endpoint, not generic sync" feature.
/// </summary>
public class LoanFlowTests : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory _factory;

    public LoanFlowTests(CustomWebApplicationFactory factory) => _factory = factory;

    private static async Task<AuthResponseDto> RegisterAsync(HttpClient client, string email)
    {
        var response = await client.PostAsJsonAsync("/api/auth/register", new RegisterRequestDto { Email = email, Password = "Password123", DisplayName = "Alice" });
        return (await response.Content.ReadFromJsonAsync<AuthResponseDto>())!;
    }

    private static void Authorize(HttpClient client, string accessToken) =>
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", accessToken);

    private static SyncPushItemDto AccountPush(Guid id, string name, decimal openingBalance) => new()
    {
        EntityType = SyncService.AccountEntityType,
        EntityId = id,
        Operation = SyncOperation.Create,
        ClientUpdatedAt = DateTimeOffset.UtcNow,
        Payload = JsonSerializer.SerializeToElement(new { name, type = "EWallet", icon = "gcash", openingBalance, currency = "PHP", isActive = true }),
    };

    private static SyncPushItemDto LoanPush(Guid id, Guid paymentAccountId, string name, decimal originalAmount, decimal monthlyPayment, int totalInstallments) => new()
    {
        EntityType = SyncService.LoanEntityType,
        EntityId = id,
        Operation = SyncOperation.Create,
        ClientUpdatedAt = DateTimeOffset.UtcNow,
        Payload = JsonSerializer.SerializeToElement(new
        {
            name,
            provider = name,
            originalAmount,
            monthlyPayment,
            totalInstallments,
            firstDueDate = new DateOnly(2026, 9, 15),
            frequency = "Monthly",
            currency = "PHP",
            paymentAccountId,
        }),
    };

    private static async Task<(HttpClient Client, Guid GCashId, Guid LoanId)> SetUpAsync(CustomWebApplicationFactory factory, string suffix)
    {
        var client = factory.CreateClient();
        var auth = await RegisterAsync(client, $"loans-{suffix}@flow.test");
        Authorize(client, auth.AccessToken);
        var createResponse = await client.PostAsync("/api/couples", null);
        createResponse.EnsureSuccessStatusCode();
        var created = (await createResponse.Content.ReadFromJsonAsync<CoupleActionResponseDto>())!;
        // Registration's own token has no coupleId claim yet — re-authorize with the fresh pair
        // couple creation actually returns, same as every other flow test does.
        Authorize(client, created.Auth.AccessToken);

        var gcashId = Guid.NewGuid();
        var loanId = Guid.NewGuid();
        // Two separate push calls, not one batch: a sync push only commits at the very end of the
        // whole request (see SyncService.PushAsync), so an item can't yet reference another item
        // created earlier in the very same batch — same reason every other flow test's setup
        // pushes an account, waits for it to commit, then pushes whatever references it.
        var accountPush = await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [AccountPush(gcashId, "GCash", 10_000m)] });
        accountPush.EnsureSuccessStatusCode();
        var loanPush = await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto { Changes = [LoanPush(loanId, gcashId, "Shopee PayLater", 10_200m, 1_700m, 6)] });
        loanPush.EnsureSuccessStatusCode();

        return (client, gcashId, loanId);
    }

    private static LoanPaymentRequestDto PaymentRequest(decimal amount, Guid accountId, Guid? paymentId = null) => new()
    {
        PaymentId = paymentId ?? Guid.NewGuid(),
        Amount = amount,
        AccountId = accountId,
    };

    [Fact]
    public async Task Pay_RequiresAuthentication()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync($"/api/loans/{Guid.NewGuid()}/payments", PaymentRequest(1_700m, Guid.NewGuid()));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Pay_MatchesTheSpecWorkedExample_AndIsReflectedOnTheNextSyncPull()
    {
        var (client, gcashId, loanId) = await SetUpAsync(_factory, "success");

        var response = await client.PostAsJsonAsync($"/api/loans/{loanId}/payments", PaymentRequest(1_700m, gcashId));
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<LoanPaymentResponseDto>();

        Assert.Equal(8_500m, body!.Loan.RemainingBalance);
        Assert.Equal(1, body.Loan.InstallmentsPaid);
        Assert.Equal(5, body.Loan.RemainingInstallments);
        Assert.Equal(LoanStatus.Active, body.Loan.Status);

        var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        var pulled = await (await client.GetAsync("/api/sync/pull")).Content.ReadFromJsonAsync<SyncPullResponseDto>();
        var loanPayments = pulled!.Changes
            .Where(c => c.EntityType == SyncService.TransactionEntityType)
            .Select(c => ((JsonElement)c.Payload!).Deserialize<TransactionPayloadDto>(jsonOptions)!)
            .Where(p => p.Type == "LoanPayment")
            .ToList();
        Assert.Single(loanPayments);
        Assert.Equal(1_700m, loanPayments[0].Amount);
        Assert.Equal(gcashId, loanPayments[0].AccountId);
        Assert.Equal(loanId, loanPayments[0].LoanId);
    }

    [Fact]
    public async Task Pay_TheSamePaymentIdSentTwice_IsANoOp()
    {
        var (client, gcashId, loanId) = await SetUpAsync(_factory, "duplicate");
        var request = PaymentRequest(1_700m, gcashId);

        var first = await client.PostAsJsonAsync($"/api/loans/{loanId}/payments", request);
        first.EnsureSuccessStatusCode();
        var second = await client.PostAsJsonAsync($"/api/loans/{loanId}/payments", request);
        second.EnsureSuccessStatusCode();

        var firstBody = await first.Content.ReadFromJsonAsync<LoanPaymentResponseDto>();
        var secondBody = await second.Content.ReadFromJsonAsync<LoanPaymentResponseDto>();
        Assert.Equal(firstBody!.TransactionId, secondBody!.TransactionId);
        Assert.Equal(8_500m, secondBody.Loan.RemainingBalance);
    }

    [Fact]
    public async Task Pay_RejectsAPaymentLargerThanTheRemainingBalance()
    {
        var (client, gcashId, loanId) = await SetUpAsync(_factory, "overpay");

        var response = await client.PostAsJsonAsync($"/api/loans/{loanId}/payments", PaymentRequest(10_300m, gcashId));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Pay_RejectsInsufficientBalance()
    {
        var (client, gcashId, loanId) = await SetUpAsync(_factory, "insufficient");

        // GCash only has 10,000, but nothing stops requesting an amount at the very edge of the
        // loan's remaining balance (10,200) if the account can't actually cover it.
        var response = await client.PostAsJsonAsync($"/api/loans/{loanId}/payments", PaymentRequest(10_001m, gcashId));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Pay_CanNeverBeUsedAcrossCoupleBoundaries()
    {
        var (aliceClient, _, _) = await SetUpAsync(_factory, "isolation-a");
        var (_, otherGCashId, otherLoanId) = await SetUpAsync(_factory, "isolation-b");

        // Alice tries to pay the other couple's loan, even using her own account id in the body —
        // must fail on the loan lookup itself, not leak whether it exists.
        var response = await aliceClient.PostAsJsonAsync($"/api/loans/{otherLoanId}/payments", PaymentRequest(1_000m, otherGCashId));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task LoanPayment_IsRejectedFromGenericSyncPush_SystemGeneratedOnly()
    {
        var (client, gcashId, loanId) = await SetUpAsync(_factory, "reject-push");

        var pushResponse = await client.PostAsJsonAsync("/api/sync/push", new SyncPushRequestDto
        {
            Changes =
            [
                new SyncPushItemDto
                {
                    EntityType = SyncService.TransactionEntityType,
                    EntityId = Guid.NewGuid(),
                    Operation = SyncOperation.Create,
                    ClientUpdatedAt = DateTimeOffset.UtcNow,
                    Payload = JsonSerializer.SerializeToElement(new
                    {
                        type = "LoanPayment",
                        amount = 1_700m,
                        currency = "PHP",
                        accountId = gcashId,
                        loanId,
                        transactionDate = DateOnly.FromDateTime(DateTime.UtcNow),
                    }),
                },
            ],
        });
        pushResponse.EnsureSuccessStatusCode();

        var result = (await pushResponse.Content.ReadFromJsonAsync<SyncPushResponseDto>())!.Results.Single();
        Assert.False(result.Accepted);
    }
}
