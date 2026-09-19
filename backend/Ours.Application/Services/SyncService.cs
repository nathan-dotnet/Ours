using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Ours.Application.Abstractions;
using Ours.Application.Common;
using Ours.Application.DTOs.Calendar;
using Ours.Application.DTOs.Couples;
using Ours.Application.DTOs.Money;
using Ours.Application.DTOs.Sync;
using Ours.Application.DTOs.Vault;
using Ours.Domain.Entities;

namespace Ours.Application.Services;

/// <summary>
/// Generic, entity-agnostic sync endpoint implementation. Phase 1 registered a handler for
/// "couple_profile" purely to prove the offline round trip end-to-end; Phase 2 added
/// "calendar_event"; Phase 3 added the Money System's three entities — "account",
/// "money_transaction", and "budget"; the Vault feature adds "vault_item" — all the same way.
/// Adding a new synced feature means adding a case per entity type to <see cref="PullAsync"/> and
/// <see cref="PushAsync"/>, not a new controller or a parallel sync mechanism. "vault_item" is the
/// one entity type whose payload isn't symmetric between the two directions — see
/// <see cref="VaultItemPayloadDto"/>'s doc comment.
/// </summary>
public class SyncService(
    IApplicationDbContext db,
    ICurrentUserService currentUser,
    IDateTimeProvider clock,
    IVaultEncryptionService vaultEncryption)
{
    public const string CoupleProfileEntityType = "couple_profile";
    public const string CalendarEventEntityType = "calendar_event";
    public const string AccountEntityType = "account";
    public const string TransactionEntityType = "money_transaction";
    public const string BudgetEntityType = "budget";
    public const string SavingsGoalEntityType = "savings_goal";
    public const string LoanEntityType = "loan";
    public const string VaultItemEntityType = "vault_item";

    /// <summary>Sanity ceiling on password length — independent of the column's actual varchar(200) headroom.</summary>
    private const int MaxPasswordLength = 200;

    /// <summary>Application-level sanity ceiling — independent of any column's actual numeric(18,2) headroom — rejecting an obviously-mistyped amount (e.g. an extra zero) rather than silently accepting it. Shared by every money amount: Transaction.Amount, Account.OpeningBalance, Budget.Amount.</summary>
    private const decimal MaxMoneyAmount = 10_000_000m;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<SyncPullResponseDto> PullAsync(DateTimeOffset? since, CancellationToken ct = default)
    {
        var coupleId = currentUser.CoupleId ?? throw new ForbiddenAppException("You must belong to a couple to sync.");
        var serverTime = clock.UtcNow;
        var changes = new List<SyncChangeDto>();

        var couple = await db.Couples.FirstOrDefaultAsync(c => c.Id == coupleId, ct);
        if (couple is not null && (since is null || couple.UpdatedAt > since))
        {
            // Membership (who's actually in the couple right now) is included here rather than
            // synced as its own entity — it's the only way the *other* partner's device learns
            // a join happened, since it has nothing of its own to push or poll for that.
            var members = couple.IsDeleted
                ? null
                : await db.CoupleMembers
                    .Where(m => m.CoupleId == couple.Id && m.LeftAt == null)
                    .Include(m => m.User)
                    .Select(m => new CoupleMemberDto
                    {
                        UserId = m.UserId,
                        DisplayName = m.User.DisplayName,
                        JoinedAt = m.JoinedAt,
                        MonthlyIncome = m.MonthlyIncome,
                        WantsAllocationPercent = m.WantsAllocationPercent,
                        WantsAccountId = m.WantsAccountId,
                    })
                    .ToListAsync(ct);

            changes.Add(new SyncChangeDto
            {
                EntityType = CoupleProfileEntityType,
                EntityId = couple.Id,
                Operation = couple.IsDeleted ? SyncOperation.Delete : SyncOperation.Update,
                // MyMonthlyIncome/MemberWantsAllocations are deliberately absent here — both
                // push-only fields (see their own doc comments); each member's income and Wants
                // split are already carried per-member in `members`.
                Payload = couple.IsDeleted ? null : new CoupleProfilePayloadDto
                {
                    Nickname = couple.Nickname,
                    AnniversaryDate = couple.AnniversaryDate,
                    BudgetAllocationPercent = couple.BudgetAllocationPercent,
                    SavingsAllocationPercent = couple.SavingsAllocationPercent,
                    WantsAllocationPercent = couple.WantsAllocationPercent,
                    BudgetAccountId = couple.BudgetAccountId,
                    SavingsAccountId = couple.SavingsAccountId,
                    Members = members,
                },
                UpdatedAt = couple.UpdatedAt,
                UpdatedByUserId = couple.UpdatedByUserId,
                Version = couple.Version,
            });
        }

        var events = await db.CalendarEvents
            .Where(e => e.CoupleId == coupleId && (since == null || e.UpdatedAt > since))
            .ToListAsync(ct);
        foreach (var calendarEvent in events)
        {
            changes.Add(new SyncChangeDto
            {
                EntityType = CalendarEventEntityType,
                EntityId = calendarEvent.Id,
                Operation = calendarEvent.IsDeleted ? SyncOperation.Delete : SyncOperation.Update,
                Payload = calendarEvent.IsDeleted ? null : new CalendarEventPayloadDto
                {
                    Title = calendarEvent.Title,
                    Description = calendarEvent.Description,
                    StartAt = calendarEvent.StartAt,
                    EndAt = calendarEvent.EndAt,
                    AllDay = calendarEvent.AllDay,
                    Location = calendarEvent.Location,
                    ReminderAt = calendarEvent.ReminderAt,
                    CreatedByUserId = calendarEvent.CreatedByUserId,
                },
                UpdatedAt = calendarEvent.UpdatedAt,
                UpdatedByUserId = calendarEvent.UpdatedByUserId,
                Version = calendarEvent.Version,
            });
        }

        var accounts = await db.Accounts
            .Where(a => a.CoupleId == coupleId && (since == null || a.UpdatedAt > since))
            .ToListAsync(ct);
        foreach (var account in accounts)
        {
            // Accounts are never deleted (see ApplyAccountChangeAsync) — always an upsert.
            changes.Add(new SyncChangeDto
            {
                EntityType = AccountEntityType,
                EntityId = account.Id,
                Operation = SyncOperation.Update,
                Payload = new AccountPayloadDto
                {
                    Name = account.Name,
                    Type = account.Type,
                    Icon = account.Icon,
                    OpeningBalance = account.OpeningBalance,
                    Currency = account.Currency,
                    IsActive = account.IsActive,
                },
                UpdatedAt = account.UpdatedAt,
                UpdatedByUserId = account.UpdatedByUserId,
                Version = account.Version,
            });
        }

        var transactions = await db.Transactions
            .Where(t => t.CoupleId == coupleId && (since == null || t.UpdatedAt > since))
            .ToListAsync(ct);
        foreach (var transaction in transactions)
        {
            changes.Add(new SyncChangeDto
            {
                EntityType = TransactionEntityType,
                EntityId = transaction.Id,
                Operation = transaction.IsDeleted ? SyncOperation.Delete : SyncOperation.Update,
                Payload = transaction.IsDeleted ? null : new TransactionPayloadDto
                {
                    Type = transaction.Type,
                    Amount = transaction.Amount,
                    Currency = transaction.Currency,
                    AccountId = transaction.AccountId,
                    DestinationAccountId = transaction.DestinationAccountId,
                    Category = transaction.Category,
                    SavingsGoalId = transaction.SavingsGoalId,
                    LoanId = transaction.LoanId,
                    Description = transaction.Description,
                    TransactionDate = transaction.TransactionDate,
                    Notes = transaction.Notes,
                    PaidByUserId = transaction.PaidByUserId,
                    CreatedByUserId = transaction.CreatedByUserId,
                },
                UpdatedAt = transaction.UpdatedAt,
                UpdatedByUserId = transaction.UpdatedByUserId,
                Version = transaction.Version,
            });
        }

        var budgets = await db.Budgets
            .Where(b => b.CoupleId == coupleId && (since == null || b.UpdatedAt > since))
            .ToListAsync(ct);
        foreach (var budget in budgets)
        {
            changes.Add(new SyncChangeDto
            {
                EntityType = BudgetEntityType,
                EntityId = budget.Id,
                Operation = budget.IsDeleted ? SyncOperation.Delete : SyncOperation.Update,
                Payload = budget.IsDeleted ? null : new BudgetPayloadDto
                {
                    Category = budget.Category,
                    Year = budget.Year,
                    Month = budget.Month,
                    Amount = budget.Amount,
                    Currency = budget.Currency,
                },
                UpdatedAt = budget.UpdatedAt,
                UpdatedByUserId = budget.UpdatedByUserId,
                Version = budget.Version,
            });
        }

        var savingsGoals = await db.SavingsGoals
            .Where(g => g.CoupleId == coupleId && (since == null || g.UpdatedAt > since))
            .ToListAsync(ct);
        foreach (var goal in savingsGoals)
        {
            changes.Add(new SyncChangeDto
            {
                EntityType = SavingsGoalEntityType,
                EntityId = goal.Id,
                Operation = goal.IsDeleted ? SyncOperation.Delete : SyncOperation.Update,
                Payload = goal.IsDeleted ? null : new SavingsGoalPayloadDto
                {
                    Name = goal.Name,
                    TargetAmount = goal.TargetAmount,
                    Currency = goal.Currency,
                    AllocationPercent = goal.AllocationPercent,
                    IsActive = goal.IsActive,
                },
                UpdatedAt = goal.UpdatedAt,
                UpdatedByUserId = goal.UpdatedByUserId,
                Version = goal.Version,
            });
        }

        var loans = await db.Loans
            .Where(l => l.CoupleId == coupleId && (since == null || l.UpdatedAt > since))
            .ToListAsync(ct);
        foreach (var loan in loans)
        {
            changes.Add(new SyncChangeDto
            {
                EntityType = LoanEntityType,
                EntityId = loan.Id,
                Operation = loan.IsDeleted ? SyncOperation.Delete : SyncOperation.Update,
                Payload = loan.IsDeleted ? null : new LoanPayloadDto
                {
                    Name = loan.Name,
                    Provider = loan.Provider,
                    OriginalAmount = loan.OriginalAmount,
                    MonthlyPayment = loan.MonthlyPayment,
                    TotalInstallments = loan.TotalInstallments,
                    FirstDueDate = loan.FirstDueDate,
                    Frequency = loan.Frequency,
                    FeesAmount = loan.FeesAmount,
                    Currency = loan.Currency,
                    PaymentAccountId = loan.PaymentAccountId,
                    OwnerUserId = loan.OwnerUserId,
                },
                UpdatedAt = loan.UpdatedAt,
                UpdatedByUserId = loan.UpdatedByUserId,
                Version = loan.Version,
            });
        }

        var vaultItems = await db.VaultItems
            .Where(v => v.CoupleId == coupleId && (since == null || v.UpdatedAt > since))
            .ToListAsync(ct);
        foreach (var vaultItem in vaultItems)
        {
            changes.Add(new SyncChangeDto
            {
                EntityType = VaultItemEntityType,
                EntityId = vaultItem.Id,
                Operation = vaultItem.IsDeleted ? SyncOperation.Delete : SyncOperation.Update,
                // Password is deliberately absent — only the already-encrypted representation is
                // ever sent down. Neither device ever holds the key to decrypt it locally; see
                // VaultController.Reveal for the one place plaintext leaves the server at all.
                Payload = vaultItem.IsDeleted ? null : new VaultItemPayloadDto
                {
                    Title = vaultItem.Title,
                    Username = vaultItem.Username,
                    WebsiteUrl = vaultItem.WebsiteUrl,
                    Category = vaultItem.Category,
                    Notes = vaultItem.Notes,
                    EncryptedPassword = Convert.ToBase64String(vaultItem.EncryptedPassword),
                    Nonce = Convert.ToBase64String(vaultItem.Nonce),
                    AuthTag = Convert.ToBase64String(vaultItem.AuthTag),
                    KeyVersion = vaultItem.KeyVersion,
                    CreatedByUserId = vaultItem.CreatedByUserId,
                },
                UpdatedAt = vaultItem.UpdatedAt,
                UpdatedByUserId = vaultItem.UpdatedByUserId,
                Version = vaultItem.Version,
            });
        }

        // Future entity types append their own "changed since `since`" checks here.

        return new SyncPullResponseDto { ServerTime = serverTime, Changes = changes };
    }

    public async Task<SyncPushResponseDto> PushAsync(SyncPushRequestDto request, CancellationToken ct = default)
    {
        var coupleId = currentUser.CoupleId ?? throw new ForbiddenAppException("You must belong to a couple to sync.");

        // The JWT's coupleId claim is only as fresh as the token itself (up to its lifetime) —
        // if the couple ended since this token was issued (the caller left, or their partner
        // did), the claim is stale. Checked once up front rather than per-entity-type handler,
        // so this covers couple_profile and every future entity type uniformly: an ended couple
        // can never accept a mutation, no matter what a stale-but-still-valid token claims.
        var coupleIsActive = await db.Couples.AnyAsync(c => c.Id == coupleId && !c.IsDeleted, ct);
        if (!coupleIsActive)
        {
            throw new ForbiddenAppException("Your couple is no longer active.");
        }

        var results = new List<SyncPushResultItemDto>();

        foreach (var item in request.Changes)
        {
            if (!SyncOperation.IsValid(item.Operation))
            {
                results.Add(Rejected(item, "Unknown operation."));
                continue;
            }

            var result = item.EntityType switch
            {
                CoupleProfileEntityType => await ApplyCoupleProfileChangeAsync(coupleId, item, ct),
                CalendarEventEntityType => await ApplyCalendarEventChangeAsync(coupleId, item, ct),
                AccountEntityType => await ApplyAccountChangeAsync(coupleId, item, ct),
                TransactionEntityType => await ApplyTransactionChangeAsync(coupleId, item, ct),
                BudgetEntityType => await ApplyBudgetChangeAsync(coupleId, item, ct),
                SavingsGoalEntityType => await ApplySavingsGoalChangeAsync(coupleId, item, ct),
                LoanEntityType => await ApplyLoanChangeAsync(coupleId, item, ct),
                VaultItemEntityType => await ApplyVaultItemChangeAsync(coupleId, item, ct),
                _ => Rejected(item, $"Unknown entity type '{item.EntityType}'."),
            };
            results.Add(result);
        }

        await db.SaveChangesAsync(ct);
        return new SyncPushResponseDto { Results = results };
    }

    private async Task<SyncPushResultItemDto> ApplyCoupleProfileChangeAsync(Guid coupleId, SyncPushItemDto item, CancellationToken ct)
    {
        if (item.EntityId != coupleId)
        {
            return Rejected(item, "You may only sync your own couple's profile.");
        }

        if (item.Operation == SyncOperation.Delete)
        {
            return Rejected(item, "A couple profile cannot be deleted.");
        }

        var couple = await db.Couples.FirstOrDefaultAsync(c => c.Id == coupleId, ct);
        if (couple is null)
        {
            return Rejected(item, "Couple not found.");
        }

        // Last-valid-server-write-wins: a push older than what the server already has is
        // rejected (not merged) so the client can pull the newer value instead of clobbering it.
        if (item.ClientUpdatedAt < couple.UpdatedAt)
        {
            return StaleWrite(item, couple.Version, couple.UpdatedAt);
        }

        CoupleProfilePayloadDto? payload;
        try
        {
            payload = item.Payload.Deserialize<CoupleProfilePayloadDto>(JsonOptions);
        }
        catch (JsonException)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (payload is null)
        {
            return Rejected(item, "Invalid payload.");
        }

        // The manual Deserialize above bypasses ASP.NET Core's automatic DataAnnotations
        // validation (that only runs for controller-bound request DTOs) — every payload-level
        // rule here is re-checked explicitly in code, same as every other Apply*ChangeAsync.
        var percents = new[] { payload.BudgetAllocationPercent, payload.SavingsAllocationPercent, payload.WantsAllocationPercent };
        if (percents.Any(p => p is not null))
        {
            if (percents.Any(p => p is null))
            {
                return Rejected(item, "Budget, Savings, and Wants percentages must all be set together.");
            }
            if (percents.Any(p => p < 0 || p > 100))
            {
                return Rejected(item, "Percentages must be between 0 and 100.");
            }
            if (percents.Sum(p => p!.Value) != 100m)
            {
                return Rejected(item, "Your allocation must equal exactly 100%.");
            }
        }

        var allocationAccountIds = new[] { payload.BudgetAccountId, payload.SavingsAccountId }
            .Where(id => id is not null).Select(id => id!.Value).Distinct().ToList();
        if (allocationAccountIds.Count > 0)
        {
            var ownedCount = await db.Accounts.CountAsync(a => allocationAccountIds.Contains(a.Id) && a.CoupleId == coupleId, ct);
            if (ownedCount != allocationAccountIds.Count)
            {
                return Rejected(item, "Each allocation account must belong to your couple.");
            }
        }

        if (payload.MyMonthlyIncome is < 0)
        {
            return Rejected(item, "Income cannot be negative.");
        }

        var membership = await db.CoupleMembers.FirstOrDefaultAsync(m => m.CoupleId == coupleId && m.UserId == currentUser.UserId && m.LeftAt == null, ct);
        if (membership is not null)
        {
            membership.MonthlyIncome = payload.MyMonthlyIncome;
        }

        if (payload.MemberWantsAllocations is { Count: > 0 } memberWantsAllocations)
        {
            var memberUserIds = memberWantsAllocations.Select(a => a.UserId).ToList();
            if (memberUserIds.Distinct().Count() != memberUserIds.Count)
            {
                return Rejected(item, "Each member's Wants share can only appear once.");
            }

            var activeMembers = await db.CoupleMembers
                .Where(m => m.CoupleId == coupleId && memberUserIds.Contains(m.UserId) && m.LeftAt == null)
                .ToListAsync(ct);
            if (activeMembers.Count != memberUserIds.Count)
            {
                return Rejected(item, "Each member's Wants share must be for an active member of your couple.");
            }

            if (memberWantsAllocations.Any(a => a.WantsAllocationPercent is < 0 or > 100))
            {
                return Rejected(item, "Wants share percentages must be between 0 and 100.");
            }

            var wantsAccountIds = memberWantsAllocations.Where(a => a.WantsAccountId is not null).Select(a => a.WantsAccountId!.Value).Distinct().ToList();
            if (wantsAccountIds.Count > 0)
            {
                var ownedWantsAccountCount = await db.Accounts.CountAsync(a => wantsAccountIds.Contains(a.Id) && a.CoupleId == coupleId, ct);
                if (ownedWantsAccountCount != wantsAccountIds.Count)
                {
                    return Rejected(item, "Each member's Wants account must belong to your couple.");
                }
            }

            // Not cross-validated against each other or the couple's WantsAllocationPercent here
            // — see MemberWantsAllocations's own doc comment; that strict reconciliation is
            // Distribute Money's job (DistributionService), not a saved-defaults constraint.
            foreach (var allocation in memberWantsAllocations)
            {
                var member = activeMembers.First(m => m.UserId == allocation.UserId);
                member.WantsAllocationPercent = allocation.WantsAllocationPercent;
                member.WantsAccountId = allocation.WantsAccountId;
            }
        }

        couple.Nickname = payload.Nickname;
        couple.AnniversaryDate = payload.AnniversaryDate;
        couple.BudgetAllocationPercent = payload.BudgetAllocationPercent;
        couple.SavingsAllocationPercent = payload.SavingsAllocationPercent;
        couple.WantsAllocationPercent = payload.WantsAllocationPercent;
        couple.BudgetAccountId = payload.BudgetAccountId;
        couple.SavingsAccountId = payload.SavingsAccountId;
        couple.UpdatedAt = clock.UtcNow;
        couple.UpdatedByUserId = currentUser.UserId;
        couple.Version += 1;

        return Accepted(item, couple.Version, couple.UpdatedAt);
    }

    /// <summary>
    /// Unlike couple_profile (a singleton that always already exists by the time sync ever
    /// runs), a calendar event might be genuinely new to the server — this is where offline
    /// CREATE actually lands. Whether the server has seen this id before (not the client's
    /// stated Operation) is what decides create-vs-update, which makes a retried push of an
    /// already-applied CREATE naturally idempotent.
    /// </summary>
    private async Task<SyncPushResultItemDto> ApplyCalendarEventChangeAsync(Guid coupleId, SyncPushItemDto item, CancellationToken ct)
    {
        var existing = await db.CalendarEvents.FirstOrDefaultAsync(e => e.Id == item.EntityId, ct);

        if (existing is not null && existing.CoupleId != coupleId)
        {
            return Rejected(item, "You may only sync your own couple's events.");
        }

        if (item.Operation == SyncOperation.Delete)
        {
            if (existing is null)
            {
                // Already gone (or a retry of a delete that already landed) — deleting is
                // idempotent, so this counts as success rather than an error.
                return Accepted(item, serverVersion: null, serverUpdatedAt: null);
            }
            if (item.ClientUpdatedAt < existing.UpdatedAt)
            {
                return StaleWrite(item, existing.Version, existing.UpdatedAt);
            }

            existing.IsDeleted = true;
            existing.UpdatedAt = clock.UtcNow;
            existing.UpdatedByUserId = currentUser.UserId;
            existing.Version += 1;
            return Accepted(item, existing.Version, existing.UpdatedAt);
        }

        if (existing is not null && item.ClientUpdatedAt < existing.UpdatedAt)
        {
            return StaleWrite(item, existing.Version, existing.UpdatedAt);
        }

        CalendarEventPayloadDto? payload;
        try
        {
            payload = item.Payload.Deserialize<CalendarEventPayloadDto>(JsonOptions);
        }
        catch (JsonException)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (payload is null)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (string.IsNullOrWhiteSpace(payload.Title))
        {
            return Rejected(item, "Title is required.");
        }

        if (payload.EndAt < payload.StartAt)
        {
            return Rejected(item, "End time must be after start time.");
        }

        var now = clock.UtcNow;

        if (existing is null)
        {
            // First time the server has seen this id — trust the device-generated UUID as the
            // entity id (offline-first: ids are minted on-device, not assigned by the server).
            existing = new CalendarEvent
            {
                Id = item.EntityId,
                CoupleId = coupleId,
                CreatedByUserId = currentUser.UserId,
                CreatedAt = now,
                Version = 0, // bumped to 1 below, alongside the update-path's bump — one place sets it
            };
            db.CalendarEvents.Add(existing);
        }

        existing.Title = payload.Title;
        existing.Description = payload.Description;
        existing.StartAt = payload.StartAt;
        existing.EndAt = payload.EndAt;
        existing.AllDay = payload.AllDay;
        existing.Location = payload.Location;
        existing.ReminderAt = payload.ReminderAt;
        existing.UpdatedAt = now;
        existing.UpdatedByUserId = currentUser.UserId;
        existing.Version += 1;

        return Accepted(item, existing.Version, existing.UpdatedAt);
    }

    /// <summary>
    /// Accounts are never deleted through sync (see the Phase 3 spec: "Do not allow destructive
    /// deletion" — a partner's historical transactions may still reference this account). The
    /// only way to retire one is UPDATE with IsActive = false. OpeningBalance is accepted from
    /// the payload only on first CREATE; an UPDATE can never move it, since that would be a
    /// silent, unexplained balance mutation with no corresponding Transaction — see
    /// MoneyCalculator, which trusts OpeningBalance as a fixed starting point forever.
    /// </summary>
    private async Task<SyncPushResultItemDto> ApplyAccountChangeAsync(Guid coupleId, SyncPushItemDto item, CancellationToken ct)
    {
        if (item.Operation == SyncOperation.Delete)
        {
            return Rejected(item, "Accounts cannot be deleted — deactivate instead.");
        }

        var existing = await db.Accounts.FirstOrDefaultAsync(a => a.Id == item.EntityId, ct);

        if (existing is not null && existing.CoupleId != coupleId)
        {
            return Rejected(item, "You may only sync your own couple's accounts.");
        }

        if (existing is not null && item.ClientUpdatedAt < existing.UpdatedAt)
        {
            return StaleWrite(item, existing.Version, existing.UpdatedAt);
        }

        AccountPayloadDto? payload;
        try
        {
            payload = item.Payload.Deserialize<AccountPayloadDto>(JsonOptions);
        }
        catch (JsonException)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (payload is null)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (string.IsNullOrWhiteSpace(payload.Name))
        {
            return Rejected(item, "Name is required.");
        }

        if (!AccountType.IsValid(payload.Type))
        {
            return Rejected(item, "Invalid account type.");
        }

        if (!IsValidCurrencyCode(payload.Currency))
        {
            return Rejected(item, "Invalid currency code.");
        }

        if (Math.Abs(payload.OpeningBalance) > MaxMoneyAmount)
        {
            return Rejected(item, "Opening balance exceeds the maximum allowed.");
        }

        var now = clock.UtcNow;

        if (existing is null)
        {
            existing = new Account
            {
                Id = item.EntityId,
                CoupleId = coupleId,
                CreatedByUserId = currentUser.UserId,
                CreatedAt = now,
                OpeningBalance = payload.OpeningBalance, // set once, at creation, only
                Version = 0, // bumped to 1 below, alongside the update-path's bump — one place sets it
            };
            db.Accounts.Add(existing);
        }

        existing.Name = payload.Name;
        existing.Type = payload.Type;
        existing.Icon = payload.Icon;
        existing.Currency = payload.Currency;
        existing.IsActive = payload.IsActive;
        existing.UpdatedAt = now;
        existing.UpdatedByUserId = currentUser.UserId;
        existing.Version += 1;

        return Accepted(item, existing.Version, existing.UpdatedAt);
    }

    /// <summary>Same create-vs-update-by-existence + soft-delete shape as <see cref="ApplyCalendarEventChangeAsync"/>. Every financial-consistency rule (§45-47 of the spec) lives here as validation — the balance itself is never stored/mutated directly (see MoneyCalculator).</summary>
    private async Task<SyncPushResultItemDto> ApplyTransactionChangeAsync(Guid coupleId, SyncPushItemDto item, CancellationToken ct)
    {
        var existing = await db.Transactions.FirstOrDefaultAsync(t => t.Id == item.EntityId, ct);

        if (existing is not null && existing.CoupleId != coupleId)
        {
            return Rejected(item, "You may only sync your own couple's transactions.");
        }

        if (item.Operation == SyncOperation.Delete)
        {
            if (existing is null)
            {
                return Accepted(item, serverVersion: null, serverUpdatedAt: null);
            }
            if (item.ClientUpdatedAt < existing.UpdatedAt)
            {
                return StaleWrite(item, existing.Version, existing.UpdatedAt);
            }

            existing.IsDeleted = true;
            existing.UpdatedAt = clock.UtcNow;
            existing.UpdatedByUserId = currentUser.UserId;
            existing.Version += 1;
            return Accepted(item, existing.Version, existing.UpdatedAt);
        }

        if (existing is not null && item.ClientUpdatedAt < existing.UpdatedAt)
        {
            return StaleWrite(item, existing.Version, existing.UpdatedAt);
        }

        TransactionPayloadDto? payload;
        try
        {
            payload = item.Payload.Deserialize<TransactionPayloadDto>(JsonOptions);
        }
        catch (JsonException)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (payload is null)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (!TransactionType.IsValid(payload.Type))
        {
            return Rejected(item, "Invalid transaction type.");
        }

        if (payload.Type == TransactionType.IncomeAllocation)
        {
            // System-generated only — see the type's own doc comment. A client can never create
            // or edit one directly; it exists solely as DistributionService's record of a
            // distribution bucket landing in its account.
            return Rejected(item, "This transaction type can only be created by distributing income.");
        }

        if (payload.Type == TransactionType.LoanPayment)
        {
            // System-generated only, same reasoning as IncomeAllocation above — it exists solely
            // as LoanService.PayAsync's record of a loan payment, which needs the dedicated
            // endpoint's synchronous balance/overpayment/idempotency checks that a generic sync
            // push can't provide.
            return Rejected(item, "This transaction type can only be created by paying a loan.");
        }

        if (payload.Amount <= 0)
        {
            return Rejected(item, "Amount must be greater than zero.");
        }

        if (payload.Amount > MaxMoneyAmount)
        {
            return Rejected(item, "Amount exceeds the maximum allowed.");
        }

        if (!IsValidCurrencyCode(payload.Currency))
        {
            return Rejected(item, "Invalid currency code.");
        }

        if (!TransactionCategory.IsValidForType(payload.Type, payload.Category))
        {
            return Rejected(item, payload.Type == TransactionType.Transfer
                ? "A transfer cannot have a category."
                : "Invalid category.");
        }

        var isSavingsMovement = payload.Type is TransactionType.SavingsContribution or TransactionType.SavingsWithdrawal;
        if (isSavingsMovement)
        {
            if (payload.SavingsGoalId is null)
            {
                return Rejected(item, "A savings contribution or withdrawal requires a savings goal.");
            }
            var goalExists = await db.SavingsGoals.AnyAsync(g => g.Id == payload.SavingsGoalId && g.CoupleId == coupleId, ct);
            if (!goalExists)
            {
                return Rejected(item, "Savings goal must belong to your couple.");
            }
        }
        else if (payload.SavingsGoalId is not null)
        {
            return Rejected(item, "Only a savings contribution or withdrawal may reference a savings goal.");
        }

        // LoanPayment itself is rejected above (system-generated only), so the only way this is
        // ever reached is a non-LoanPayment type — LoanId must always be null on that path. Kept
        // as its own explicit check (rather than relying solely on the rejection above) so this
        // stays correct even if that rejection is ever loosened.
        if (payload.LoanId is not null)
        {
            return Rejected(item, "Only a loan payment may reference a loan.");
        }

        var sourceAccount = await db.Accounts.FirstOrDefaultAsync(a => a.Id == payload.AccountId && a.CoupleId == coupleId, ct);
        if (sourceAccount is null)
        {
            return Rejected(item, "Account must belong to your couple.");
        }

        if (payload.Type == TransactionType.Expense)
        {
            // Server-side enforcement that a plain expense can never push an Ours account
            // negative — reuses the exact same MoneyCalculator.CalculateAccountBalance every
            // other balance figure in this app already derives from, never a second balance
            // system. Excludes the transaction being edited itself (when this push is an update
            // touching the same account) so re-saving an unchanged or lowered amount never
            // falsely rejects — the comparison is against what the balance would be *without*
            // this transaction's current effect.
            var otherTransactions = await db.Transactions
                .Where(t => t.CoupleId == coupleId && !t.IsDeleted && t.Id != item.EntityId
                    && (t.AccountId == sourceAccount.Id || t.DestinationAccountId == sourceAccount.Id))
                .ToListAsync(ct);
            var balanceBeforeThisExpense = MoneyCalculator.CalculateAccountBalance(sourceAccount.OpeningBalance, sourceAccount.Id, otherTransactions);
            if (payload.Amount > balanceBeforeThisExpense)
            {
                return Rejected(item, "Insufficient balance.");
            }
        }

        if (payload.Type == TransactionType.Transfer)
        {
            if (payload.DestinationAccountId is null)
            {
                return Rejected(item, "A transfer requires a destination account.");
            }
            if (payload.DestinationAccountId == payload.AccountId)
            {
                return Rejected(item, "Source and destination accounts must be different.");
            }
            var destinationAccount = await db.Accounts.FirstOrDefaultAsync(a => a.Id == payload.DestinationAccountId && a.CoupleId == coupleId, ct);
            if (destinationAccount is null)
            {
                return Rejected(item, "Destination account must belong to your couple.");
            }
            // MVP: no currency conversion — a transfer only makes sense between accounts sharing
            // one currency, and the transaction's own currency must agree with both.
            if (sourceAccount.Currency != destinationAccount.Currency || payload.Currency != sourceAccount.Currency)
            {
                return Rejected(item, "Transfer requires matching currencies.");
            }
        }
        else if (payload.DestinationAccountId is not null)
        {
            return Rejected(item, "Only a transfer may have a destination account.");
        }

        if (payload.PaidByUserId is Guid paidByUserId)
        {
            // Never trust the client's claim that a given user id is the couple's partner — a
            // fake or stale (e.g. an ex-partner's) id must be rejected, not silently stored.
            var isActiveMember = await db.CoupleMembers
                .AnyAsync(m => m.CoupleId == coupleId && m.UserId == paidByUserId && m.LeftAt == null, ct);
            if (!isActiveMember)
            {
                return Rejected(item, "paidByUserId must be an active member of your couple.");
            }
        }

        var now = clock.UtcNow;

        if (existing is null)
        {
            // First time the server has seen this id — trust the device-generated UUID, same as
            // calendar events (offline-first: ids are minted on-device, not assigned server-side).
            existing = new Transaction
            {
                Id = item.EntityId,
                CoupleId = coupleId,
                CreatedByUserId = currentUser.UserId,
                CreatedAt = now,
                Version = 0, // bumped to 1 below, alongside the update-path's bump — one place sets it
            };
            db.Transactions.Add(existing);
        }

        existing.Type = payload.Type;
        existing.Amount = payload.Amount;
        existing.Currency = payload.Currency;
        existing.AccountId = payload.AccountId;
        existing.DestinationAccountId = payload.DestinationAccountId;
        existing.Category = payload.Category;
        existing.SavingsGoalId = payload.SavingsGoalId;
        existing.LoanId = payload.LoanId;
        existing.Description = payload.Description;
        existing.TransactionDate = payload.TransactionDate;
        existing.Notes = payload.Notes;
        existing.PaidByUserId = payload.PaidByUserId;
        existing.UpdatedAt = now;
        existing.UpdatedByUserId = currentUser.UserId;
        existing.Version += 1;

        return Accepted(item, existing.Version, existing.UpdatedAt);
    }

    /// <summary>Same create-vs-update-by-existence + soft-delete shape as calendar events/transactions, plus the "at most one active budget per couple+year+month+category" rule (also enforced by a filtered unique index — see BudgetConfiguration — as a defense-in-depth backstop).</summary>
    private async Task<SyncPushResultItemDto> ApplyBudgetChangeAsync(Guid coupleId, SyncPushItemDto item, CancellationToken ct)
    {
        var existing = await db.Budgets.FirstOrDefaultAsync(b => b.Id == item.EntityId, ct);

        if (existing is not null && existing.CoupleId != coupleId)
        {
            return Rejected(item, "You may only sync your own couple's budgets.");
        }

        if (item.Operation == SyncOperation.Delete)
        {
            if (existing is null)
            {
                return Accepted(item, serverVersion: null, serverUpdatedAt: null);
            }
            if (item.ClientUpdatedAt < existing.UpdatedAt)
            {
                return StaleWrite(item, existing.Version, existing.UpdatedAt);
            }

            existing.IsDeleted = true;
            existing.UpdatedAt = clock.UtcNow;
            existing.UpdatedByUserId = currentUser.UserId;
            existing.Version += 1;
            return Accepted(item, existing.Version, existing.UpdatedAt);
        }

        if (existing is not null && item.ClientUpdatedAt < existing.UpdatedAt)
        {
            return StaleWrite(item, existing.Version, existing.UpdatedAt);
        }

        BudgetPayloadDto? payload;
        try
        {
            payload = item.Payload.Deserialize<BudgetPayloadDto>(JsonOptions);
        }
        catch (JsonException)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (payload is null)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (!TransactionCategory.IsValidExpenseCategory(payload.Category))
        {
            return Rejected(item, "Invalid category.");
        }

        if (payload.Month is < 1 or > 12)
        {
            return Rejected(item, "Month must be between 1 and 12.");
        }

        if (payload.Year is < 2000 or > 2100)
        {
            return Rejected(item, "Invalid year.");
        }

        if (payload.Amount <= 0)
        {
            return Rejected(item, "Amount must be greater than zero.");
        }

        if (payload.Amount > MaxMoneyAmount)
        {
            return Rejected(item, "Amount exceeds the maximum allowed.");
        }

        if (!IsValidCurrencyCode(payload.Currency))
        {
            return Rejected(item, "Invalid currency code.");
        }

        var duplicateExists = await db.Budgets.AnyAsync(
            b => b.CoupleId == coupleId && b.Year == payload.Year && b.Month == payload.Month
                 && b.Category == payload.Category && !b.IsDeleted && b.Id != item.EntityId, ct);
        if (duplicateExists)
        {
            return Rejected(item, "A budget for this category and month already exists.");
        }

        var now = clock.UtcNow;

        if (existing is null)
        {
            existing = new Budget
            {
                Id = item.EntityId,
                CoupleId = coupleId,
                CreatedByUserId = currentUser.UserId,
                CreatedAt = now,
                Version = 0, // bumped to 1 below, alongside the update-path's bump — one place sets it
            };
            db.Budgets.Add(existing);
        }

        existing.Category = payload.Category;
        existing.Year = payload.Year;
        existing.Month = payload.Month;
        existing.Amount = payload.Amount;
        existing.Currency = payload.Currency;
        existing.UpdatedAt = now;
        existing.UpdatedByUserId = currentUser.UserId;
        existing.Version += 1;

        return Accepted(item, existing.Version, existing.UpdatedAt);
    }

    /// <summary>Same create-vs-update-by-existence + soft-delete shape as Budget — no uniqueness rule here (a couple can have any number of goals).</summary>
    private async Task<SyncPushResultItemDto> ApplySavingsGoalChangeAsync(Guid coupleId, SyncPushItemDto item, CancellationToken ct)
    {
        var existing = await db.SavingsGoals.FirstOrDefaultAsync(g => g.Id == item.EntityId, ct);

        if (existing is not null && existing.CoupleId != coupleId)
        {
            return Rejected(item, "You may only sync your own couple's savings goals.");
        }

        if (item.Operation == SyncOperation.Delete)
        {
            if (existing is null)
            {
                return Accepted(item, serverVersion: null, serverUpdatedAt: null);
            }
            if (item.ClientUpdatedAt < existing.UpdatedAt)
            {
                return StaleWrite(item, existing.Version, existing.UpdatedAt);
            }

            existing.IsDeleted = true;
            existing.UpdatedAt = clock.UtcNow;
            existing.UpdatedByUserId = currentUser.UserId;
            existing.Version += 1;
            return Accepted(item, existing.Version, existing.UpdatedAt);
        }

        if (existing is not null && item.ClientUpdatedAt < existing.UpdatedAt)
        {
            return StaleWrite(item, existing.Version, existing.UpdatedAt);
        }

        SavingsGoalPayloadDto? payload;
        try
        {
            payload = item.Payload.Deserialize<SavingsGoalPayloadDto>(JsonOptions);
        }
        catch (JsonException)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (payload is null)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (string.IsNullOrWhiteSpace(payload.Name))
        {
            return Rejected(item, "Enter a name for this goal.");
        }

        if (payload.TargetAmount <= 0)
        {
            return Rejected(item, "Target amount must be greater than zero.");
        }

        if (payload.TargetAmount > MaxMoneyAmount)
        {
            return Rejected(item, "Target amount exceeds the maximum allowed.");
        }

        if (!IsValidCurrencyCode(payload.Currency))
        {
            return Rejected(item, "Invalid currency code.");
        }

        if (payload.AllocationPercent is < 0 or > 100)
        {
            return Rejected(item, "Allocation percent must be between 0 and 100.");
        }

        var now = clock.UtcNow;

        if (existing is null)
        {
            existing = new SavingsGoal
            {
                Id = item.EntityId,
                CoupleId = coupleId,
                CreatedByUserId = currentUser.UserId,
                CreatedAt = now,
                Version = 0, // bumped to 1 below, alongside the update-path's bump — one place sets it
            };
            db.SavingsGoals.Add(existing);
        }

        existing.Name = payload.Name;
        existing.TargetAmount = payload.TargetAmount;
        existing.Currency = payload.Currency;
        existing.AllocationPercent = payload.AllocationPercent;
        existing.IsActive = payload.IsActive;
        existing.UpdatedAt = now;
        existing.UpdatedByUserId = currentUser.UserId;
        existing.Version += 1;

        return Accepted(item, existing.Version, existing.UpdatedAt);
    }

    /// <summary>Same create-vs-update-by-existence + soft-delete shape as SavingsGoal — a loan's own record is a plain synced entity; only *paying* one needs the dedicated LoanController/LoanService (see Loan's doc comment).</summary>
    private async Task<SyncPushResultItemDto> ApplyLoanChangeAsync(Guid coupleId, SyncPushItemDto item, CancellationToken ct)
    {
        var existing = await db.Loans.FirstOrDefaultAsync(l => l.Id == item.EntityId, ct);

        if (existing is not null && existing.CoupleId != coupleId)
        {
            return Rejected(item, "You may only sync your own couple's loans.");
        }

        if (item.Operation == SyncOperation.Delete)
        {
            if (existing is null)
            {
                return Accepted(item, serverVersion: null, serverUpdatedAt: null);
            }
            if (item.ClientUpdatedAt < existing.UpdatedAt)
            {
                return StaleWrite(item, existing.Version, existing.UpdatedAt);
            }

            // Soft-delete only — a loan's LoanPayment transactions (payment history) are never
            // touched by this, so history survives regardless (see Loan's doc comment).
            existing.IsDeleted = true;
            existing.UpdatedAt = clock.UtcNow;
            existing.UpdatedByUserId = currentUser.UserId;
            existing.Version += 1;
            return Accepted(item, existing.Version, existing.UpdatedAt);
        }

        if (existing is not null && item.ClientUpdatedAt < existing.UpdatedAt)
        {
            return StaleWrite(item, existing.Version, existing.UpdatedAt);
        }

        LoanPayloadDto? payload;
        try
        {
            payload = item.Payload.Deserialize<LoanPayloadDto>(JsonOptions);
        }
        catch (JsonException)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (payload is null)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (string.IsNullOrWhiteSpace(payload.Name))
        {
            return Rejected(item, "Enter a name for this loan.");
        }

        if (payload.OriginalAmount <= 0 || payload.OriginalAmount > MaxMoneyAmount)
        {
            return Rejected(item, "Original amount must be greater than zero and within the maximum allowed.");
        }

        if (payload.MonthlyPayment <= 0 || payload.MonthlyPayment > MaxMoneyAmount)
        {
            return Rejected(item, "Monthly payment must be greater than zero and within the maximum allowed.");
        }

        if (payload.TotalInstallments <= 0)
        {
            return Rejected(item, "Total installments must be at least 1.");
        }

        if (payload.FirstDueDate.Year is < 2000 or > 2100)
        {
            return Rejected(item, "Invalid first due date.");
        }

        if (!LoanFrequency.IsValid(payload.Frequency))
        {
            return Rejected(item, "Invalid repayment frequency.");
        }

        if (payload.FeesAmount is < 0 || payload.FeesAmount > MaxMoneyAmount)
        {
            return Rejected(item, "Fees amount must be zero or more, within the maximum allowed.");
        }

        if (!IsValidCurrencyCode(payload.Currency))
        {
            return Rejected(item, "Invalid currency code.");
        }

        var paymentAccountExists = await db.Accounts.AnyAsync(a => a.Id == payload.PaymentAccountId && a.CoupleId == coupleId, ct);
        if (!paymentAccountExists)
        {
            return Rejected(item, "Payment account must belong to your couple.");
        }

        if (payload.OwnerUserId is Guid ownerUserId)
        {
            // Never trust the client's claim that a given user id is a member of this couple —
            // same discipline already applied to Transaction.PaidByUserId.
            var isActiveMember = await db.CoupleMembers
                .AnyAsync(m => m.CoupleId == coupleId && m.UserId == ownerUserId && m.LeftAt == null, ct);
            if (!isActiveMember)
            {
                return Rejected(item, "ownerUserId must be an active member of your couple.");
            }
        }

        var now = clock.UtcNow;

        if (existing is null)
        {
            existing = new Loan
            {
                Id = item.EntityId,
                CoupleId = coupleId,
                CreatedByUserId = currentUser.UserId,
                CreatedAt = now,
                Version = 0, // bumped to 1 below, alongside the update-path's bump — one place sets it
            };
            db.Loans.Add(existing);
        }

        existing.Name = payload.Name;
        existing.Provider = payload.Provider;
        existing.OriginalAmount = payload.OriginalAmount;
        existing.MonthlyPayment = payload.MonthlyPayment;
        existing.TotalInstallments = payload.TotalInstallments;
        existing.FirstDueDate = payload.FirstDueDate;
        existing.Frequency = payload.Frequency;
        existing.FeesAmount = payload.FeesAmount;
        existing.Currency = payload.Currency;
        existing.PaymentAccountId = payload.PaymentAccountId;
        existing.OwnerUserId = payload.OwnerUserId;
        existing.UpdatedAt = now;
        existing.UpdatedByUserId = currentUser.UserId;
        existing.Version += 1;

        return Accepted(item, existing.Version, existing.UpdatedAt);
    }

    /// <summary>
    /// Same create-vs-update-by-existence + soft-delete shape as every other entity here. The one
    /// thing genuinely unique to Vault: <paramref name="item"/>'s payload carries a *plaintext*
    /// password (see VaultItemPayloadDto) only when the user is setting/changing it — this method
    /// is the only place that plaintext exists, for exactly as long as it takes to pass it to
    /// <see cref="Ours.Application.Abstractions.IVaultEncryptionService.Encrypt"/>. It is never
    /// logged, never included in a Rejected(...) message, and never persisted or returned as-is.
    /// </summary>
    private async Task<SyncPushResultItemDto> ApplyVaultItemChangeAsync(Guid coupleId, SyncPushItemDto item, CancellationToken ct)
    {
        var existing = await db.VaultItems.FirstOrDefaultAsync(v => v.Id == item.EntityId, ct);

        if (existing is not null && existing.CoupleId != coupleId)
        {
            return Rejected(item, "You may only sync your own couple's vault items.");
        }

        if (item.Operation == SyncOperation.Delete)
        {
            if (existing is null)
            {
                // Already gone (or a retry of a delete that already landed) — idempotent success.
                return Accepted(item, serverVersion: null, serverUpdatedAt: null);
            }
            if (item.ClientUpdatedAt < existing.UpdatedAt)
            {
                return StaleWrite(item, existing.Version, existing.UpdatedAt);
            }

            existing.IsDeleted = true;
            existing.UpdatedAt = clock.UtcNow;
            existing.UpdatedByUserId = currentUser.UserId;
            existing.Version += 1;
            return Accepted(item, existing.Version, existing.UpdatedAt);
        }

        if (existing is not null && item.ClientUpdatedAt < existing.UpdatedAt)
        {
            return StaleWrite(item, existing.Version, existing.UpdatedAt);
        }

        VaultItemPayloadDto? payload;
        try
        {
            payload = item.Payload.Deserialize<VaultItemPayloadDto>(JsonOptions);
        }
        catch (JsonException)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (payload is null)
        {
            return Rejected(item, "Invalid payload.");
        }

        if (string.IsNullOrWhiteSpace(payload.Title))
        {
            return Rejected(item, "Title is required.");
        }

        if (!VaultCategory.IsValid(payload.Category))
        {
            return Rejected(item, "Invalid category.");
        }

        if (payload.Password is { Length: > MaxPasswordLength })
        {
            return Rejected(item, "Password is too long.");
        }

        var isNewItem = existing is null;
        if (isNewItem && string.IsNullOrEmpty(payload.Password))
        {
            return Rejected(item, "Password is required.");
        }

        var now = clock.UtcNow;

        if (existing is null)
        {
            // First time the server has seen this id — trust the device-generated UUID, same as
            // every other entity (offline-first: ids are minted on-device, not assigned server-side).
            existing = new VaultItem
            {
                Id = item.EntityId,
                CoupleId = coupleId,
                CreatedByUserId = currentUser.UserId,
                CreatedAt = now,
                Version = 0, // bumped to 1 below, alongside the update-path's bump — one place sets it
            };
            db.VaultItems.Add(existing);
        }

        existing.Title = payload.Title;
        existing.Username = payload.Username;
        existing.WebsiteUrl = payload.WebsiteUrl;
        existing.Category = payload.Category;
        existing.Notes = payload.Notes;

        if (!string.IsNullOrEmpty(payload.Password))
        {
            var encrypted = vaultEncryption.Encrypt(payload.Password);
            existing.EncryptedPassword = encrypted.Ciphertext;
            existing.Nonce = encrypted.Nonce;
            existing.AuthTag = encrypted.Tag;
            existing.KeyVersion = encrypted.KeyVersion;
        }
        // else: the password wasn't changed — the existing encrypted fields are left completely
        // untouched, exactly as required ("if the password is not changed, do not unnecessarily
        // decrypt and re-encrypt it").

        existing.UpdatedAt = now;
        existing.UpdatedByUserId = currentUser.UserId;
        existing.Version += 1;

        return Accepted(item, existing.Version, existing.UpdatedAt);
    }

    private static bool IsValidCurrencyCode(string? currency) =>
        currency is not null && currency.Length == 3 && currency.All(c => c is >= 'A' and <= 'Z');

    private static SyncPushResultItemDto Accepted(SyncPushItemDto item, int? serverVersion, DateTimeOffset? serverUpdatedAt) => new()
    {
        EntityId = item.EntityId,
        EntityType = item.EntityType,
        Accepted = true,
        ServerVersion = serverVersion,
        ServerUpdatedAt = serverUpdatedAt,
    };

    private static SyncPushResultItemDto StaleWrite(SyncPushItemDto item, int serverVersion, DateTimeOffset serverUpdatedAt) => new()
    {
        EntityId = item.EntityId,
        EntityType = item.EntityType,
        Accepted = false,
        Error = "stale_write",
        ServerVersion = serverVersion,
        ServerUpdatedAt = serverUpdatedAt,
    };

    private static SyncPushResultItemDto Rejected(SyncPushItemDto item, string error) => new()
    {
        EntityId = item.EntityId,
        EntityType = item.EntityType,
        Accepted = false,
        Error = error,
    };
}
