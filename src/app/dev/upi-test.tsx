// Dev-only harness for the M5 spike: send a upi:// link to each installed UPI app and record what comes back.
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getInstalledApps, payRaw, shareQrImage } from '@/../modules/upi-intent';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { usePayDraft } from '@/features/pay/draft';
import { isMerchantCode } from '@/features/pay/mcc';
import { parseUpiUri } from '@/features/pay/upiUri';
import { parseUpiResponse } from '@/features/pay/upiResponse';
import { useTokens } from '@/lib/use-tokens';

type Run = { app: string; uri: string; out: string };

export default function UpiTest() {
  const t = useTokens();
  const draft = usePayDraft((s) => s.draft);
  const [uri, setUri] = useState(draft?.rawUri ?? 'upi://pay?pa=you@okaxis&pn=Me&am=1.00&cu=INR');
  const [runs, setRuns] = useState<Run[]>([]);
  const apps = getInstalledApps();
  const link = uri.trim();
  const qr = parseUpiUri(link);
  const asQr = qr ? !isMerchantCode(qr.mc) : false;

  const record = (app: string, out: string) => {
    console.log(`[upi-test] ${app}\n${link}\n${out}`);
    setRuns((rs) => [{ app, uri: link, out }, ...rs]);
  };

  const run = async (label: string, packageName: string) => {
    if (asQr) {
      return record(
        `${label} (QR image)`,
        shareQrImage(link, packageName) ? 'shared QR image' : 'share failed',
      );
    }
    try {
      const r = await payRaw(link, packageName);
      record(label, JSON.stringify({ ...r, parsed: parseUpiResponse(r.raw) }, null, 2));
    } catch (e) {
      record(label, `ERROR ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-row items-center gap-2 px-5 pt-2">
        <Button variant="icon" accessibilityLabel="Back" onPress={() => router.back()}>
          <ArrowLeft size={22} strokeWidth={1.8} color={t.text} />
        </Button>
        <Text className="font-bold text-lg">UPI intent test</Text>
      </View>
      <ScrollView contentContainerClassName="gap-4 px-5 pb-10 pt-4">
        <TextInput
          value={uri}
          onChangeText={setUri}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="UPI link"
          className="min-h-[88px] rounded-card bg-surface p-4 font-sans text-sm text-text"
        />
        <Text className="text-muted">
          {apps.length} UPI app{apps.length === 1 ? '' : 's'} found. Scan a QR first to prefill its
          link.
        </Text>
        {apps.map((a) => (
          <Button
            key={a.packageName}
            variant={asQr ? 'default' : 'outline'}
            onPress={() => run(a.label, a.packageName)}
          >
            <Text>
              {asQr ? 'Send QR image to' : 'Pay with'} {a.label}
            </Text>
          </Button>
        ))}
        {runs.map((r, i) => (
          <View key={i} className="gap-1 rounded-card bg-surface p-4">
            <Text className="font-bold">{r.app}</Text>
            <Text selectable className="text-xs text-muted">
              {r.uri}
            </Text>
            <Text selectable className="font-mono text-xs">
              {r.out}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
