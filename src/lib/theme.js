// Single source for the colour tokens in docs/design-tokens.md.
// tailwind.config.js turns each themed key into `var(--key)`; the root layout supplies the
// values with NativeWind's vars(), and useTokens() reads the same palette for JS-only props.
const themes = {
  dark: {
    bg: '#1F1F1F',
    surface: '#2A2A2A',
    'surface-2': '#343434',
    line: '#3D3D3D',
    outline: '#5A5A5A',
    'outline-2': '#6A6A6A',
    'chip-border': '#4A4A4A',
    text: '#F2F2F2',
    'text-2': '#D9D9D9',
    muted: '#A6A6A6',
    faint: '#8C8C8C',
    future: '#555555',
    primary: '#F2F2F2',
    'on-primary': '#1F1F1F',
    'ok-text': '#A8E39A',
    'bad-text': '#F08A80',
    'up-text': '#F2B183',
    prev: '#5C5C5C',
    'toggle-on': '#A8E39A',
    'toggle-off': '#4A4A4A',
    'toggle-knob-on': '#1F1F1F',
    'toggle-knob-off': '#BDBDBD',
    scrim: 'rgba(0,0,0,0.55)',
    toast: '#3A3A3A', // two steps above surface, so it reads over cards
    'toast-border': 'rgba(255,255,255,0.14)', // the edge a shadow can't draw on near-black
    'toast-shadow': 'rgba(0,0,0,0.6)',
  },
  light: {
    bg: '#F0F0EC',
    surface: '#FFFFFF',
    'surface-2': '#E6E6E1',
    line: '#E1E1DC',
    outline: '#A3A3A3',
    'outline-2': '#9A9A9A',
    'chip-border': '#C9C9C4',
    text: '#1A1A1A',
    'text-2': '#333333',
    muted: '#5E5E5E',
    faint: '#767676',
    future: '#BDBDB8',
    primary: '#1A1A1A',
    'on-primary': '#FFFFFF',
    'ok-text': '#2E7D32',
    'bad-text': '#C62828',
    'up-text': '#B4561F',
    prev: '#C9C9C4',
    'toggle-on': '#2E7D32',
    'toggle-off': '#CFCFCA',
    'toggle-knob-on': '#FFFFFF',
    'toggle-knob-off': '#FFFFFF',
    scrim: 'rgba(0,0,0,0.35)',
    toast: '#FFFFFF',
    'toast-border': 'rgba(0,0,0,0.10)', // separates it from white cards
    'toast-shadow': 'rgba(20,20,20,0.22)',
  },
};

// Same in both themes.
const fixed = { ink: '#1F1F1F', ok: '#A8E39A', bad: '#F08A80', camera: '#141414' };

module.exports = { themes, fixed };
