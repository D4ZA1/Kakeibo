# Security

Covers both repos: the app (`Kakeibo`) and the sync Worker (`Kakeibo-sync`). Updated 2026-10-07.

## What we protect

Kakeibo never holds or moves money. The UPI app (Google Pay, PhonePe…) does the payment and the PIN never touches us. What we hold is **financial personal data**: who the user paid (VPA, payee name), how much, when, notes, and categories. Under the DPDP Act that is personal data we are the fiduciary for.

| Where | What | Who could read it |
|---|---|---|
| Phone: `kakeibo.db` | everything | the user; anyone with the unlocked phone (app lock helps) |
| Phone: SecureStore | DB key, refresh token | only our app (Android Keystore) |
| Phone: cache `upi-qr/pay.png` | the last payment link as a QR | our app; the UPI app it was shared to |
| Worker + D1 (with an account) | synced rows | **today:** us and Cloudflare. **After M7:** ciphertext only |
| Transit | sync requests | TLS 1.2+ (Cloudflare) |

## Threats and controls

| Threat | Control | Status |
|---|---|---|
| Lost or stolen phone | SQLCipher (AES-256) with a 256-bit random key in the Android Keystore; optional app lock; app hidden in the app switcher while locked | DB encryption done (M1); lock in M6 |
| Phone backup leaks the DB | `android:allowBackup=false` (the key can't be restored, so a restored DB would be unreadable anyway) | Done |
| Another app reads our data | Android app sandbox; FileProvider grants read access to the one QR file only, to the one app we share it with | Done |
| Payee/amount on the lock screen | Reminder channel `lockscreenVisibility: PRIVATE`; generic notification text | M6 |
| Debug tools in a release build | `/dev/*` routes redirect away unless `__DEV__`; seed action already `__DEV__`-only | M6 |
| Payment data in logs | Rule 9 in CLAUDE.md: no VPAs, amounts or raw UPI responses outside `__DEV__`; Worker logs no row data | Rule in place; Worker in M7 |
| Malicious or malformed QR | `parseUpiUri` rejects non-INR, bad VPA, zero/negative amounts, signed-without-amount; merchant links passed unchanged (rule 4) | Done (M3) |
| Wrong payment status | Only an unambiguous `SUCCESS` settles; everything else goes to Confirm (rule 2) | Done (M5) |
| **Server breach / insider / subpoena** | **End-to-end encryption of synced rows**: the app encrypts each row before it leaves the phone; the server stores ciphertext + routing fields only | M7 (decision below) |
| Account takeover | Google sign-in (ID token verified server-side); short-lived access tokens; rotating refresh tokens with reuse detection; per-IP rate limits on auth | M7 |
| One user reading another's rows | `user_id` comes only from the verified token, never the body; every query filters by it | Done (Worker), keep in M7 |
| Oversized / malformed requests | Body size cap, strict schemas (unknown fields rejected), row count cap | Partly done; Zod in M7 |
| Shared-token leak | Replace `SYNC_TOKEN` with per-user auth before anyone else syncs | M7 |
| Account deletion leaves copies | `DELETE /v1/account` hard-deletes rows; D1 Time Travel keeps history for 30 days, so the privacy policy says "within 30 days" | M7 / M8 |

## Decision: end-to-end encryption for sync (decided 2026-10-07: yes)

The Worker is only a backup and sync store; it never needs to read a payment. So encrypt rows on the phone:

- **Data key:** a random 256-bit AES key per user, made on the first device.
- **Rows:** each transaction / payee rule is serialised to JSON and sealed with AES-256-GCM (random 96-bit nonce per row, `id` + `kind` as additional data so a ciphertext can't be moved to another row). `expo-crypto` ships AES-GCM on SDK 57, so there's no new dependency.
- **The server sees:** `user_id`, `kind`, `id`, `updated_at`, `deleted`, `synced_at`, `ciphertext`. Enough for last-write-wins and cursors, nothing about who was paid or how much.
- **Second device:** the data key is stored with Android **Block Store** (`shouldBackupToCloud = true`). Google encrypts it end-to-end with the phone's screen lock and restores it during device setup. Needs a small native addition to `modules/` (Play services `blockstore`). Fallback: a 24-word recovery code shown once and kept by the user. Without either, a new phone starts empty and only *new* rows sync.
- **Trade-off:** we can't do server-side features over the data (search, analytics, Account Aggregator matching). None are planned for v1.

If E2E is skipped, the fallback is TLS + D1's AES-256-GCM at rest, which protects against disk theft at Cloudflare but not against us, Cloudflare, or a leaked API token.

## Auth design (M7)

1. App: Google sign-in via Credential Manager (`@react-native-google-signin/google-signin`) → Google **ID token**.
2. `POST /v1/auth/google { idToken }` → Worker verifies with `jose` (`createRemoteJWKSet` on Google's JWKS, cached): signature, `iss` ∈ {`https://accounts.google.com`, `accounts.google.com`}, `aud` = our web client ID, `exp`, `email_verified`. User key = `sub` (never email).
3. Worker returns:
   - **Access token:** JWT (HS256, `JWT_SECRET` Worker secret), 15 minutes, claims `sub` (our user id), `iat`, `exp`, `jti`. Kept in memory only.
   - **Refresh token:** 32 random bytes, base64url, 60 days. App keeps it in SecureStore; the Worker stores only `SHA-256(token)` with a `family_id`.
4. `POST /v1/auth/refresh` rotates: the presented token is marked used and a new one issued in the same family. **Reuse of a used token revokes the whole family** (stolen token detection) and forces sign-in.
5. `POST /v1/auth/logout` revokes the family. `DELETE /v1/account` deletes the user, sessions and rows.
6. Rate limits (Workers rate limiting binding, 10 s / 60 s windows): auth endpoints per IP (e.g. 10/min), sync per user (e.g. 60/min).
7. Secrets: `JWT_SECRET` (32+ random bytes) via `wrangler secret put`; `GOOGLE_WEB_CLIENT_ID` as a plain var. Rotating `JWT_SECRET` only logs everyone out after 15 minutes (refresh still works).

## Payload validation (Zod)

- **Worker: yes.** Replace the hand-written `validate.ts` (~110 lines) with Zod 4 schemas using `zod/mini` (~2 KB gzipped). `z.strictObject` rejects unknown fields; the same schemas give the TypeScript types, so `types.ts` goes away.
- **App: yes, at the one trust boundary,** parsing what the server returns on pull before anything is written to SQLite. Not for local screens or route params.
- **One contract, vendored into both repos.** Today `src/types.ts` (Worker) and `src/db/types.ts` (app) are kept in step by hand. M7 replaces them with one `contract.ts`, copied into both repos and checked by hash in CI (see "Repo layout" in the build plan).

With E2E, the wire schema is small (an envelope); the full row schema is checked in the app after decrypting.

## Release checklist (M8)

- R8/minify on, debuggable off, `usesCleartextTraffic` false (default).
- `/dev/*` unreachable; no `console.log` of payment data.
- `npm audit` clean or triaged in both repos; Dependabot on.
- Secrets only via `wrangler secret`; no `.dev.vars` in git (already ignored).
- Privacy policy states: what is stored on the phone, what syncs (ciphertext), retention (account lifetime + 30 days Time Travel), deletion, grievance contact, breach notification within 72 hours.
