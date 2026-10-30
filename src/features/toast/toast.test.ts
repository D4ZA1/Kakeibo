import { beforeEach, expect, jest, test } from '@jest/globals';

import { holdMs, remainingMs, useToastStore } from './toast';

const store = () => useToastStore.getState();
beforeEach(() => useToastStore.setState({ current: null, next: null }));

test('shows the first toast straight away', () => {
  const id = store().show({ variant: 'success', title: 'A' });
  expect(store().current).toMatchObject({ id, title: 'A' });
  expect(store().next).toBeNull();
});

test('a new toast replaces the visible one: it leaves as "replaced", then the new one shows', () => {
  const onDismiss = jest.fn();
  const a = store().show({ variant: 'info', title: 'A', onDismiss });
  store().show({ variant: 'info', title: 'B' });
  expect(store().current).toMatchObject({ id: a, leaving: 'replaced' });
  expect(store().next?.title).toBe('B');
  store().finish(a);
  expect(onDismiss).toHaveBeenCalledWith('replaced');
  expect(store().current?.title).toBe('B');
});

test('only the newest replacement waits; earlier ones are dropped', () => {
  const a = store().show({ variant: 'info', title: 'A' });
  store().show({ variant: 'info', title: 'B' });
  store().show({ variant: 'info', title: 'C' });
  store().finish(a);
  expect(store().current?.title).toBe('C');
});

test('onDismiss fires once with the first reason given', () => {
  const onDismiss = jest.fn();
  const a = store().show({ variant: 'action', title: 'A', onDismiss });
  store().dismiss(a, 'swipe');
  store().dismiss(a, 'tap'); // ignored: already leaving
  store().finish(a);
  store().finish(a); // ignored: no longer current
  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(onDismiss).toHaveBeenCalledWith('swipe');
  expect(store().current).toBeNull();
});

test('dismissing a toast that is not visible does nothing', () => {
  store().show({ variant: 'info', title: 'A' });
  store().dismiss('nope');
  expect(store().current?.leaving).toBeUndefined();
});

test('holds per variant, overridable, +3 s with a screen reader', () => {
  expect(holdMs({ variant: 'success', title: '' }, false)).toBe(3000);
  expect(holdMs({ variant: 'error', title: '' }, false)).toBe(5000);
  expect(holdMs({ variant: 'action', title: '' }, true)).toBe(9000);
  expect(holdMs({ variant: 'info', title: '', durationMs: 1000 }, false)).toBe(1000);
});

test('pause/resume: remaining time follows the bar', () => {
  expect(remainingMs(3000, 0)).toBe(3000);
  expect(remainingMs(3000, 0.25)).toBe(2250);
  expect(remainingMs(3000, 1)).toBe(0);
  expect(remainingMs(3000, 1.2)).toBe(0);
});
