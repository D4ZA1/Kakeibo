// Dev-only harness: probe undocumented links (GPay's scanner, WhatsApp Pay via upi://) on iOS.
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { usePayDraft } from '@/features/pay/draft';
import { useTokens } from '@/lib/use-tokens';

// Guesses: Google doesn't document the link behind GPay's scan widget.
const CANDIDATES = [
  'gpay://scan',
  'gpay://qr',
  'gpay://scanner',
  'gpay://upi/scan',
  'gpay://scan_qr',
  'gpay://scanqr',
  'tez://scan',
  'tez://upi/scan',
];

type Run = { link: string; out: string };

export default function UpiTest() {
  const t = useTokens();
  const [runs, setRuns] = useState<Run[]>([]);
  const draft = usePayDraft((s) => s.draft);
  // On iOS, upi:// goes to whichever app claims it (WhatsApp here). Add `&am=1.00&cu=INR` to test.
  const [uri, setUri] = useState(draft?.rawUri ?? 'upi://pay?pa=you@okaxis&pn=Me&am=1.00&cu=INR');

  const open = (link: string) => {
    const record = (out: string) => {
      console.log(`[upi-test] ${link}\n${out}`);
      setRuns((rs) => [{ link, out }, ...rs]);
    };
    Linking.openURL(link).then(
      () => record('opened'),
      (e) => record(`ERROR ${e instanceof Error ? e.message : String(e)}`),
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-row items-center gap-2 px-5 pt-2">
        <Button variant="icon" accessibilityLabel="Back" onPress={() => router.back()}>
          <ArrowLeft size={22} strokeWidth={1.8} color={t.text} />
        </Button>
        <Text className="font-bold text-lg">GPay scanner link test</Text>
      </View>
      <ScrollView contentContainerClassName="gap-4 px-5 pb-10 pt-4">
        <Text className="text-muted">
          Tap one, note which screen opens, come back, try the next.
        </Text>
        <TextInput
          value={uri}
          onChangeText={setUri}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Link"
          className="min-h-[88px] rounded-card bg-surface p-4 font-sans text-sm text-text"
        />
        <Button onPress={() => open(uri.trim())}>
          <Text>Open link as-is</Text>
        </Button>
        {CANDIDATES.map((link) => (
          <Button key={link} variant="outline" onPress={() => open(link)}>
            <Text>{link}</Text>
          </Button>
        ))}
        {runs.map((r, i) => (
          <View key={i} className="gap-1 rounded-card bg-surface p-4">
            <Text selectable className="font-bold">
              {r.link}
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
