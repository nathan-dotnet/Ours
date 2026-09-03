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
  trip), `"calendar_event"` (Phase 2), and `"expense"` (Phase 3A). Adding a new synced feature
  means adding a case to `PullAsync` and `PushAsync`, not a new controller or a parallel sync
  mechanism. `CalendarEvent` is also the first entity where the server itself creates a row
  (rather than only ever updating one that already exists) — see `ApplyCalendarEventChangeAsync`
  for how create-vs-update is decided by whether the id already exists server-side, not by
  trusting the client's stated operation, which makes retried pushes naturally idempotent.
  `CalendarEvent.AllDay`/`Location` were added later, additively (their own migration) — a plain
  boolean and nullable string on the entity/payload, no special-cased sync handling; the client
  is what treats an all-day event's Start/EndAt (still real UTC instants) as spanning a whole day.
- **Money (`Expense`)**: `Amount` is `decimal`/Postgres `numeric(18,2)` — never `float`/`double` —
  so it round-trips exactly through JSON (System.Text.Json's decimal converter parses/serializes
  the digits directly, no floating-point step at all). `Category` is a small controlled set
  (`ExpenseCategory`, string constants — same pattern as `SyncOperation`) validated server-side;
  `Currency` is only shape-checked (3 uppercase letters), not restricted to a fixed list, so
  adding a second currency later needs no data-model change. `ExpenseDate` is `DateOnly` (no
  time-of-day/timezone component), deliberately separate from `CreatedAt` so a user can log an
  expense after the fact. The optional `PaidByUserId` is validated against `CoupleMembers` (must
  be an active — `LeftAt IS NULL` — member of the caller's own couple) rather than trusted as-is.
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
