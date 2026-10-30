# Design tokens

The app ships with two themes, **dark** and **light**. Every value below came from the design canvas. Components use semantic token names only, never raw hex, so the same component renders correctly in both themes.

Reference images: `docs/design/` holds PNG exports of every screen. Dark screens are named after their board (`1-home.png`), light ones with a `-light` suffix (`1-home-light.png`).

## Theme behavior

- Setting key `theme` in the `settings` table: `'dark' | 'light' | 'system'`. Default `'system'`.
- Settings → Appearance → **Dark mode** toggle. It shows ON when the resolved theme is dark. Flipping it saves `'dark'` or `'light'` explicitly.
- Resolve with NativeWind's `useColorScheme()` / `colorScheme.set()`; set the status bar style to match (light content on dark, dark content on light).
- **The Scan screen is always dark**, whatever the theme (camera UI). Wrap it in a forced-dark container: in NativeWind, apply the dark variables to that subtree with `vars()`.

## Semantic colors

| Token | Dark | Light | Use |
|---|---|---|---|
| `bg` | `#1F1F1F` | `#F0F0EC` | Screen background |
| `surface` | `#2A2A2A` | `#FFFFFF` | Cards, inputs, icon buttons, bottom sheet |
| `surface-2` | `#343434` | `#E6E6E1` | Selected tile, nested chips, avatar fallback |
| `line` | `#3D3D3D` | `#E1E1DC` | Dividers in cards, input borders, tab bar top border |
| `outline` | `#5A5A5A` | `#A3A3A3` | Secondary (outlined) buttons, sheet handle |
| `outline-2` | `#6A6A6A` | `#9A9A9A` | Unselected radio rings |
| `chip-border` | `#4A4A4A` | `#C9C9C4` | Unselected filter chips |
| `text` | `#F2F2F2` | `#1A1A1A` | Primary text, selected borders |
| `text-2` | `#D9D9D9` | `#333333` | Legend labels, chart values |
| `muted` | `#A6A6A6` | `#5E5E5E` | Secondary text |
| `faint` | `#8C8C8C` | `#767676` | Inactive tab icons, previous period label |
| `future` | `#555555` | `#BDBDB8` | Disabled future period in the month scroller |
| `primary` | `#F2F2F2` | `#1A1A1A` | Primary pill button, selected segment, "All" chip |
| `on-primary` | `#1F1F1F` | `#FFFFFF` | Text and icons on `primary` |
| `ink` | `#1F1F1F` | `#1F1F1F` | Text and icons on pastel fills (avatars, success/fail circles). Same in both themes. |
| `ok` | `#A8E39A` | `#A8E39A` | Success circle fill, scan line, status dots |
| `bad` | `#F08A80` | `#F08A80` | Failed circle fill |
| `ok-text` | `#A8E39A` | `#2E7D32` | Green text and icons ("Verified", spending decreases), amount cursor |
| `bad-text` | `#F08A80` | `#C62828` | Red text ("Failed" badge, Delete account) |
| `up-text` | `#F2B183` | `#B4561F` | Spending increases in Compare |
| `prev` | `#5C5C5C` | `#C9C9C4` | Previous-period bars in Compare |
| `toggle-on` | `#A8E39A` | `#2E7D32` | Switch track when on |
| `toggle-off` | `#4A4A4A` | `#CFCFCA` | Switch track when off |
| `toggle-knob-on` | `#1F1F1F` | `#FFFFFF` | Knob when on |
| `toggle-knob-off` | `#BDBDBD` | `#FFFFFF` | Knob when off |
| `scrim` | `rgba(0,0,0,0.55)` | `rgba(0,0,0,0.35)` | Behind bottom sheets |
| `toast` | `#3A3A3A` | `#FFFFFF` | Toast background (docs/toasts.md) |
| `toast-border` | `rgba(255,255,255,0.14)` | `rgba(0,0,0,0.10)` | Toast hairline edge |
| `toast-shadow` | `rgba(0,0,0,0.6)` | `rgba(20,20,20,0.22)` | Toast shadow colour |
| `camera` | `#141414` | `#141414` | Scan screen background (always dark) |

Rule of thumb: pastel colors are **fills only**. Text or icons that carry meaning use the `*-text` tokens, which are darkened in light mode for contrast.

## Category colors (same in both themes)

| Category | Hex |
|---|---|
| Food | `#F2B183` |
| Tech | `#7FD6D0` |
| Travel | `#F5A3C7` |
| Home | `#9CCBEB` |
| Services | `#E6E3A1` |
| Health | `#A8E39A` |
| Entertain. | `#B48CF0` |
| Social | `#F7D774` |
| Education | `#7FB38A` |
| Clothes | `#E07A6F` |
| Charity | `#7C84E6` |
| Other | `#8C8C8C` |

Category colors live in the `categories` table and are applied with inline `style={{ backgroundColor }}`, since they are data. Text on a category fill always uses `ink`.

## global.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #F0F0EC;
  --surface: #FFFFFF;
  --surface-2: #E6E6E1;
  --line: #E1E1DC;
  --outline: #A3A3A3;
  --outline-2: #9A9A9A;
  --chip-border: #C9C9C4;
  --text: #1A1A1A;
  --text-2: #333333;
  --muted: #5E5E5E;
  --faint: #767676;
  --future: #BDBDB8;
  --primary: #1A1A1A;
  --on-primary: #FFFFFF;
  --ok-text: #2E7D32;
  --bad-text: #C62828;
  --up-text: #B4561F;
  --prev: #C9C9C4;
  --toggle-on: #2E7D32;
  --toggle-off: #CFCFCA;
  --toggle-knob-on: #FFFFFF;
  --toggle-knob-off: #FFFFFF;
  --scrim: rgba(0, 0, 0, 0.35);
  --toast: #ffffff;
  --toast-border: rgba(0, 0, 0, 0.1);
  --toast-shadow: rgba(20, 20, 20, 0.22);
}

.dark:root {
  --bg: #1F1F1F;
  --surface: #2A2A2A;
  --surface-2: #343434;
  --line: #3D3D3D;
  --outline: #5A5A5A;
  --outline-2: #6A6A6A;
  --chip-border: #4A4A4A;
  --text: #F2F2F2;
  --text-2: #D9D9D9;
  --muted: #A6A6A6;
  --faint: #8C8C8C;
  --future: #555555;
  --primary: #F2F2F2;
  --on-primary: #1F1F1F;
  --ok-text: #A8E39A;
  --bad-text: #F08A80;
  --up-text: #F2B183;
  --prev: #5C5C5C;
  --toggle-on: #A8E39A;
  --toggle-off: #4A4A4A;
  --toggle-knob-on: #1F1F1F;
  --toggle-knob-off: #BDBDBD;
  --scrim: rgba(0, 0, 0, 0.55);
  --toast: #3a3a3a;
  --toast-border: rgba(255, 255, 255, 0.14);
  --toast-shadow: rgba(0, 0, 0, 0.6);
}
```

The exact dark selector depends on your NativeWind version (`.dark:root` in v4, or `@media (prefers-color-scheme: dark)` with a manual override). Check the NativeWind theming docs for the version you install.

React Native Reusables also reads its own variables (`--background`, `--foreground`, `--card`, `--primary`, `--primary-foreground`, `--muted-foreground`, `--border`, `--input`, `--destructive`). Point them at ours in both blocks, for example `--background: var(--bg)`, `--card: var(--surface)`, `--primary-foreground: var(--on-primary)`, `--border: var(--line)`, `--destructive: var(--bad-text)`. Check the generated `global.css` for the names your installed version uses.

## tailwind.config.js

```js
/** @type {import('tailwindcss').Config} */
const v = (name) => `var(--${name})`;

module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './features/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        'surface-2': v('surface-2'),
        line: v('line'),
        outline: v('outline'),
        'outline-2': v('outline-2'),
        'chip-border': v('chip-border'),
        text: v('text'),
        'text-2': v('text-2'),
        muted: v('muted'),
        faint: v('faint'),
        future: v('future'),
        primary: v('primary'),
        'on-primary': v('on-primary'),
        'ok-text': v('ok-text'),
        'bad-text': v('bad-text'),
        'up-text': v('up-text'),
        prev: v('prev'),
        'toggle-on': v('toggle-on'),
        'toggle-off': v('toggle-off'),
        'toggle-knob-on': v('toggle-knob-on'),
        'toggle-knob-off': v('toggle-knob-off'),
        scrim: v('scrim'),
        // theme-independent
        ink: '#1F1F1F',
        ok: '#A8E39A',
        bad: '#F08A80',
        camera: '#141414',
      },
      fontFamily: {
        sans: ['Figtree_400Regular'],
        medium: ['Figtree_500Medium'],
        semibold: ['Figtree_600SemiBold'],
        bold: ['Figtree_700Bold'],
        extrabold: ['Figtree_800ExtraBold'],
      },
      borderRadius: { pill: '9999px', card: '22px', tile: '20px' },
    },
  },
  plugins: [],
};
```

For values needed outside className (react-native-svg strokes, StatusBar, navigation theme), export the same palette from `lib/theme.ts` as `{ dark: {...}, light: {...} }` and read it with a `useTokens()` hook keyed on the resolved color scheme. Keep it in sync with `global.css`.

## Type

Font: **Figtree** (`@expo-google-fonts/figtree`), weights 400, 500, 600, 700, 800.

| Role | Size / weight | Notes |
|---|---|---|
| Hero amount | 60 / 800 | letter-spacing −2 (Details, Amount) |
| Display amount | 44–50 / 800 | letter-spacing −1.5 (Home card, Success, donut centre) |
| Screen heading | 26–34 / 800 | Login, OTP, Confirm, History title |
| Top bar title | 18 / 600 | |
| Body strong | 16 / 600 | Row titles |
| Body | 15 / 400 | |
| Caption | 13–14 / 400 | Usually `muted` |
| Section label | 13 / 700 | Upper case, letter-spacing 0.6, `muted` (Settings groups) |

## Shape and spacing

- Screen padding 20 horizontal, 16 top. Vertical gap between blocks 16–22.
- Primary button: pill, height 56, radius 28, `primary` fill, `on-primary` text, weight 700.
- Secondary button: height 52, radius 26, transparent, 1.5 px `outline` border.
- Cards: radius 22–28, `surface`. Category tiles: radius 20, 76 tall. Icon buttons: 44×44 circle on `surface`.
- Chips: height 36, radius 18. Inputs: height 52–56, radius 16, 1.5 px `line` border, `surface` fill. The focused input border is `text`.
- OTP boxes: 48×60, radius 16, the active one bordered in `text`.
- Switch: 50×30 track, 24 px knob, 3 px inset.
- Settings rows: min height 60, 36 px icon circle on `surface-2`, chevron in `faint`, rows divided by `line` inside a `surface` group card.
- Tab bar: height 88 including the bottom inset, 4 icons at 26 px, a 4 px dot under the active one, 1 px `line` top border.
- Bars and donut: pill segments with rounded caps and gaps, never touching wedges.
- Icons: 1.8 px stroke, rounded caps and joins (lucide-react-native matches this style).

## Donut drawing (react-native-svg)

One `<Circle>` per category with `strokeLinecap="round"`, rotated −90° so it starts at 12 o'clock.

```
R = 118, strokeWidth = 30, C = 2πR
gap = strokeWidth + 12          // round caps eat half the stroke on each end
usable = C − gap × segmentCount
segment length = usable × (value / total)
strokeDasharray = [length, C − length]
strokeDashoffset = −(runningStart + strokeWidth / 2)
runningStart += length + gap
```

With a single category, draw one full ring without caps.
