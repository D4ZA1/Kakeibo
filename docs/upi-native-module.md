# UPI intent module (`modules/upi-intent`)

A local Expo module, written in Kotlin with the Expo Modules API. Create it with:

```
npx create-expo-module@latest --local
# name: upi-intent
```

It needs a development build (`npx expo run:android`). It will not run in Expo Go.

## TypeScript API

```ts
// modules/upi-intent/index.ts
export type UpiApp = { packageName: string; label: string; iconBase64?: string };

export type UpiResult = {
  status: 'SUCCESS' | 'FAILURE' | 'SUBMITTED' | 'UNKNOWN'; // UNKNOWN = no data / unparseable
  txnId?: string;
  approvalRef?: string;   // ApprovalRefNo
  responseCode?: string;
  txnRef?: string;
  raw?: string;           // full response string, stored for debugging
  cancelled: boolean;     // resultCode was RESULT_CANCELED with no data
};

export function getInstalledApps(): UpiApp[];
export function pay(uri: string, packageName: string): Promise<UpiResult>;
```

## Android manifest

Android 11+ hides other apps unless we declare what we look for. Put this in the module's `android/src/main/AndroidManifest.xml`, which is merged into the app:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <queries>
    <intent>
      <action android:name="android.intent.action.VIEW" />
      <data android:scheme="upi" android:host="pay" />
    </intent>
  </queries>
</manifest>
```

## Kotlin sketch

This shows the shape. Check it against the current Expo Modules API docs, since names can shift between SDK versions.

```kotlin
package expo.modules.upiintent

import android.app.Activity
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val REQ_UPI = 4711

class UpiIntentModule : Module() {
  private var pending: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("UpiIntent")

    Function("getInstalledApps") {
      val pm = appContext.reactContext!!.packageManager
      val probe = Intent(Intent.ACTION_VIEW, Uri.parse("upi://pay"))
      pm.queryIntentActivities(probe, 0).map {
        mapOf(
          "packageName" to it.activityInfo.packageName,
          "label" to it.loadLabel(pm).toString(),
          "iconBase64" to drawableToBase64(it.loadIcon(pm)) // helper: Drawable → 96px PNG → Base64
        )
      }.distinctBy { it["packageName"] }
    }

    AsyncFunction("pay") { uri: String, packageName: String?, promise: Promise ->
      val activity = appContext.currentActivity
        ?: return@AsyncFunction promise.reject("E_NO_ACTIVITY", "No activity", null)
      if (pending != null) {
        return@AsyncFunction promise.reject("E_BUSY", "A payment is already in progress", null)
      }
      val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
        if (packageName != null) setPackage(packageName)
      }
      pending = promise
      try {
        val toStart = if (packageName == null) Intent.createChooser(intent, "Pay with") else intent
        activity.startActivityForResult(toStart, REQ_UPI)
      } catch (e: Exception) {
        pending = null
        promise.reject("E_NO_UPI_APP", "No UPI app could handle this", e)
      }
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQ_UPI) return@OnActivityResult
      val p = pending ?: return@OnActivityResult
      pending = null
      val raw = payload.data?.getStringExtra("response")
        ?: payload.data?.extras?.keySet()?.joinToString("&") { k -> "$k=${payload.data?.extras?.get(k)}" }
      p.resolve(mapOf(
        "raw" to raw,
        "cancelled" to (payload.resultCode == Activity.RESULT_CANCELED && raw.isNullOrEmpty())
      ))
    }
  }
}
```

Parse the response in TypeScript (below), not Kotlin, so it is unit-testable. The TS `pay()` wrapper calls native, then runs `parseUpiResponse(raw)` and returns a `UpiResult`.

**If Android kills our app while the user is in the UPI app,** the promise is lost. That is why the transaction is saved as `pending` first: on app start and on `AppState` → `active`, if the newest transaction is `pending` and under 30 minutes old, route to `/pay/confirm`.

## Known package names

| App | Package |
|---|---|
| Google Pay | `com.google.android.apps.nbu.paisa.user` |
| PhonePe | `com.phonepe.app` |
| Paytm | `net.one97.paytm` |
| BHIM | `in.org.npci.upiapp` |

Use these only for nicer labels and ordering. Always discover real installed apps with `getInstalledApps()`.

## Parsing a scanned QR (`src/features/pay/upiUri.ts`)

```ts
export type ParsedUpi = {
  rawUri: string;
  pa: string; pn?: string; am?: string; cu?: string;
  tn?: string; tr?: string; mc?: string; sign?: string;
};

const VPA = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}$/;

export function parseUpiUri(text: string): ParsedUpi | null {
  const raw = text.trim();
  if (!/^upi:\/\/pay\?/i.test(raw)) return null;
  const params = new URLSearchParams(raw.slice(raw.indexOf('?') + 1));
  const get = (k: string) => {
    for (const [key, v] of params) if (key.toLowerCase() === k) return v.trim() || undefined;
    return undefined;
  };
  const pa = get('pa');
  if (!pa || !VPA.test(pa)) return null;
  const cu = get('cu');
  if (cu && cu.toUpperCase() !== 'INR') return null;
  const am = get('am');
  if (am && !(Number(am) > 0)) return null;
  return { rawUri: raw, pa, pn: get('pn'), am, cu, tn: get('tn'), tr: get('tr'), mc: get('mc'), sign: get('sign') };
}

export const amountToPaise = (am: string) => Math.round(Number(am) * 100);
```

## Building the URI to pay

```ts
export function buildPayUri(d: ParsedUpi, amountPaise: number, note?: string): string {
  // Merchant QR with an amount or signature: send it unchanged.
  if (d.am || d.sign) return d.rawUri;
  const q = new URLSearchParams({
    pa: d.pa,
    ...(d.pn ? { pn: d.pn } : {}),
    am: (amountPaise / 100).toFixed(2),
    cu: 'INR',
    ...(note ? { tn: note.slice(0, 50) } : {}),
  });
  return `upi://pay?${q.toString()}`;
}
```

## Parsing the app's response (`src/features/pay/upiResponse.ts`)

UPI apps return something like `txnId=AXI123&responseCode=00&Status=SUCCESS&txnRef=ORD-88213&ApprovalRefNo=428100931742`. Key casing varies between apps, and some return nothing.

```ts
export function parseUpiResponse(raw?: string | null) {
  if (!raw) return { status: 'UNKNOWN' as const, raw };
  const map: Record<string, string> = {};
  for (const part of raw.split('&')) {
    const i = part.indexOf('=');
    if (i > 0) map[part.slice(0, i).trim().toLowerCase()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  const s = (map['status'] ?? '').toUpperCase();
  const status = s === 'SUCCESS' || s === 'FAILURE' || s === 'SUBMITTED' ? s : 'UNKNOWN';
  return {
    status, raw,
    txnId: map['txnid'], approvalRef: map['approvalrefno'],
    responseCode: map['responsecode'], txnRef: map['txnref'],
  } as const;
}
```

Routing after `pay()` resolves: `SUCCESS` → Success. `FAILURE`, `SUBMITTED`, `UNKNOWN` or cancelled → Confirm.

## Testing

There is no UPI sandbox for intents. Test with ₹1 payments between your own accounts on a real Android device with Google Pay and PhonePe installed. Log every `raw` response during development: apps differ, and some block intent payments to personal VPAs or cap their amounts. Unit-test both parsers with real captured strings.

## Spike results (M5, 2026-10-07)

Tested on one Android phone with GPay, PhonePe, Paytm, iMobile (ICICI) and WhatsApp installed.

| Case | Google Pay | iMobile | WhatsApp |
|---|---|---|---|
| Personal VPA, `upi://pay` intent, no `am` | Blocked: "payment amount exceeds the limit". Returns `raw: null, resultCode: 0` (→ `cancelled`, `UNKNOWN`) | not tested | not tested |
| Personal VPA, `upi://pay` intent, `am=1.00` | Blocked, same message and result | not tested | not tested |
| Personal VPA, same link as a **QR image** shared to the app (`shareQrImage`) | **Works**: GPay reads it like a scanned QR, ₹1 paid. No result comes back | — | — |
| Merchant QR, unchanged | not tested yet (test merchants don't show in GPay) | | |

PhonePe and Paytm also refuse the personal-VPA intent.

What we do with it (`isMerchantCode` in `src/features/pay/mcc.ts`):
- Personal payee (no `mc` or `0000`), any app → `shareQrImage(uri, pkg)`, then straight to Confirm (no result is returned).
- Everything else → `pay()` intent as above.
- If an app ever refuses the image share: fall back to copying the UPI ID and opening the app (not built yet).

This relies on undocumented Google Pay behaviour; recheck it after Google Pay updates. To do: confirm the QR image share in PhonePe and Paytm, a real merchant QR in each app, and a cancel in each app.

### Coming back to Kakeibo

All three launches (`pay`, `shareQrImage`, `shareFile`) use `startActivityForResult` from our current activity, **without** `FLAG_ACTIVITY_NEW_TASK`. The other app runs in our task, so when the user finishes or presses back, Android returns them straight to Kakeibo and `OnActivityResult` resolves the promise. With `NEW_TASK` the UPI app lived in its own task and the user had to switch back by hand. Personal (QR-share) payments then go to Confirm; merchant intents route by their result.

## iOS: per-app deep links, QR-share as the personal-payee fallback

iOS has no `startActivityForResult` equivalent and no `queryIntentActivities`-style enumeration, so `modules/upi-intent` is Android-native (`expo-module.config.json` still says `"platforms": ["android"]`) with a pure-TS fallback in `index.ts` for iOS:

- **`getInstalledApps()`** returns a fixed list — Google Pay, PhonePe, Paytm, BHIM — unconditionally. There's no way to check which are actually installed without `canOpenURL` + an `LSApplicationQueriesSchemes` allowlist, so this skips that: picking an app that isn't installed just fails to open, same as any dead deep link, and `/pay/choose-app`'s existing error toast covers it. (Android's "known package names" table is the same kind of unverified list, just used for labels/ordering there instead of the open itself.)
- **`payRaw(uri, packageName)`** (merchant QR path) rewrites the generic `upi://pay?...` link to that app's own scheme — `gpay://upi/pay?...`, `phonepe://upi/pay?...`, etc — and opens it with `Linking.openURL`. The `gpay://upi/pay` shape is confirmed by Google's own iOS integration guide (same query params as the Android intent, just the scheme swapped); the same shape for the others is the common convention in third-party UPI deep-link guides, not an official spec, so recheck it if an app stops responding. No result callback either way, so this resolves immediately with `{ raw: null, resultCode: 0, cancelled: false }` — `parseUpiResponse(null)` is `UNKNOWN`, so this already lands on Confirm, same as rule 2 intends.
- **`shareQrImage(uri, packageName)`** (personal-payee path — the actual "same workaround as Android" the QR-share trick relies on): renders `uri` as a QR PNG and opens the system share sheet with it via `expo-sharing`, instead of Android's `ACTION_SEND` targeted at one package. The user picks the UPI app from the sheet themselves (iOS has no way to pre-target it, so the app picked on `/pay/choose-app` is only used for `payRaw`, not this path); the chosen app then reads the shared PNG like a scanned QR, same as Android.
- **`shareFile(text, fileName, mimeType)`** (CSV export): writes to `expo-file-system`'s cache dir and opens the same `expo-sharing` share sheet.

### Rendering the QR (`src/features/pay/qrExport.tsx`)

There's no native QR-encode API on iOS, so QR generation happens in JS: `react-native-qrcode-svg` builds the matrix and renders it with `react-native-svg` (already a dependency for the donut chart), and that library's own `toDataURL()` rasterizes the SVG to a base64 PNG — no extra native code needed. Because this requires mounting a component (not just calling a function), a single `<QrExportHost />` is mounted once at the app root (`src/app/_layout.tsx`, next to `<ToastHost />`) and `generateQrPng(text)` / `writeQrPngFile(text)` talk to it through a one-request-at-a-time module-level queue — the same pattern already used for toasts. **It must stay off-screen** (absolutely positioned outside the viewport, `pointerEvents="none"`): it exists only to rasterize, and rendering it in normal flow puts an 800px QR code over the whole app until the request resolves.

### What's not ported

- No real "is this app installed" check or "last used app" ordering on iOS — the four rows always show; one that isn't installed just fails silently into the error toast.
- No activity-result parsing on iOS ever (`UpiResult.status` is always `UNKNOWN` there) — every iOS payment goes to Confirm, never straight to Success.
- Needs a development build on iOS too (`npx expo run:ios`); Expo Go can't load `expo-sharing`'s native module or the custom Android module.

### Testing

Same as Android: there's no sandbox. Test ₹1 payments on a real iOS device with Google Pay/PhonePe installed, confirm the share sheet actually offers them for a PNG, and confirm they read the shared QR the same way they read a scanned one.
