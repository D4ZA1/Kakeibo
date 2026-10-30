# Scan & Pay Expense Tracker

A cross-platform (Android + iOS) expense tracker for India. The user scans any UPI QR code, tags the payment with a category, and pays through their own UPI app (Google Pay, PhonePe, Paytm, BHIM). On Android this goes through a native UPI intent; on iOS, which has no intent/app-chooser equivalent, the same payment link is rendered as a QR image and handed to the system share sheet, the same trick Android uses for personal (non-merchant) payees. Every payment is saved locally, and the saved data powers monthly statistics, month-vs-month comparison and history.

We never hold or move money. We build a `upi://pay` link, hand it to the user's UPI app, and record what happened.

Read these before writing code:

- `docs/spec.md`: every screen, its states and its route
- `docs/design-tokens.md`: colors, type, radii, and the Tailwind theme
- `docs/data-model.md`: SQLite schema, categories (schema now lives in `src/db/migrations/*.sql`; Kysely, not Drizzle), auto-tagging rules
- `docs/upi-native-module.md`: the Kotlin Expo module that launches UPI apps and returns the result
- `docs/build-plan.md`: milestones in order, with acceptance criteria
- `docs/toasts.md`: the toast component and where the app uses it
- `docs/security.md`: threat model, encryption and auth design for the app and the sync Worker
- `docs/design/`: PNG exports of every screen. Match them closely.

## Stack

- **Expo** (latest SDK) with **expo-router**, TypeScript strict mode
- **Development build** (`expo-dev-client`). Expo Go cannot run the custom UPI module on Android, nor the iOS share-sheet payment flow (native modules, `expo-sharing`).
- **NativeWind** + **React Native Reusables** (shadcn-style components for RN). Components are copied into `src/components/ui/` and restyled to our tokens.
- **expo-camera** for QR scanning (`CameraView` with `barcodeScannerSettings`), and `scanFromURLAsync` for QR images picked with **expo-image-picker**
- **expo-sqlite** with SQLCipher enabled + **Kysely** (plain SQL migrations in `src/db/migrations/`, types in `src/db/types.ts`)
- **Cloudflare Worker + D1** for backup/sync only, in the separate `Kakeibo-sync` repo (sibling folder). Its row types in `src/types.ts` must match `src/db/types.ts` here. The phone's SQLite is the source of truth; the app must work offline.
- **expo-secure-store** holds the database encryption key
- **expo-local-authentication** for the optional app lock
- **react-native-svg** for the donut chart and icons. Charts are hand-built, not from a chart library.
- **@expo-google-fonts/figtree** for the Figtree typeface
- **zustand** for the in-progress payment draft (scan → tag → pay)
- **expo-notifications** for "ask me later" reminders on pending payments
- Local Expo module `modules/upi-intent` (Kotlin on Android, for UPI app discovery and launch; TS-only on iOS, see below)
- **expo-sharing** + **react-native-qrcode-svg** (rendered via the `react-native-svg` we already use) for the iOS payment and CSV-export share sheets

## Project layout

```
src/app/                 expo-router routes (see docs/spec.md for the route table)
src/components/ui/       React Native Reusables components, restyled
src/components/          app components (TxnRow, CategoryDot, Donut, CompareBar, PillButton…)
src/features/pay/        payment draft store, UPI link parse/build, status handling
src/features/insights/   aggregation queries (monthly totals, comparisons)
src/db/                  SQL migrations, Kysely types and client, seed categories
src/lib/                 money formatting, dates, tokens
modules/upi-intent/      local Expo module (Kotlin + TS bindings, stays at root)
docs/                    specs (this kit)
```

## Commands

```
npx expo run:android      build and run the dev client on a device or emulator
npx expo start --dev-client
add src/db/migrations/NNNN_name.sql   schema change (append-only; mirror synced columns in Kakeibo-sync)
npm test                  jest unit tests
```

## Rules

1. **Money is integer paise.** Store and calculate in paise (`590000` = ₹5,900.00). Format only at the edge with `src/lib/money.ts` (Indian grouping: ₹1,00,000).
2. **Never trust the UPI app's status alone.** It can be missing or wrong. Show `/pay/confirm` whenever the status is anything other than an unambiguous `SUCCESS`, and let the user mark the result.
3. **Save before paying.** Insert the transaction as `pending` before launching the UPI app, then update it. A user who never comes back must still have a record.
4. **Do not rewrite merchant QR links.** If the scanned QR already contains `am` or `sign`, pass the original `upi://` string to the UPI app unchanged; editing it can break the merchant's signature. Only build a fresh link for QRs without an amount (personal QRs). A signed QR without an amount is rejected at scan, since the amount the user types can't be added to it.
5. **iOS pays by per-app deep link or QR-share, not intent.** iOS has no Android-style UPI intent or app chooser. Merchant payments open the chosen app's own URL scheme directly (`gpay://upi/pay?...`, confirmed by Google's iOS docs; same shape used for PhonePe/Paytm/BHIM by convention, not an official spec). Personal (non-merchant) payees render the link as a QR PNG (`react-native-qrcode-svg`, rasterized off-screen via `QrExportHost` — keep it off-screen, it's an 800px image) save it to Photos (`expo-media-library`), then open the chosen app (`gpay://`) for the user to scan it from their gallery; the QR is deleted once they're back (iOS asks to confirm). Direct links (`gpay://`, `tez://`) and image sharing were tested and fail for personal payees on iOS GPay ("exceeded limit", no share target). There's no activity-result callback either way on iOS, so every iOS payment routes straight to `/pay/confirm` (rule 2). See `docs/upi-native-module.md`.
6. **Match the design.** Dark and light themes; colors live once in `src/lib/theme.js` (classNames via `tailwind.config.js`, JS props via `useTokens()`), never raw hex in components. The Scan screen is always dark. Touch targets at least 44 px. Every icon-only button gets an `accessibilityLabel`.
7. **Category colors are fixed** and come from the `categories` table, so a category looks the same on every screen.
8. **Tests:** the UPI link parser, the UPI response parser, money formatting and the monthly aggregation queries must have unit tests.
9. **No payment data in logs.** Never log VPAs, amounts or raw UPI responses outside `__DEV__`.
10. Keep components small and typed. No `any`. No new dependencies without saying why in the PR or commit message.
