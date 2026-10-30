import { Lock } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { getSetting } from '@/db/client';
import { useLiveQuery } from '@/db/provider';
import { authenticate, shouldRelock } from '@/features/lock/lock';
import { useTokens } from '@/lib/use-tokens';

/**
 * When app lock is on: locked at cold start and after LOCK_AFTER_MS in the background, and the
 * screen is covered while the app is in the background (app switcher thumbnail).
 */
export function AppLock({ children }: { children: ReactNode }) {
  const t = useTokens();
  const enabled = useLiveQuery(async (db) => (await getSetting(db, 'appLock')) === '1', []);
  const [locked, setLocked] = useState<boolean>();
  const [covered, setCovered] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    if (await authenticate()) setLocked(false);
  }, []);

  // Cold start: locked if the setting is on, decided once when it first loads (set during render,
  // React's pattern for state derived from a value that arrives later).
  if (enabled !== undefined && locked === undefined) setLocked(enabled);

  // Prompt as soon as the app locks.
  useEffect(() => {
    if (!locked) return;
    authenticate().then((ok) => ok && setLocked(false));
  }, [locked]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (!enabled) return;
      if (state === 'background') {
        backgroundedAt.current = Date.now();
        setCovered(true);
      } else if (state === 'active') {
        setCovered(false);
        if (shouldRelock(backgroundedAt.current, Date.now())) setLocked(true);
        backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, [enabled]);

  // Until the setting loads, show nothing rather than flash unlocked content.
  if (enabled === undefined) return <View className="flex-1 bg-bg" />;

  return (
    <View style={{ flex: 1 }}>
      {children}
      {enabled && (locked !== false || covered) && (
        <View
          style={StyleSheet.absoluteFill}
          className="items-center justify-center gap-5 bg-bg px-8"
        >
          <View className="h-16 w-16 items-center justify-center rounded-full bg-surface">
            <Lock size={28} strokeWidth={1.8} color={t.text} />
          </View>
          <Text className="font-bold text-[22px]">Kakeibo is locked</Text>
          {locked && (
            <Button onPress={unlock}>
              <Text>Unlock</Text>
            </Button>
          )}
        </View>
      )}
    </View>
  );
}
