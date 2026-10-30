import { create } from 'zustand';

// Spec: docs/toasts.md.
export type ToastVariant = 'success' | 'error' | 'info' | 'action' | 'pending';
export type DismissedBy = 'timeout' | 'tap' | 'swipe' | 'action' | 'replaced';

export type ToastOptions = {
  variant: ToastVariant;
  title: string;
  subtitle?: string;
  categoryColor?: string; // fill for info / action
  action?: { label: string; onPress: () => void };
  durationMs?: number; // overrides the variant hold
  onDismiss?: (by: DismissedBy) => void;
};

export type Toast = ToastOptions & { id: string; leaving?: DismissedBy };

export const HOLD_MS: Record<ToastVariant, number> = {
  success: 3000,
  error: 5000,
  info: 3000,
  action: 6000,
  pending: 3000,
};
/** Screen reader on: longer holds so the action stays reachable. */
export const SCREEN_READER_EXTRA_MS = 3000;

export const holdMs = (t: ToastOptions, screenReader: boolean) =>
  (t.durationMs ?? HOLD_MS[t.variant]) + (screenReader ? SCREEN_READER_EXTRA_MS : 0);

/** Time left on the bar after a pause at `progress` (0–1). */
export const remainingMs = (hold: number, progress: number) =>
  Math.max(0, hold * (1 - Math.min(1, Math.max(0, progress))));

type Store = {
  current: Toast | null;
  next: Toast | null; // at most one waiting replacement
  show: (opts: ToastOptions) => string;
  /** Starts the exit of the visible toast (or of `id` if it is the visible one). */
  dismiss: (id?: string, by?: DismissedBy) => void;
  /** Called by ToastHost when the exit animation ends: reports onDismiss once, shows `next`. */
  finish: (id: string) => void;
};

let seq = 0;

export const useToastStore = create<Store>((set, get) => ({
  current: null,
  next: null,
  show: (opts) => {
    const t: Toast = { ...opts, id: String(++seq) };
    const { current } = get();
    if (!current) set({ current: t });
    // One at a time: the visible toast exits fast, then this one enters.
    else set({ current: { ...current, leaving: current.leaving ?? 'replaced' }, next: t });
    return t.id;
  },
  dismiss: (id, by = 'tap') => {
    const { current } = get();
    if (!current || current.leaving || (id && id !== current.id)) return;
    set({ current: { ...current, leaving: by } });
  },
  finish: (id) => {
    const { current, next } = get();
    if (current?.id !== id) return;
    set({ current: next, next: null });
    current.onDismiss?.(current.leaving ?? 'timeout');
  },
}));

/** Call from anywhere: `toast.show({ variant: 'success', title: 'Profile updated' })`. */
export const toast = {
  show: (opts: ToastOptions) => useToastStore.getState().show(opts),
  dismiss: (id?: string) => useToastStore.getState().dismiss(id, 'tap'),
};

/**
 * Runs an async UI action; if it throws, shows an error toast instead of failing silently.
 * The message is generic in release builds (rule 9: no payment data in logs or toasts).
 */
export async function tryOrToast(title: string, run: () => Promise<unknown>) {
  try {
    await run();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (__DEV__) console.error(`[${title}]`, e);
    toast.show({ variant: 'error', title, subtitle: __DEV__ ? message : 'Please try again.' });
  }
}
