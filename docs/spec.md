# Screens, routes and behavior

Sample data in the design (Apple Store, ₹5,900, Aarav) is illustrative. Real screens read from the database.

## Route table

| Route | Screen | Design board |
|---|---|---|
| `/(tabs)/index` | Home | 1 Home |
| `/(tabs)/scan` | Scan QR | 2 Scan QR |
| `/(tabs)/insights` | Statistics | 9 Statistics |
| `/(tabs)/history` | History | 9 History |
| `/pay/details` | Details read from QR | 3a Details from QR |
| `/pay/amount` | Enter amount (QR has no amount) | 3b Enter amount |
| `/pay/tag` | Category + note | 4 Tag category |
| `/pay/choose-app` | UPI app bottom sheet (modal) | 5 Choose UPI app |
| `/pay/waiting` | Waiting for UPI app | 6 Waiting for Google Pay |
| `/pay/confirm` | Did it go through? | 7 Confirm payment |
| `/pay/success` | Paid | 7a Paid |
| `/pay/failed` | Failed | 7b Failed |
| `/pay/category` | Change category sheet (modal), from the receipt's category pill | — |
| `/welcome` | First-launch onboarding: first name + privacy notice | — |
| `/insights/compare` | Month vs month | 9 Compare months |
| `/txn/[id]` | Transaction detail (reuses the Paid layout) | — |

The tab bar has 4 icons: Home, Scan, Insights, History. The `/pay/*` screens sit in a stack without the tab bar.

## Payment draft

A zustand store `usePayDraft` holds the in-progress payment from scan to result:

```ts
type PayDraft = {
  rawUri: string;            // exactly what the QR contained
  payeeVpa: string;          // pa
  payeeName?: string;        // pn
  amountPaise?: number;      // am, converted
  amountLocked: boolean;     // true if the QR carried am
  merchantCode?: string;     // mc
  txnRef?: string;           // tr
  qrNote?: string;           // tn
  categoryId?: string;
  note?: string;
  txnId?: string;            // our DB id once saved as pending
};
```

Clear the draft when the flow ends (success, failed, or "ask me later").

## Flow

```
Home → Scan → (QR has am) Details ─┐
            → (no am)    Amount  ──┤
                                   ↓
                                  Tag → Choose app → [save pending] → launch UPI app → Waiting
                                                                                        ↓
                                              result SUCCESS ────────────────────────→ Success
                                              anything else / no result / user taps ─→ Confirm
                                                                        Yes → Success
                                                                        No  → Failed (Try again → Choose app)
                                                                        Later → Home (stays pending, reminder)
```

## Screens

### Home
- Greeting with avatar initials and the user's first name (from onboarding; fallback "Hi").
- Summary card: "Spent in {Month}", the month total, the difference vs last month ("₹3,120 more than September" / "less than"), a segmented bar of category shares (pill segments, 4 px gaps), and a legend of the top 4 categories. Tapping it opens Insights.
- Primary pill button "Scan & pay" → Scan.
- Insight card: the category with the largest % increase vs last month ("Food is up 18% this month"). Tapping it opens Compare. Hide the card if there is no previous month of data.
- "Recent": the latest 2 to 3 transactions with "See all" → History.
- Empty state (no transactions yet): replace the summary card with "Scan your first QR to start tracking".

### Scan
- Full-screen `CameraView`, QR only. Focus frame with 4 rounded corner brackets and a mint scan line.
- Status chip "Looking for a QR code". On a successful read, haptic tick, parse, then route to Details or Amount.
- If the code is not a valid `upi://pay` link, show an inline message "This QR isn't a UPI payment code" and keep scanning.
- Buttons: flashlight toggle (top right), "From gallery" (image picker + `scanFromURLAsync`), "Enter UPI ID" (opens Amount with a VPA field).
- The "Scan to pay" button re-arms scanning if it was paused after an invalid code.
- Camera permission denied: explain and offer "Open settings".

### Details (QR had an amount)
- Avatar (first letter of the payee name, category color if a rule exists, else neutral), payee name, VPA.
- Badge "Merchant QR" when `mc` is present and not `0000`. Do not claim "verified" unless a real check exists.
- Large locked amount with caption "Amount set by the merchant's QR".
- Card "Read from QR code" listing UPI ID, payee name, order reference (`tr`) and merchant type (from `mc`), hiding missing rows.
- "Continue" → Tag.

### Amount (QR had no amount)
- Payee row with "Personal QR" chip. If arrived from "Enter UPI ID", show a VPA input with validation first.
- Large amount with cursor, quick-add chips (+₹100, +₹500, +₹1,000), and a custom numeric keypad (no system keyboard).
- Continue disabled until amount > 0. Cap at ₹1,00,000 with an inline message (UPI apps enforce their own limits too).

### Tag
- Payee summary row with the amount.
- "Category" grid, 4 columns, 12 tiles (see data-model.md). Preselect the suggestion (rules → mcc → none) and show "Suggested: X".
- "Note (optional)" text input, max 60 characters.
- Toggle "Always tag {payee} as {category}" → writes a payee rule on pay. Default on when the user changed the suggestion.
- Primary "Pay ₹X" with caption "Opens your UPI app to enter your PIN". Disabled until a category is chosen.

### Choose app (bottom sheet)
- Lists installed UPI apps from `UpiIntent.getInstalledApps()` with name and icon. Last used app preselected and labelled "Last used".
- Checkbox "Always use {app}" → skip the sheet next time (settings can reset it).
- No UPI apps installed: message plus a link to the Play Store listing for Google Pay.
- Primary "Open {app}": save the transaction as `pending`, then `UpiIntent.pay(...)`, then navigate to Waiting.

### Waiting
- Shown while the user is in the UPI app. Static progress ring, "Finish in {app}", summary card (payee, amount, "Saved as {category}, pending").
- When the module resolves:
  - `SUCCESS` → update status, go to Success.
  - anything else → go to Confirm.
- "I'm back from {app}" button → Confirm (covers apps that never return a result).
- "Cancel payment" → mark `failed` with reason `user_cancelled`, go to Failed.

### Confirm
- Payee, category and amount summary. Heading "Did the payment go through?" and helper text.
- Two large answer buttons in thumb reach: "Yes, it's paid" (mint) → `success` + `confirmedBy = 'user'`; "No, it failed" (coral) → `failed`.
- "Not sure, ask me later" → stays `pending`, schedule a local notification in 30 minutes, go Home. Pending payments show in History with a "Pending" badge and reopen this screen when tapped.

### Success
- Mint check, "₹X paid", "to {payee}".
- Receipt card: category (tap to change), note, UPI reference (`ApprovalRefNo` or `txnId` if present), app used, date and time.
- Mini insight: "{Category} this month: ₹A of ₹B" with a progress bar.
- "Done" → Home. Share icon → share a text receipt.

### Failed
- Coral cross, "Payment didn't go through", explanation that names the app.
- Card with the raw status from the app, the UPI reference if any, and "Saved in history as Failed".
- "Try again" → Choose app with the same draft (new transaction row, the failed one stays).
- Failed payments are excluded from all spending totals.

### Statistics
- "Expenses" dropdown (v1: Expenses only; keep the control for later Income support).
- Segmented control Week / Month / Quarter.
- Period scroller: previous (muted), current (bold), next (very faint, disabled if in the future). Swipe or tap to change.
- Donut of category totals: rounded-cap segments with gaps, total in the centre ("₹28.5K") and "+12% vs September" under it.
- Two-column legend: dot, category, amount. Only categories with spend > 0.
- "Compare with {previous period}" → Compare.

### Compare
- Two summary tiles: current and previous period totals, each with its bar color key.
- Sentence: "You spent 12% more. Tech drove most of it." (the category with the largest absolute change).
- One row per category: name, % change (increase in peach, decrease in mint, 0% muted), a bar for the current period in the category color and a grey bar for the previous period, both scaled to the largest value on screen.

### History
- Title, search (payee name, note, VPA), filter chips (All, then the user's top categories, then Failed, Pending).
- Grouped by day with the day's total spend on the right. Failed rows: struck-through amount and "Failed" badge. Pending rows: "Pending" badge.
- Tap → `/txn/[id]` (pending ones → Confirm).
