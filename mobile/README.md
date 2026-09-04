# Ours — Mobile

Expo (React Native + TypeScript) app, offline-first: SQLite is the source of truth for the UI,
a generic sync queue reconciles with the backend when a connection is available.

```text
app/                      Expo Router routes
  (auth)/                 login, register, forgot-password
  reset-password.tsx      top-level (not inside (auth)) — see "Deep linking" below
  (onboarding)/           create-couple, join-couple (online-only, like leaving one — see below)
  (tabs)/                 Home, Calendar, Money, Settings — the main app
  calendar/               new / [id] — create + edit event modals
  accounts/                new / [id] — create account + account detail/edit/deactivate
  transactions/            new / [id] — add (Expense/Income/Transfer) + edit/delete
  budgets/                 new / [id] — create + edit/delete a monthly category budget
src/
  database/                SQLite open + migrations (schema.ts, migrations.ts, db.ts)
  repositories/            read/write SQLite, enqueue sync ops (coupleRepository.ts, calendarEventRepository.ts,
                           accountRepository.ts, transactionRepository.ts, budgetRepository.ts)
  sync/                    sync_queue repository + push/pull engine, reused by every feature
  services/                API client (with auto token-refresh), connectivity (NetInfo), biometricAuth.ts
  stores/                  Zustand: auth session (+ biometric gate), sync status
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

**Adding a new synced feature**: add its table to `src/database/schema.ts` (with
`updated_at`/`updated_by_user_id`/`version`/`is_deleted` columns, and bump
`CURRENT_SCHEMA_VERSION` + add a migration block), a repository following
`coupleRepository.ts`'s (Phase 1) or `calendarEventRepository.ts`'s (Phase 2 — a genuinely
independent, potentially-partner-created entity rather than a singleton) shape, and one branch
each in `syncEngine.ts`'s push/pull loops. Don't build a separate queue or engine for it.

Calendar (Phase 2) is the first feature to exercise the full offline lifecycle end to end:
create/edit/delete all work offline (SQLite + sync_queue immediately, pushed once online), and a
delete surfaces to the partner's device as a pulled tombstone rather than the row just vanishing
unexplained — see `calendarEventRepository.applyRemoteChange`. The Calendar tab is a hand-rolled
month grid (`MonthCalendarGrid`, no calendar UI library) with day selection, a Today button, and
an event list scoped to whichever day is selected. An event can be marked all-day; `allDayRange()`
(`utils/calendarGrouping.ts`) collapses its start/end to this device's own local midnight before
it's ever converted to an ISO timestamp — converting through UTC first, or storing a bare date,
is what would let the day silently shift depending on the device's timezone offset.

**The Money System (Phase 3)** replaces the Phase 3A Expenses-only design entirely — `expenses`
is dropped by the schema v5 migration, not kept alongside the new tables. Three repositories
(`accountRepository.ts`, `transactionRepository.ts`, `budgetRepository.ts`) follow the same
established shape, plus a shared calculation layer, `utils/moneyCalculations.ts` — the mobile
mirror of the backend's `MoneyCalculator` — that every screen (dashboard, account detail, budget
progress) reads through instead of computing its own arithmetic:

- **Money precision**: `amount_cents`/`opening_balance_cents` are stored as SQLite `INTEGER`,
  never `REAL`, and every total is plain integer addition (`utils/money.ts`'s `sumCents`, and
  `moneyCalculations.ts` built on the same convention). The wire payload is still a decimal JSON
  number matching the backend's `decimal`; `apiAmountToCents`/`centsToApiAmount` are the only two
  places a float briefly exists, using a `toFixed`-then-parse/round trick specifically so a value
  like `100.10 + 0.20` is never serialized as `100.30000000000001`.
- **Account balance**: there is no stored "current balance" column locally either — every balance
  is `opening_balance_cents` plus every non-deleted transaction touching that account, recomputed
  fresh by `calculateAccountBalance()` every time. That's also why editing or deleting a
  transaction needs no explicit "undo" step in the repository: `updateLocally` just writes the
  transaction's new state, and the next balance read is automatically correct.
- **Transfers**: `transactionRepository`'s `Type` field is `'Expense' | 'Income' | 'Transfer'` —
  a transfer is one row with both an `account_id` (source) and `destination_account_id`, never two
  separate transactions that could desync if only one half synced. `calculateMonthlySpending`/
  `calculateCategorySpending` only ever look at `Expense` rows, so a transfer never counts as
  spending or against a budget.
- `transaction_date`/budget `year`/`month` follow `anniversary_date`'s existing bare `YYYY-MM-DD`
  date-only convention (`utils/date.ts`'s `toLocalDateString`/`fromLocalDateString`, never
  `Date#toISOString()`, which reads the UTC date and can shift by a day).
- **Account branding**: `utils/accountBrand.ts` is a small static local map (bank/e-wallet name ->
  emoji + label) — never an external image URL or a fetched logo. An account's `icon` field is
  just a lookup key into this map; an unrecognized one falls back to a generic icon by account
  type instead of breaking the UI.
- Leaving a couple's cleanup (`removeLocalCoupleAndData`) removes a couple's accounts,
  transactions, and budgets the same way it already removed calendar events — see below.

## Authentication: password reset + biometric login

- **Forgot/reset password**: `app/(auth)/forgot-password.tsx` calls `POST /api/auth/forgot-password`
  (same request/response regardless of whether the email exists — nothing to branch on here
  either). The email's link (`ours://reset-password?email=...&token=...`) opens
  `app/reset-password.tsx`, which is deliberately a **top-level** route, not nested inside
  `(auth)` — a route inside a `Stack.Protected` block redirects away before rendering if its
  guard is false, so a route a deep link must always reach can't live inside one. No session is
  established on a successful reset; the user returns to Login.
- **Biometric login**: never stores a password or any credential on-device. `enableBiometricLogin()`
  (`src/services/biometricAuth.ts`) writes a throwaway opaque value into a SecureStore key created
  with `requireAuthentication: true` — from then on, the **OS** (Keychain/Keystore), not app code,
  gates every read of it behind Face ID/Fingerprint/device credential. The actual session
  continues to live in the same plain, ungated SecureStore key `authStore.ts` always used; what
  biometrics gate is a separate flag, `isBiometricGatePassed`, that the root layout also requires
  (alongside a non-null session) before treating the user as authenticated. A successful OS gate
  is not enough by itself — `useBiometricAuth.ts`'s `attemptBiometricLogin()` still calls the
  existing `/api/auth/refresh` afterward, and a revoked/expired session is cleared (and biometric
  login turned off) rather than silently retried, so a stale "quick login" preference can never
  outlive the session behind it — including after a password reset, which revokes every refresh
  token and thus invalidates any device's biometric login on its next use, automatically.

## Leaving a couple

Settings' Couple section calls `useCoupleActions().leaveCouple()` — the third online-only couple
action alongside create/join, and for the same reason: ending a couple changes *another user's*
membership too, which local SQLite alone can never safely resolve. It checks connectivity
(`getIsOnline()`) before ever calling the API; offline, it throws without touching any local
state, so the app never pretends a destructive cross-user change succeeded when the server hasn't
confirmed it.

On a confirmed success, `coupleRepository.removeLocalCoupleAndData()` removes the couple, its
membership rows, its calendar events, and its Money data (accounts, transactions, budgets) — and discards any not-yet-synced `sync_queue` entry for
that data too, so a pending offline edit/create from before leaving can never get pushed under
whatever couple this device joins next (the server derives a push's couple from the *current*
token, not from whenever the change was queued). `authStore.clearCoupleId()` then patches the
session locally (no fresh token is issued for this — the backend already rejects a stale coupleId
claim, see the backend README), which is what flips the root layout's `hasCouple` guard and
routes back to onboarding.

The partner who didn't initiate the leave learns about it the same way any other couple_profile
tombstone is learned about: their next sync pull applies it through
`coupleRepository.applyRemoteProfileChange()`'s null-payload branch (now the same full cleanup,
not just a field update) and calls the same `clearCoupleId()` — one mechanism handles both the
leaver's own device and the partner's, rather than two.

## Known limitations

- No iOS Simulator runtime or working Android Emulator was available in the environment this was
  built in, so the UI was verified via `tsc --noEmit`, `expo export` (both platforms bundle
  cleanly), and unit/repository tests — not an actual on-device run. Run `npx expo start` and open
  it on a simulator/device to confirm visually before shipping. This applies to the deep link and
  biometric prompts specifically as well — see the phase report's "Manual Verification" section.
- Push notifications (`expo-notifications` is installed but unconfigured) and photo upload
  (`expo-image-picker` installed, unused) are foundation-only — wired up in later phases.
- Calendar reminders are stored (`reminder_at`) but nothing schedules an actual device
  notification for one yet — that's Phase 6.
- No "Enable biometric login?" prompt after registration (only after a normal login) — the spec
  frames this as a first-*login* moment, and a brand-new account has nothing to protect yet since
  it goes straight to onboarding.
- The Money dashboard always shows the current calendar month (no prev/next month navigation, unlike
  Calendar's) — kept minimal per the Phase 3 spec's layout example; add if month-by-month history
  browsing is wanted later.
- Budgets can only be created for the current month from the UI (the data model itself supports
  any year/month — see Budget.Year/Month — this is a UI simplification, not a model limitation).
