# Ours — Backend

ASP.NET Core 10 Web API, clean architecture, PostgreSQL via EF Core 10, ASP.NET Core Identity + JWT.

```text
Ours.Domain          entities, enums, domain rules
Ours.Application     use-case services, DTOs, interfaces, validation
Ours.Infrastructure   EF Core, Identity, JWT, Postgres, DI wiring
Ours.Api             controllers, auth config, middleware, Program.cs
Ours.Application.Tests / Ours.Api.Tests    xUnit test projects
```

## Prerequisites

- .NET 10 SDK
- PostgreSQL (local install, no Docker required)

Install Postgres on macOS if you don't have it:

```bash
brew install postgresql@16
brew services start postgresql@16
createdb ours_dev
```

## First-time setup

```bash
cd backend
dotnet restore

# Local secrets (never committed — see .env.example for what a production deployment needs instead)
dotnet user-secrets set "Jwt:Secret" "$(openssl rand -base64 48)" --project Ours.Api
dotnet user-secrets set "ConnectionStrings:Default" "Host=localhost;Port=5432;Database=ours_dev;Username=$(whoami);Password=" --project Ours.Api
dotnet user-secrets set "Vault:CurrentKeyVersion" "1" --project Ours.Api
dotnet user-secrets set "Vault:Keys:1" "$(openssl rand -base64 32)" --project Ours.Api

# Install the EF Core CLI once, if you don't already have it
dotnet tool install --global dotnet-ef

dotnet ef database update --project Ours.Infrastructure --startup-project Ours.Api
```

## Run

```bash
dotnet run --project Ours.Api --launch-profile http
```

Listens on `http://0.0.0.0:5100` (bound to all interfaces so the Expo app — simulator, emulator, or
a physical device on the same Wi-Fi — can reach it; see `mobile/.env.example` for the URL each
target needs). Swagger/OpenAPI JSON is at `/openapi/v1.json` in Development.

## Build & test

```bash
dotnet build
dotnet test
```

## Adding a new migration (Phase 2+)

```bash
dotnet ef migrations add <Name> --project Ours.Infrastructure --startup-project Ours.Api -o Persistence/Migrations
dotnet ef database update --project Ours.Infrastructure --startup-project Ours.Api
```

## Architecture notes

- **Sync**: `SyncService` (Application/Services) is the one place that knows about synced entity
  types: `"couple_profile"` (Phase 1, a stand-in that exists purely to exercise the offline round
  trip), `"calendar_event"` (Phase 2), and the Money System's `"account"`, `"money_transaction"`,
  and `"budget"` (Phase 3). Adding a new synced feature means adding a case to `PullAsync` and
  `PushAsync`, not a new controller or a parallel sync mechanism. `CalendarEvent` was the first
  entity where the server itself creates a row (rather than only ever updating one that already
  exists) — see `ApplyCalendarEventChangeAsync` for how create-vs-update is decided by whether the
  id already exists server-side, not by trusting the client's stated operation, which makes a
  retried push naturally idempotent; every Money entity follows the same shape.
  `CalendarEvent.AllDay`/`Location` were added later, additively (their own migration) — a plain
  boolean and nullable string on the entity/payload, no special-cased sync handling; the client
  is what treats an all-day event's Start/EndAt (still real UTC instants) as spanning a whole day.
- **Money System** (`Account`, `Transaction`, `Budget` — replaces the Phase 3A Expense-only
  design entirely, not alongside it): every amount is `decimal`/Postgres `numeric(18,2)`, never
  `float`/`double`, so it round-trips exactly through JSON (System.Text.Json's decimal converter
  parses/serializes the digits directly, no floating-point step at all).
  - `Account` has **no stored current-balance column at all** — see `MoneyCalculator`
    (Application/Services), the one place balance/spending arithmetic happens, on both this end
    and the mobile equivalent (`utils/moneyCalculations.ts`). Balance is always `OpeningBalance`
    plus every non-deleted `Transaction` touching the account, recomputed fresh every time —
    which is also why an edited or deleted transaction needs no explicit "reverse the old effect"
    step anywhere; recomputing from current data is automatically correct.
    `OpeningBalance` is accepted from the payload only on first CREATE; an UPDATE can never move
    it (only Name/Type/Icon/Currency/IsActive are editable) — the only way an account's balance
    can change afterward is by recording a `Transaction`. `Account` also rejects the DELETE
    operation outright — deactivate (`IsActive = false`) instead, since a partner's historical
    transactions may still reference it.
  - `Transaction.Type` is `Expense`, `Income`, or `Transfer` — a Transfer is not an Expense with a
    special category; it moves money between the couple's own two accounts and is validated to
    never count as spending (`MoneyCalculator.CalculateMonthlySpending`/`CategorySpending` only
    ever look at `Expense` rows). `Amount` is always stored positive; direction is implied by
    `Type` plus which of `AccountId`/`DestinationAccountId` it touches. `TransactionCategory`
    validates separate Expense/Income vocabularies (a Transfer must have none at all), and a
    transfer's source/destination must both belong to the caller's couple and share one currency
    (no conversion in this MVP).
  - `Budget` is a monthly per-category spending plan, informational only — nothing stops a couple
    from spending past it. A filtered unique index (`IsDeleted = false`, mirroring
    `CoupleMember.LeftAt`'s pattern) plus an application-level pre-check enforce at most one
    active budget per couple+year+month+category; a deleted budget's slot is immediately reusable.
  - `Currency` (on `Account`, `Transaction`, and `Budget`) is only shape-checked (3 uppercase
    letters), not restricted to a fixed list, so adding a second real currency later needs no
    data-model change. `TransactionDate` is `DateOnly` (no time-of-day/timezone component),
    deliberately separate from `CreatedAt` so a user can log a transaction after the fact.
  - `PaidByUserId` (on `Transaction`, optional) is validated against `CoupleMembers` (must be an
    active — `LeftAt IS NULL` — member of the caller's own couple) rather than trusted as-is —
    same rule the Phase 3A `Expense.PaidByUserId` used before it.
- **Vault** (`VaultItem`): shared per-couple password entries. Create/update/delete go through
  the same generic sync push/pull as everything else (`"vault_item"` in `SyncService`) — the one
  addition is a single dedicated endpoint, `POST /api/vault/{id}/reveal`, because a sync payload
  can never carry a decrypted password downstream to a partner's device; that's the one thing
  that genuinely can't be modeled as a sync operation.
  - **Encryption**: `IVaultEncryptionService` (Application/Abstractions) is the only abstraction
    SyncService/VaultService know about; `VaultEncryptionService` (Infrastructure/Services) is
    AES-256-GCM — a modern authenticated cipher, not a custom scheme — via a single server-held
    key (`Vault:Keys`, base64, exactly 32 bytes, configured the same way as `Jwt:Secret`: user-secrets
    locally, an environment variable in production; Program.cs fails fast at startup if it's
    missing or the wrong size). A fresh random 96-bit nonce every encryption is what makes two
    encryptions of the same password produce different ciphertext; the 128-bit GCM tag is what
    makes a tampered ciphertext fail to decrypt outright rather than silently returning garbage.
    `KeyVersion` is stored per row so the key can be rotated later (add a new entry to `Vault:Keys`,
    bump `Vault:CurrentKeyVersion`) without needing to re-encrypt already-stored rows.
  - **The vault password never leaves the server as plaintext except via `POST /api/vault/{id}/reveal`**,
    an authenticated, couple-scoped, single-item action — never returned by the sync pull payload
    (`VaultItemPayloadDto.Password` is push-only: the *new* plaintext value when the user is
    setting/changing it, sent once over HTTPS and immediately encrypted in
    `SyncService.ApplyVaultItemChangeAsync`; a pull instead carries `EncryptedPassword`/`Nonce`/
    `AuthTag`/`KeyVersion` — the same ciphertext both partners' devices end up storing locally,
    since only the server ever holds the key). Editing an item without changing its password
    omits `Password` from the payload entirely, so the existing encrypted value is left completely
    untouched — no unnecessary decrypt/re-encrypt round trip.
  - Nothing in this path is ever logged: `ApplyVaultItemChangeAsync`/`VaultService.RevealAsync`
    never interpolate a password into an exception message (every `Rejected(...)` here is a
    static string, same convention as every other entity), so even `ExceptionHandlingMiddleware`'s
    `logger.LogWarning(ex, ...)` — which does log `ex.Message` — can never end up logging one.
- **Auth**: JWT access tokens (15 min) + rotating opaque refresh tokens (30 days, hashed at rest
  in `RefreshTokens`). A refresh token is revoked the moment it's redeemed; reusing an already-
  redeemed token is rejected.
- **Password reset**: `/api/auth/forgot-password` never reveals whether an email exists — same
  response either way, and `AuthService.ForgotPasswordAsync` just does nothing when it doesn't.
  Reset tokens are ASP.NET Core Identity's built-in "Default" token provider
  (`DataProtectorTokenProvider`, 1-hour `TokenLifespan`, configured in DependencyInjection.cs) —
  never persisted anywhere, validated by decrypting/verifying rather than a DB lookup, and
  invalidated on use because a successful reset rotates the user's security stamp. A successful
  reset also revokes every existing `RefreshToken` for that user (same table, same `RevokedAt`
  mechanism logout uses — no parallel session system). `IEmailService` (Infrastructure/Email)
  keeps SMTP/provider code out of AuthService entirely; `Email:Provider=development` (the
  default) just logs the reset link instead of sending anything, so local dev needs zero email
  credentials — `Email:Provider=smtp` sends real mail via MailKit.
- **Couple**: `Couple` + `CoupleMember` (join table, unique index on `UserId` — a user belongs to
  at most one *active* couple). Creating/joining are the one part of the app that requires the
  server (an invite code has to come from somewhere) — everything else is designed to work
  offline-first on the mobile side.
- **Leaving a couple** (`POST /api/couples/leave`, `CoupleService.LeaveAsync`): ends the couple
  for both members, not just whoever called it — no coupleId/partnerId is ever accepted from the
  client, only the caller's own `ApplicationUser.CoupleId` (loaded fresh from the DB). Reuses
  existing mechanics rather than adding new ones: `Couple.IsDeleted = true` (the same sync
  tombstone flag couple_profile edits already use) is what tells the partner's device the couple
  is gone on their next pull, and `CoupleMember.LeftAt` (nullable) marks a membership as ended
  while keeping the row for history — the DB-level unique index on `CoupleMember.UserId` is
  filtered to `LeftAt IS NULL` so a past membership never blocks pairing again. `SyncService.PushAsync`
  additionally verifies the caller's couple is still active before accepting *any* mutation, since
  a token issued before the couple ended still carries the old coupleId claim until it naturally
  expires — this closes that window without needing to force-revoke the other partner's session.
- **Authorization**: every couple-scoped read/write derives `coupleId` from the JWT claim (set by
  the server after create/join), never from a client-supplied field.
- **Errors**: Application services throw typed exceptions (`Ours.Application.Common`) that
  `ExceptionHandlingMiddleware` maps to HTTP status codes, so controllers stay free of that logic.

## Known limitations

- CORS is wide open (`AllowAnyOrigin`) — fine for a mobile-only client, revisit before any
  browser-based client exists.
- No rate limiting on `/api/auth/*` yet — includes forgot-password, which could otherwise be
  used to spam an inbox.
- SignalR isn't wired up yet (Phase 6).
- No server-side reminder scheduling — `CalendarEvent.ReminderAt` is stored but nothing acts on
  it yet; actual notification delivery is Phase 6.
- A short-lived (≤15 min) access token issued just before a password reset stays cryptographically
  valid until it naturally expires — only the *refresh* token is revoked immediately. Instant
  revocation of already-issued JWTs would need a server-side check on every request (a token
  blocklist), which is exactly the kind of second session mechanism this phase was told not to add.
