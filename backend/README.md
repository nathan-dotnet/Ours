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
  types. It currently has a single handler, `"couple_profile"` — a Phase-1 stand-in that exists
  purely to exercise the offline round trip (push/pull/last-write-wins) without pulling any
  Phase 2+ feature forward. Adding a new synced feature means adding a case to `PullAsync` and
  `PushAsync`, not a new controller or a parallel sync mechanism.
- **Auth**: JWT access tokens (15 min) + rotating opaque refresh tokens (30 days, hashed at rest
  in `RefreshTokens`). A refresh token is revoked the moment it's redeemed; reusing an already-
  redeemed token is rejected.
- **Couple**: `Couple` + `CoupleMember` (join table, unique index on `UserId` — a user belongs to
  at most one couple). Creating/joining are the one part of the app that requires the server (an
  invite code has to come from somewhere) — everything else is designed to work offline-first on
  the mobile side.
- **Authorization**: every couple-scoped read/write derives `coupleId` from the JWT claim (set by
  the server after create/join), never from a client-supplied field.
- **Errors**: Application services throw typed exceptions (`Ours.Application.Common`) that
  `ExceptionHandlingMiddleware` maps to HTTP status codes, so controllers stay free of that logic.

## Known limitations (Phase 1)

- CORS is wide open (`AllowAnyOrigin`) — fine for a mobile-only client, revisit before any
  browser-based client exists.
- No rate limiting on `/api/auth/*` yet.
- SignalR isn't wired up yet (Phase 6).
