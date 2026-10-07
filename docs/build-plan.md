# Build plan

Work through the milestones in order. Finish each one's acceptance checks before starting the next, and commit at the end of each.

Updated 2026-10-07 after M4: v1 now covers the screens that already exist as mockups (Settings, login/OTP/profile) and the live sync backend (`Kakeibo-sync`). Security, auth and compliance work is split into M6–M8 so payments (M5) are not blocked on it.

## Done

- **M0: Project setup.** Expo + expo-router, dev client, NativeWind + Reusables, Figtree, tabs, Jest.
- **M1: Data layer.** expo-sqlite with SQLCipher (key in expo-secure-store), plain SQL migrations + Kysely, money formatting, insight queries with tests, dev-only "Seed sample months".
- **M2: Read-only screens.** Home, Statistics, Compare, History and txn detail on live queries (`useLiveQuery`), empty states.
- **M3: Scanning and parsing.** `parseUpiUri` / `amountToPaise` / `buildPayUri` with tests, camera + gallery scanning, pay draft store, Details and Amount, Enter UPI ID.
- **M4: Tagging.** Suggestion order rule → history → mcc, note, "Always tag" writes `payeeRules`.
- **Backend (outside the milestones).** Cloudflare Worker + D1 `POST /v1/sync` deployed, one shared token (see M7).

## M5: UPI module and payment

**Start with a spike (half a day) before building the screens.** Google Pay documents UPI intent for verified merchants; intents to personal VPAs, or with an `am` the app doesn't trust, may be declined ("as per UPI risk policy") or blocked by some apps. Build a throwaway `pay(uri)` in the Kotlin module and record the raw response for each case below on a real phone:

| | Google Pay | PhonePe | Paytm | BHIM |
|---|---|---|---|---|
| Merchant QR, unchanged (`am` + `mc`) | | | | |
| Personal VPA, fresh link with `am` | | | | |
| Your own second account, ₹1 | | | | |

Save the strings as fixtures for `parseUpiResponse` tests. If personal intents are blocked in an app, keep it in the list but show "This app may not allow payments to personal UPI IDs from other apps" for P2P drafts and rank apps that work first. The Confirm screen already covers "I'm not sure".

Then:
- Local Expo module per `upi-native-module.md`, including the manifest `<queries>`. `getInstalledApps()`, `pay(uri, packageName)`.
- `parseUpiResponse` (`src/features/pay/upiResponse.ts`) with unit tests on the captured strings, including empty/null and mixed-case keys.
- Choose app sheet from `getInstalledApps()`; preferred app saved in `settings` (`preferredUpiApp`), honoured by "Always use {app}" and reset from Settings.
- Save `pending` → `pay()` → Waiting → route by result (rule 2 and 3). Confirm, Success and Failed read the draft and the saved row; delete `SAMPLE_DRAFT`.
- Write the payee rule after the payment is saved, not on tapping Pay (currently `ponytail:` in `pay/tag.tsx`).
- App-resume check that sends a recent (< 30 min) pending payment to Confirm.
- "Ask me later": local notification after 30 minutes via `expo-notifications`. Ask for `POST_NOTIFICATIONS` (Android 13+) at that moment, not at launch. An inexact schedule is fine, so no `SCHEDULE_EXACT_ALARM`.
- Clear the draft when the flow ends (success, failed, ask me later).
- iOS guard on the Pay button (rule 5).
- Never log `upiResponseRaw`, VPAs or amounts outside `__DEV__`.

**Done when:** a merchant-QR payment through Google Pay ends on Success with an approval reference, a cancelled one ends on Confirm, force-closing mid-payment leads back to Confirm on reopen, and the spike table is filled in and committed to `docs/upi-native-module.md`.

## M6: Local settings and on-device security

Everything here works offline and needs no account.

- **Onboarding without login:** first launch asks only for a first name (saved as `settings.firstName`; Home reads it) plus the privacy notice (M8 text). Login and OTP screens stay unreachable until M7. Delete `SAMPLE_PROFILE`.
- **Settings persistence:** every toggle in `settings` (theme, preferred app / choose every time, reminders, app lock, monthly summary). Remove switches whose feature isn't built (monthly summary until it exists).
- **App lock** (`expo-local-authentication`): when on, lock on cold start and after 60 s in background. Allow biometrics with device-credential fallback (the user already trusts their screen lock; biometric-only locks people out). If the device has no screen lock, disable the toggle and explain why. Re-authenticate before turning the lock off.
- **Hide content in app switcher:** blur or cover the screen when the app goes to background while app lock is on.
- **Export CSV** via `expo-sharing` (date, payee, VPA, amount, category, note, status). Built from a tested pure function.
- **Delete all data:** wipe the SQLite file and the key in SecureStore, then return to onboarding. Confirm twice.
- **Database key loss:** if `PRAGMA key` fails to open an existing file (keystore reset), offer "Start fresh" (delete the file) instead of the dead-end error screen.
- Haptics (`expo-haptics`) on scan success and payment result.
- Accessibility pass with TalkBack; every icon-only button labelled (rule 6).

**Done when:** a fresh install onboards with a name, settings survive a restart, app lock blocks the app after 60 s in background, CSV opens in a spreadsheet, and "Delete all data" leaves an app that looks freshly installed.

## M7: Account and sync

Optional for the user: the app keeps working without an account.

- **Auth on the Worker** (replaces the shared `SYNC_TOKEN`):
  - **Google sign-in** (decided 2026-10-07; avoids TRAI DLT registration for SMS OTP). The app gets a Google ID token with `@react-native-google-signin/google-signin` (Android Credential Manager) and posts it to `POST /v1/auth/google`.
  - The Worker verifies the ID token signature against Google's JWKS (cache the keys), and checks `aud` = our web client ID, `iss`, `exp` and `email_verified`. The user is keyed by the token's `sub`, never by email (emails can change). Rate-limit the endpoint per IP (Workers rate limiting binding).
  - Login screen becomes a single "Continue with Google" button; the OTP screen is deleted. Profile setup keeps the first name (prefilled from Google's `given_name`).
  - Session: short-lived signed access token + rotating refresh token. The app keeps the refresh token in expo-secure-store; the Worker stores only its hash. "Log out" revokes it.
  - `users` table in D1 (`id`, `google_sub` unique, `email`, `created_at`); `user_id` on every row comes from the token, never from the request body (already the case).
- **Sync client in the app:** push rows with `updatedAt > lastPushedAt`, pull with the server `cursor`, last-write-wins (matches the Worker). Runs on app start and after a payment result, never blocks the UI.
- **Deletes:** add tombstones (`deleted_at`) to both schemas so a delete syncs, and `DELETE /v1/account` that removes all of a user's rows (needed for "Delete account and data" and DPDP erasure).
- **Worker hardening:** request body size cap, CORS off (no browser clients), no row data in logs, `wrangler.jsonc` without `remote: true` for local dev.
- Settings: Backup & sync toggle, "Last synced", Log out, Delete account and data (server + local).

**Done when:** two phones signed into the same account converge after paying on each, a second Google account can't read the first's rows, a forged or expired ID token is rejected, and deleting the account removes the rows from D1.

## M8: Compliance and release

- **DPDP Act 2023 + DPDP Rules 2025** (notified 13 Nov 2025; consent, notice, security and rights duties apply from 13 May 2027, penalties from 13 Nov 2026):
  - Standalone plain-language notice before collecting anything: itemised data (name, Google account email, payments), purpose, how to withdraw consent, how to erase, how to complain to the Data Protection Board.
  - Consent recorded with a timestamp and version; withdrawal = stop sync + offer deletion.
  - Grievance contact in the app and policy; breach plan (notify the Board and affected users within 72 hours).
  - Retention: server copy kept only while the account exists.
- **Privacy policy** page (hosted) linked from onboarding and Settings.
- **Google Play:** Financial features declaration (required for every app; we are a personal finance tracker that hands payments to UPI apps, no lending, no money movement), Data safety form (on-device financial data; synced only with an account; encrypted in transit and at rest), camera and photo permission justifications.
- App icon, splash, store listing assets.
- EAS Build profile for an internal testing track; release build with `__DEV__` tools (Seed sample months) excluded.

**Done when:** an internal-track build installs from Play and passes the M5–M7 checks on two different phones, and the Play Console declarations are submitted.

## Later (not v1)
- Budgets per category with alerts
- Income tracking (the Expenses dropdown)
- Monthly summary notification
- Bank transaction reconciliation through an Account Aggregator provider, to confirm statuses automatically
- End-to-end encryption of synced rows (server stores ciphertext only)
