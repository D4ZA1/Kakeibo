import { expect, test } from '@jest/globals';

import { LOCK_AFTER_MS, shouldRelock } from './lock';

test('relocks only after more than a minute in the background', () => {
  expect(shouldRelock(null, 10 * LOCK_AFTER_MS)).toBe(false);
  expect(shouldRelock(1000, 1000 + LOCK_AFTER_MS)).toBe(false);
  expect(shouldRelock(1000, 1000 + LOCK_AFTER_MS + 1)).toBe(true);
});
