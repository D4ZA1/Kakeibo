# Build plan

Work through the milestones in order. Finish each one's acceptance checks before starting the next, and commit at the end of each.

Updated 2026-10-07 after M4: v1 now covers the screens that already exist as mockups (Settings, login/OTP/profile) and the live sync backend (`Kakeibo-sync`). Security, auth and compliance work is split into M6–M8 so payments (M5) are not blocked on it.

## Done

- **M0: Project setup.** Expo + expo-router, dev client, NativeWind + Reusables, Figtree, tabs, Jest.
- **M1: Data layer.** expo-sqlite with SQLCipher (key in expo-secure-store), plain SQL migrations + Kysely, money formatting, insight queries with tests, dev-only "Seed sample months".
- **M2: Read-only screens.** Home, Statistics, Compare, History and txn detail on live queries (`useLiveQuery`), empty states.
- **M3: Scanning and parsing.** `parseUpiUri` / `amountToPaise` / `buildPayUri` with tests, camera + gallery scanning, pay draft store, Details and Amount, Enter UPI ID.
- **M4: Tagging.** Suggestion order rule → history → mcc, note, "Always tag" writes `payeeRules`.
- **M5: Payments (built, two checks open).** `modules/upi-intent` (installed apps, intent pay, QR-image share), Choose app → save pending → intent (merchant) or QR share (personal) → Waiting → Confirm / Success / Failed, resume check, "Ask me later" reminder, iOS guard. Spike results in `upi-native-module.md`.
- **Backend (outside the milestones).** Cloudflare Worker + D1 `POST /v1/sync` deployed, one shared token (replaced in M7).

Security model, threats and the auth/encryption design for both repos: **`docs/security.md`**.

## M5: remaining checks

- Real merchant QR through Google Pay ends on Success with an approval reference; a cancelled one ends on Confirm.
- QR-image share confirmed in PhonePe and Paytm (else: copy UPI ID + open app for that app).
- Replace the synthetic `parseUpiResponse` fixtures with the strings captured above.

## M6: Cleanup, local settings and on-device security

Everything here works offline and needs no account.

**Code structure first (small, unblocks the rest):**
- **Typed settings:** one `SettingKey` union (`theme`, `firstName`, `preferredUpiApp`, `alwaysUseUpiApp`, `appLock`, `reminders`, `consentVersion`) in `src/db/client.ts`, so `getSetting`/`setSetting` reject unknown keys. Fixes Home reading `name` instead of `firstName`.
- **One source for enums:** `TXN_STATUSES`, `STATUS_SOURCES`, `FAIL_REASONS` as `as const` arrays in `src/db/types.ts`, types derived from them. These move into the shared contract in M7.
- **Constants live next to their only user.** No global `constants.ts`; promote a value only when a second file needs it (`RESUME_WINDOW_MS`, the ₹1,00,000 amount cap, the reminder delay).
- **CI:** GitHub Actions in both repos running `tsc`, `eslint`, tests on every PR. Dependabot for npm.

**Settings and onboarding:**
- **Onboarding without login:** first launch asks only for a first name (`firstName`) plus the privacy notice (M8 text). The phone-OTP mockups are deleted; M7 adds a single Google sign-in screen. Delete `SAMPLE_PROFILE`.
- **Settings persistence:** every toggle in `settings` (theme, preferred app / choose every time, reminders, app lock). Remove switches whose feature isn't built (monthly summary; backup until M7).
- **Export CSV** through the system share sheet (`shareFile` in `modules/upi-intent`, reusing its FileProvider; no `expo-sharing`) (date, payee, VPA, amount, category, note, status). Built from a tested pure function; escape `"`, `,`, newlines, and prefix cells starting with `=`, `+`, `-`, `@` with `'` (CSV formula injection).
- **Delete all data:** wipe the SQLite file, the DB key, the refresh token and the QR cache, then return to onboarding. Confirm twice.
- **Toasts** (`docs/toasts.md`, designs `docs/design/Toasts (dark|light).png`): one `ToastHost` (Reanimated + Gesture Handler: slide from the left edge, hold with progress bar, pause on touch, swipe left/tap to dismiss, reduced motion, screen-reader announcements and longer holds). Used for: category changed (+ Undo), "Always tag" saved, ask me later, profile saved, CSV exported. Not for payment results (full screens) or the invalid-QR message (inline).
- **Change category** on Success and transaction detail: the receipt's category pill opens a `/pay/category` sheet (shared `CategoryGrid` with Tag); the change shows an Undo toast.
- Haptics (`expo-haptics`) on scan success, payment result and success/error toasts. No haptic on ordinary taps (tried, too noisy). Accessibility pass with TalkBack (rule 6).

**On-device security (see `security.md`):**
- **App lock** (`expo-local-authentication`): lock on cold start and after 60 s in background; biometrics with device-credential fallback; disabled with an explanation if the phone has no screen lock; re-authenticate before turning it off.
- **Hide content in the app switcher** while app lock is on (cover view on `AppState` background).
- **Database key loss:** if the key can't open an existing file (keystore reset), offer "Start fresh" instead of the dead-end error screen.
- **Lock-screen privacy:** reminder channel `lockscreenVisibility: PRIVATE`.
- **Dev tools out of release:** `/dev/*` routes redirect home unless `__DEV__` (they are reachable by deep link `kakeibo://dev/upi-test` today).
- **QR cache:** delete `cache/upi-qr/` on app start (the last payment link stays there after a share).

**Done when:** a fresh install onboards with a name, settings survive a restart, app lock blocks the app after 60 s in background, CSV opens in a spreadsheet, "Delete all data" leaves an app that looks freshly installed, every toast in `toasts.md` appears where listed and matches the designs in both themes (Undo restores the category), and CI is green on both repos.

## M7: Account and end-to-end encrypted sync (E2E decided 2026-10-07)

Optional for the user: the app keeps working without an account. Design details in `security.md` ("Auth design", "End-to-end encryption").

**Repo layout (decided 2026-10-07): two repos.** The wire schemas live in `contract.ts`, vendored into both (`Kakeibo/src/sync/contract.ts`, `Kakeibo-sync/src/contract.ts`) with a header naming the source of truth (`Kakeibo-sync`). Each repo's CI checks the file's SHA-256 against `contract.sha256`; changing the contract means updating both repos in the same PR pair.

**Contract (`contract.ts`, Zod 4 `zod/mini`):**
- `SyncEnvelope = { kind: 'txn' | 'rule', id, updatedAt, deleted, ciphertext }` (the server sees only this).
- `SyncRequest = { since, rows: SyncEnvelope[] }`, `SyncResponse = { cursor, rows: SyncEnvelope[] }`.
- `TxnRow`, `RuleRow`: the plaintext row shapes, checked in the app after decrypting a pulled row.
- Auth bodies: `{ idToken }`, `{ refreshToken }`, token responses.
- All objects `strictObject`; limits as today (500 rows, string lengths, paise as safe positive integers).

**Worker (`Kakeibo-sync`):**
- Layout: `index.ts` (route table, error envelope `{ error: { code, message } }`, body size cap 1 MB, JSON only), `auth.ts` (Google verify via `jose`, access JWT, refresh rotation), `sync.ts` (push/pull), `db.ts` (Kysely + types). Replace `validate.ts` and `types.ts` with the contract.
- Routes: `GET /health`, `POST /v1/auth/google`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`, `POST /v1/sync`, `DELETE /v1/account`.
- D1 migration `0002_auth_e2e.sql` (no real user data yet, so the old tables are replaced):
  - `users (id TEXT PK, google_sub TEXT UNIQUE NOT NULL, email TEXT, created_at)`
  - `sessions (family_id TEXT PK, user_id, created_at, revoked_at)`
  - `refresh_tokens (hash TEXT PK, family_id, expires_at, used_at)`
  - `rows (user_id, kind, id, updated_at, deleted INTEGER, ciphertext TEXT, synced_at, PRIMARY KEY (user_id, kind, id))`, index `(user_id, synced_at)`
- Rate limiting bindings in `wrangler.jsonc` (auth per IP, sync per user). Secrets: `JWT_SECRET`; vars: `GOOGLE_WEB_CLIENT_ID`. Remove `remote: true` so local dev uses a local D1.
- Logs: route, status, duration, user id; never row data or tokens.
- Tests: `@cloudflare/vitest-pool-workers` against a real local D1 for auth (forged / expired / wrong-audience ID token, refresh rotation, reuse revokes the family), isolation between users, last-write-wins, tombstones, size and row caps.
- New dependencies: `jose` (JWT/JWKS verification), `zod` (contract).

**App:**
- Google sign-in (`@react-native-google-signin/google-signin`, Credential Manager; new dependency). Login = one "Continue with Google" button; delete the OTP screen. Profile prefilled from `given_name`.
- Tokens: access token in memory, refresh token in SecureStore; one `api.ts` that adds the bearer token, refreshes once on 401, and signs out on refresh failure.
- **E2E:** data key (256-bit) created on first sign-in, stored in SecureStore and Android Block Store (`shouldBackupToCloud`; native addition in `modules/`); recovery code fallback. Rows sealed with AES-256-GCM via `expo-crypto` (`id` + `kind` as additional data).
- **Sync client:** push rows with `updatedAt > lastPushedAt`, pull from `cursor`, last-write-wins; decrypt + `TxnRow.parse` before writing to SQLite. Runs on app start and after a payment result, never blocks the UI.
- **Deletes:** `deleted_at` tombstone column (app migration `0003`), synced like any change.
- Settings: Backup & sync toggle, "Last synced", Log out, Delete account and data (server + local).

**Done when:** two phones signed into the same Google account converge after paying on each (second phone gets the key via Block Store), a D1 row read in the dashboard shows only ciphertext, a second account can't read the first's rows, a forged or expired ID token and a reused refresh token are rejected, and deleting the account removes the rows from D1.

## M8: Compliance and release

- **DPDP Act 2023 + DPDP Rules 2025** (notified 13 Nov 2025; consent, notice, security and rights duties apply from 13 May 2027, penalties from 13 Nov 2026):
  - Standalone plain-language notice before collecting anything: itemised data (name, Google account email, payments), purpose, how to withdraw consent, how to erase, how to complain to the Data Protection Board.
  - Consent recorded with a timestamp and version (`consentVersion` setting; server copy on sign-in); withdrawal = stop sync + offer deletion.
  - Grievance contact in the app and policy; breach plan (notify the Board and affected users within 72 hours).
  - Retention: server copy kept while the account exists; deleted data leaves D1 Time Travel backups within 30 days.
- **Privacy policy** page (hosted) linked from onboarding and Settings.
- **Google Play:** Financial features declaration (every app must file it; we are a personal finance tracker that hands payments to UPI apps, no lending, no money movement), Data safety form (on-device financial data; synced only with an account, end-to-end encrypted; encrypted in transit), camera and photo permission justifications.
- Release checklist in `security.md` (R8, no debug tools, audits, secrets).
- App icon, splash, store listing assets. EAS Build profile for an internal testing track.

**Done when:** an internal-track build installs from Play and passes the M5–M7 checks on two different phones, and the Play Console declarations are submitted.

## Later (not v1)
- Budgets per category with alerts
- Income tracking (the Expenses dropdown)
- Monthly summary notification
- Bank transaction reconciliation through an Account Aggregator provider (needs server-readable data or on-device matching; revisit with E2E)
