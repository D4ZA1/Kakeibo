import * as LocalAuthentication from 'expo-local-authentication';

import { setSetting } from '@/db/client';
import type { Db } from '@/db/sqlite';

/** Back from the background after longer than this → locked again. */
export const LOCK_AFTER_MS = 60_000;

export const shouldRelock = (backgroundedAt: number | null, now: number) =>
  backgroundedAt !== null && now - backgroundedAt > LOCK_AFTER_MS;

/** App lock needs a screen lock (PIN, pattern, password or biometrics) on the phone. */
export async function lockAvailable() {
  return (
    (await LocalAuthentication.getEnrolledLevelAsync()) > LocalAuthentication.SecurityLevel.NONE
  );
}

/** Fingerprint/face (Class 3), falling back to the phone's PIN/pattern. */
export async function authenticate(promptMessage = 'Unlock Kakeibo') {
  const r = await LocalAuthentication.authenticateAsync({
    promptMessage,
    biometricsSecurityLevel: 'strong',
    disableDeviceFallback: false,
  });
  return r.success;
}

/** Turning the lock on or off both need the owner to authenticate first. */
export async function setAppLock(db: Db, on: boolean) {
  if (on && !(await lockAvailable())) return false;
  if (!(await authenticate(on ? 'Turn on app lock' : 'Turn off app lock'))) return false;
  await setSetting(db, 'appLock', on ? '1' : '0');
  return true;
}
