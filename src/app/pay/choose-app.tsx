import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getInstalledApps, type UpiApp } from '@/../modules/upi-intent';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { getSetting, setSetting } from '@/db/client';
import { useCategories, useDb } from '@/db/provider';
import { usePayDraft } from '@/features/pay/draft';
import { startPayment } from '@/features/pay/flow';
import { tryOrToast } from '@/features/toast/toast';
import { formatPaise } from '@/lib/money';
import { useTokens } from '@/lib/use-tokens';
import { cn } from '@/lib/utils';

const GPAY_STORE = 'market://details?id=com.google.android.apps.nbu.paisa.user';

export default function ChooseApp() {
  const t = useTokens();
  const db = useDb();
  const d = usePayDraft((s) => s.draft);
  const { cat } = useCategories();
  const [apps] = useState(getInstalledApps);
  const [picked, setPicked] = useState<string>();
  const [lastUsed, setLastUsed] = useState<string>();
  const [always, setAlways] = useState(false);
  const [busy, setBusy] = useState(false);
  // ?choose=1 (from "Pay with another app") always shows the sheet.
  const { choose } = useLocalSearchParams<{ choose?: string }>();

  const open = (app: UpiApp, alwaysUse: boolean) =>
    tryOrToast("Couldn't start the payment", async () => {
      if (!d || busy) return;
      setBusy(true);
      try {
        await Promise.all([
          setSetting(db, 'preferredUpiApp', app.packageName),
          setSetting(db, 'alwaysUseUpiApp', alwaysUse ? '1' : '0'),
        ]);
        const { id, result } = await startPayment(db, d, app);
        router.replace('/pay/waiting');
        const outcome = await result;
        router.replace({
          pathname: outcome === 'success' ? '/pay/success' : '/pay/confirm',
          params: { id },
        });
      } finally {
        setBusy(false);
      }
    });

  useEffect(() => {
    Promise.all([getSetting(db, 'preferredUpiApp'), getSetting(db, 'alwaysUseUpiApp')]).then(
      ([pkg, alwaysUse]) => {
        const preferred = apps.find((a) => a.packageName === pkg);
        setLastUsed(preferred?.packageName);
        setPicked((p) => p ?? preferred?.packageName ?? apps[0]?.packageName);
        setAlways(alwaysUse === '1');
        // "Always use {app}": skip the sheet.
        if (preferred && alwaysUse === '1' && !choose) open(preferred, true);
      },
    );
    // Runs once per opening of the sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!d?.amountPaise) return null;
  const app = apps.find((a) => a.packageName === picked);
  const category = cat(d.categoryId);

  return (
    <View className="flex-1 justify-end bg-scrim">
      <Pressable className="flex-1" accessibilityLabel="Close" onPress={() => router.back()} />
      <SafeAreaView edges={['bottom']} className="rounded-t-[32px] bg-surface px-5 pb-4">
        <View className="mb-5 mt-3 h-1 w-10 self-center rounded-pill bg-outline" />
        <Text className="font-bold text-[24px]">Pay {formatPaise(d.amountPaise)} with</Text>
        <Text className="mb-4 mt-1 text-muted">
          To {d.payeeName ?? d.payeeVpa}. Tagged {category?.name}.
        </Text>

        {apps.length === 0 ? (
          <View className="gap-3 py-2">
            <Text className="text-base">No UPI app is installed on this phone.</Text>
            <Button variant="outline" onPress={() => Linking.openURL(GPAY_STORE)}>
              <Text>Get Google Pay</Text>
            </Button>
          </View>
        ) : (
          apps.map((a) => {
            const on = a.packageName === picked;
            return (
              <Pressable
                key={a.packageName}
                role="radio"
                aria-checked={on}
                onPress={() => setPicked(a.packageName)}
                className={cn(
                  'h-16 flex-row items-center gap-3 rounded-[20px] px-[14px]',
                  on && 'bg-surface-2',
                )}
              >
                {a.iconBase64 ? (
                  <Image
                    source={{ uri: `data:image/png;base64,${a.iconBase64}` }}
                    style={{ width: 40, height: 40, borderRadius: 12 }}
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <View className="h-10 w-10 items-center justify-center rounded-[12px] bg-primary">
                    <Text className="font-bold text-on-primary">{a.label[0]}</Text>
                  </View>
                )}
                <View className="flex-1">
                  <Text className="font-semibold text-base">{a.label}</Text>
                  {a.packageName === lastUsed && (
                    <Text className="text-[13px] text-muted">Last used</Text>
                  )}
                </View>
                <View
                  className={cn(
                    'h-6 w-6 items-center justify-center rounded-full border-[1.5px]',
                    on ? 'border-primary bg-primary' : 'border-outline',
                  )}
                >
                  {on && <View className="h-2.5 w-2.5 rounded-full bg-on-primary" />}
                </View>
              </Pressable>
            );
          })
        )}

        {app && (
          <>
            <Pressable
              role="checkbox"
              aria-checked={always}
              onPress={() => setAlways(!always)}
              className="mt-3 h-11 flex-row items-center gap-3"
            >
              <View
                className={cn(
                  'h-5 w-5 items-center justify-center rounded-[4px] border-[1.5px]',
                  always ? 'border-primary bg-primary' : 'border-outline',
                )}
              >
                {always && <Check size={14} strokeWidth={1.8} color={t['on-primary']} />}
              </View>
              <Text className="text-muted">Always use {app.label}</Text>
            </Pressable>
            <Button className="mt-2" disabled={busy} onPress={() => open(app, always)}>
              <Text>Open {app.label}</Text>
            </Button>
          </>
        )}
      </SafeAreaView>
    </View>
  );
}
