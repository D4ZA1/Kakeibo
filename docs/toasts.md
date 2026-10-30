# Toasts

Short, non-blocking messages that confirm an action or report a problem. The toast is a bar attached to the left edge of the screen: it slides out, a progress bar along its bottom loads, then it slides back into the edge.

Reference images: `docs/design/Toasts (dark).png` and `docs/design/Toasts (light).png`. Colors use the tokens in `docs/design-tokens.md` (`toast`, `toast-shadow` added for this).

Implementation: `src/features/toast/toast.ts` (store, holds, `toast.show`) and `src/features/toast/ToastHost.tsx` (rendering, motion, gestures), mounted inside `AppLock` in `src/app/_layout.tsx` so the lock screen covers it.

## Anatomy

| Part | Spec |
|---|---|
| Container | Width `min(344, screenWidth − 46)`, min height 68. Flush to the left screen edge. Radius `0 34 34 0` (flat left, pill right). Padding 12 top/bottom, 20 left, 14 right. Gap 12. |
| Background | `toast` token: dark `#3A3A3A` (two steps above `surface`), light `#FFFFFF` |
| Border | 1 px `toast-border` on top, right and bottom (none on the flat left edge): dark `rgba(255,255,255,0.14)`, light `rgba(0,0,0,0.10)`. Added after device testing: without it the toast blended into cards in both themes. |
| Shadow | `toast-shadow` token: dark `0 10 28 rgba(0,0,0,0.6)`, light `0 10 28 rgba(20,20,20,0.22)`; Android elevation 12 |
| Icon circle | 40×40, variant fill, 20 px icon at 2.4 stroke in `ink` (pending: `text` icon on `surface-2`) |
| Title | 15 / 700, `text`, one line |
| Subtitle | 13 / 400, `muted`, one line, ellipsis |
| Action (optional) | Pill, height 36, padding 0 14, `primary` fill, `on-primary` text 14 / 700 |
| Progress bar | 3 px tall along the bottom edge, clipped by the container radius, fills left → right |
| Position | Top of the screen, 64 px below the top safe-area inset. Never covers the tab bar or the Pay button. |

## Variants

| Variant | Icon fill | Icon | Bar color | Hold | Example |
|---|---|---|---|---|---|
| `success` | `ok` | check | `ok-text` | 3 s | "₹5,900 paid" / "Apple Store, saved to Tech" |
| `error` | `bad` | x | `bad-text` | 5 s | "Payment failed" / "Nothing was counted. Try again." |
| `info` | a category color, else `surface-2` | tag | the category color in dark; `text-2` in light (pastels are too faint on white) | 3 s | "Always tagged as Tech" |
| `action` | category or `ok` | pencil | `up-text` | 6 s | "Moved to Food" + **Undo** |
| `pending` | `surface-2` | clock | `muted` | 3 s | "Saved as pending" / "We'll ask you again in 30 min" |

## Motion

| Phase | Duration | Movement | Easing |
|---|---|---|---|
| Enter | 320 ms | `translateX` from `-(width + 24)` to 0, overshooting about 6 px | spring: `withSpring(0, { damping: 16, stiffness: 220, mass: 0.8 })`, or timing with `Easing.bezier(0.2, 0.9, 0.3, 1.2)` |
| Hold | variant hold | Progress `scaleX` 0 → 1 from the left (`transformOrigin: left`) | linear |
| Exit | 240 ms | `translateX` 0 → `-(width + 24)` | `Easing.bezier(0.5, 0, 0.9, 0.4)` |
| Replace | 160 ms exit | When a new toast arrives, the current one exits fast, then the new one enters | |

Build with **react-native-reanimated** and **react-native-gesture-handler**. Animate only `transform` and `opacity` so it runs on the UI thread.

## Behavior

- **Only on screen.** A toast raised while the app is in the background (a share target or UPI app that reports back before the user returns) waits and plays when the app is active again.
- **One at a time.** A new toast replaces the visible one (fast exit, then enter). No stacking.
- **Pause on touch.** While a finger is down on the toast, the progress bar and the timer pause; they resume on release.
- **Dismiss.** Tap the body or swipe left (a pan past 40 px or a fling velocity below −500) to exit early. Swiping right does nothing; rubber-band it back.
- **Action.** Tapping the action runs its callback, then dismisses. The toast reports `dismissedBy: 'timeout' | 'tap' | 'swipe' | 'action' | 'replaced'` to `onDismiss`.
- **Reduced motion** (`AccessibilityInfo.isReduceMotionEnabled` / Reanimated `useReducedMotion`): fade opacity 0 → 1 in place (200 ms) and back, no slide, and hide the progress bar. Holds stay the same.
- **Screen readers.** Announce `title, subtitle` with `AccessibilityInfo.announceForAccessibility`. Errors use `accessibilityLiveRegion="assertive"`, others `polite`. When a screen reader is on, add 3 s to every hold so actions stay reachable.
- **Haptics.** `success` → `Haptics.notificationAsync(Success)`, `error` → `Error`, others none.
- **Keyboard.** Position is top-anchored, so the keyboard never hides it.

## API

Mount a single `<ToastHost />` in `app/_layout.tsx`, above the navigator and inside the safe-area provider (the root is a `GestureHandlerRootView`). Call it from anywhere:

```ts
// src/features/toast/toast.ts
type ToastVariant = 'success' | 'error' | 'info' | 'action' | 'pending';

type ToastOptions = {
  variant: ToastVariant;
  title: string;
  subtitle?: string;
  categoryColor?: string;            // for info / action fills
  action?: { label: string; onPress: () => void };
  durationMs?: number;               // overrides the variant hold
  onDismiss?: (by: 'timeout' | 'tap' | 'swipe' | 'action' | 'replaced') => void;
};

export const toast = {
  show(opts: ToastOptions): string,  // returns an id
  dismiss(id?: string): void,
};
```

State lives in a small zustand store (`current`, and `next`: at most one waiting replacement; a newer `show` replaces it).

## Where the app uses toasts

| Trigger | Variant | Text |
|---|---|---|
| Category changed on Success or a transaction (pencil on the receipt → `/pay/category` sheet) | `action` | "Moved to {Category}" / "{Payee}, ₹X" + Undo |
| "Always tag" saved (when the payment is saved) | `info` | "Always tagged as {Category}" / "{Payee} skips tagging next time" |
| "Not sure, ask me later" on Confirm | `pending` | "Saved as pending" / "We'll ask you again in 30 min" |
| Profile saved | `success` | "Profile updated" |
| CSV exported | `success` | "Exported {n} payments" |
| Backup or sync failed (M7) | `error` | "Couldn't sync" / "We'll retry when you're online" |
| Invalid QR on Scan | not a toast | Keep the inline message on the Scan screen |
| Payment success / failure | not a toast | These have full screens |

Do not use toasts for anything the user must act on to continue; those stay on screens or sheets.

## Tests

Unit-tested in `toast.test.ts`: replacement order, only the newest replacement waits, pause/resume math (`remainingMs`), holds per variant and with a screen reader, and `onDismiss` firing once with the first reason. Not covered yet: snapshots of each variant in both themes (needs a React render test setup).
