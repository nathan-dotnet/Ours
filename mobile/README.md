# Ours — Mobile

Expo (React Native + TypeScript) app, offline-first: SQLite is the source of truth for the UI,
a generic sync queue reconciles with the backend when a connection is available.

```text
app/                      Expo Router routes
  (auth)/                 login, register
  (onboarding)/           create-couple, join-couple (the one online-only flow)
  (tabs)/                 Home, Settings — the main app
src/
  database/                SQLite open + migrations (schema.ts, migrations.ts, db.ts)
  repositories/            read/write SQLite, enqueue sync ops (coupleRepository.ts)
  sync/                    sync_queue repository + push/pull engine, reused by every feature
  services/                API client (with auto token-refresh), connectivity (NetInfo)
  stores/                  Zustand: auth session, sync status
  hooks/                   React Query + action hooks tying the above together for screens
  components/, types/, validation/, utils/
```

## Prerequisites

- Node.js + npm
- Expo CLI (via `npx`, no global install needed)
- Xcode (iOS Simulator) and/or Android Studio (Android Emulator) — optional, only for running on
  a simulator/emulator instead of a physical device

## Setup

```bash
cd mobile
npm install
cp .env.example .env   # then edit EXPO_PUBLIC_API_URL — see comments in that file
npx expo start
```

The backend must be running first (see `../backend/README.md`) and reachable at the URL in `.env`:

- iOS Simulator: `http://localhost:5100` works as-is.
- Android Emulator: use `http://10.0.2.2:5100`.
- A physical device on the same Wi-Fi (Expo Go or a dev build): use your computer's LAN IP, e.g.
  `http://192.168.1.23:5100` (`ipconfig getifaddr en0` on macOS).

Then press `i` (iOS), `a` (Android), or scan the QR code with Expo Go.

## Build & test

```bash
npx tsc --noEmit    # or: npm run typecheck
npm test
```

## Offline-first architecture

Every write goes: **SQLite → UI updates from SQLite → sync_queue → API (when online)**. There is no
code path where a normal local interaction waits on a network response — the one exception is
creating/joining a couple, which needs the server to hand out/validate a globally-unique invite
code.

- `src/sync/syncQueue.ts` — generic CRUD for the `sync_queue` table. New local edits collapse
  into any not-yet-synced row for the same entity (see `mergeOperation`) instead of piling up
  duplicate/stale writes.
- `src/sync/syncEngine.ts` — one push-then-pull cycle: pushes everything queued in a single
  request, applies each per-item result (a `stale_write` rejection means the server already has
  something newer — the pull that follows reconciles it), then pulls remote changes since the
  last cursor and applies them to SQLite.
- `src/sync/index.ts` — wires the engine to connectivity changes, app-foreground, and a 30s
  fallback timer. `triggerSync()` is called after every local write so an online device flushes
  immediately rather than waiting for the next tick.
- Conflict strategy is last-valid-server-write-wins (per the project spec) — the server is always
  the tiebreaker; the client never merges concurrent edits itself.

**Adding a new synced feature (Phase 2+)**: add its table to `src/database/schema.ts` (with
`updated_at`/`updated_by_user_id`/`version`/`is_deleted` columns), a repository following
`coupleRepository.ts`'s shape, and one branch each in `syncEngine.ts`'s push/pull loops. Don't
build a separate queue or engine for it.

## Known limitations (Phase 1)

- No iOS Simulator runtime or working Android Emulator was available in the environment this was
  built in, so the UI was verified via `tsc --noEmit`, `expo export` (both platforms bundle
  cleanly), and unit/repository tests — not an actual on-device run. Run `npx expo start` and open
  it on a simulator/device to confirm visually before shipping.
- Push notifications (`expo-notifications` is installed but unconfigured) and photo upload
  (`expo-image-picker` installed, unused) are foundation-only — wired up in later phases.
