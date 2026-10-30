import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Clock } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InfoCard, InfoRow, StatusCircle } from '@/components/receipt/Receipt';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useTxn } from '@/db/provider';
import { draftFromTxn, usePayDraft } from '@/features/pay/draft';
import { parseUpiResponse } from '@/features/pay/upiResponse';
import { formatPaise } from '@/lib/money';
import { useTokens } from '@/lib/use-tokens';

export default function Failed() {
  const t = useTokens();
  const { id } = useLocalSearchParams<{ id: string }>();
  const clearDraft = usePayDraft((s) => s.clear);
  const txn = useTxn(id);
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, []);
  if (!txn) return <SafeAreaView className="flex-1 bg-bg" />;

  const app = txn.upiApp ?? 'Your UPI app';
  const payee = (txn.payeeName ?? txn.payeeVpa).split(',')[0];
  const reported = parseUpiResponse(txn.upiResponseRaw);
  const ref = txn.upiApprovalRef ?? txn.upiTxnId;
  const why =
    txn.failReason === 'user_cancelled'
      ? `You cancelled this ${formatPaise(txn.amountPaise)} payment to ${payee}.`
      : txn.failReason === 'user_marked'
        ? `You marked this ${formatPaise(txn.amountPaise)} payment to ${payee} as failed.`
        : `${app} reported this ${formatPaise(txn.amountPaise)} payment to ${payee} as failed.`;
  // Try again = new transaction row from the same payment; the failed one stays in history.
  // Rebuilt from the saved row, so it also works after the app was killed (in-memory draft lost).
  const retryDraft = draftFromTxn(txn);
  const retry = (choose: boolean) => {
    usePayDraft.setState({ draft: retryDraft });
    router.replace({ pathname: '/pay/choose-app', params: choose ? { choose: '1' } : {} });
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="gap-5 px-5 pt-20 pb-6">
        <View className="items-center gap-3">
          <StatusCircle ok={false} />
          <Text className="mt-3 text-center font-extrabold text-[34px] leading-[40px]">
            Payment didn&apos;t go through
          </Text>
          <Text className="text-center text-base leading-6 text-muted">
            {why}
            {ref ? ' If your account shows a debit, use the reference below with your bank.' : ''}
          </Text>
        </View>
        <InfoCard>
          {txn.upiResponseRaw ? (
            <InfoRow label={`Status from ${app}`}>{reported.status}</InfoRow>
          ) : null}
          {ref ? <InfoRow label="UPI reference">{ref}</InfoRow> : null}
          <InfoRow label="Saved in history as" last>
            <Text className="font-semibold text-bad-text">Failed</Text>
          </InfoRow>
        </InfoCard>
        <View className="flex-row gap-3 px-1">
          <Clock size={14} strokeWidth={1.8} color={t.muted} style={{ marginTop: 3 }} />
          <Text className="flex-1 text-muted">
            No reply from the UPI app? The payment is kept as pending and rechecked when you reopen
            it.
          </Text>
        </View>
      </ScrollView>
      <View className="gap-3 px-5 pb-4">
        {retryDraft && (
          <>
            <Button onPress={() => retry(false)}>
              <Text>Try again</Text>
            </Button>
            <Button variant="outline" onPress={() => retry(true)}>
              <Text>Pay with another app</Text>
            </Button>
          </>
        )}
        <Button
          variant={retryDraft ? 'ghost' : 'outline'}
          onPress={() => {
            clearDraft();
            router.dismissTo('/');
          }}
        >
          <Text>Done</Text>
        </Button>
      </View>
    </SafeAreaView>
  );
}
