# Ours

*A little space for us.*

A private, offline-first app for exactly two people in a relationship.

```text
backend/    ASP.NET Core 10 API + PostgreSQL — see backend/README.md
mobile/     Expo (React Native + TypeScript) app — see mobile/README.md
```

## Architecture

```text
User Action → React Native UI → Repository → SQLite → UI updates immediately
                                                  ↓
                                             Sync Queue → API (when online) → PostgreSQL
```

SQLite is the mobile app's source of truth; the API/PostgreSQL side is what lets a couple's two
devices reach each other, not something the UI depends on for normal local reads/writes. See
`mobile/README.md`'s "Offline-first architecture" section for how the sync engine works, and
`backend/README.md`'s "Architecture notes" for the matching server-side half.

## Quick start

```bash
# 1. Backend
cd backend
dotnet user-secrets set "Jwt:Secret" "$(openssl rand -base64 48)" --project Ours.Api
dotnet user-secrets set "ConnectionStrings:Default" "Host=localhost;Port=5432;Database=ours_dev;Username=$(whoami);Password=" --project Ours.Api
dotnet ef database update --project Ours.Infrastructure --startup-project Ours.Api
dotnet run --project Ours.Api --launch-profile http

# 2. Mobile (separate terminal)
cd mobile
npm install
cp .env.example .env   # point EXPO_PUBLIC_API_URL at the backend — see comments in that file
npx expo start
```

Full setup (Postgres install, test commands, troubleshooting) is in each project's own README.

## Status

**Phase 1 — Foundation** is complete: registration, login, JWT + refresh tokens, couple
create/join (max 2 members, unique invite codes), the SQLite schema + migration system, the
generic sync queue/engine, and offline persistence across app restarts. See the phase completion
report for what was built, tested, and verified.

Calendar, Expenses, Photos, Love Notes, Goals, and the other features in the product brief are
**not yet implemented** — they land in later phases, reusing this same architecture (SQLite
schema → repository → UI → sync queue → API → PostgreSQL) rather than a new one each time.
