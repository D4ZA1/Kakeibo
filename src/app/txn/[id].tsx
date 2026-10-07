import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { categoryOf, Receipt } from '@/components/receipt/Receipt';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useCategories, useTxn } from '@/db/provider';
import { useTokens } from '@/lib/use-tokens';

export default function TxnDetail() {
  const t = useTokens();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { list: categories } = useCategories();
  const txn = useTxn(id); // null = not found, undefined = loading

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="px-5 pt-2">
        <Button variant="icon" accessibilityLabel="Back" onPress={() => router.back()}>
          <ArrowLeft size={22} strokeWidth={1.8} color={t.text} />
        </Button>
      </View>
      {txn && categories.length ? (
        <ScrollView contentContainerClassName="px-5 pb-6">
          <Receipt
            status={txn.status}
            amountPaise={txn.amountPaise}
            payeeName={txn.payeeName ?? txn.payeeVpa}
            category={categoryOf(txn.categoryId, categories)}
            note={txn.note ?? undefined}
            upiRef={txn.upiApprovalRef ?? txn.upiTxnId ?? undefined}
            app={txn.upiApp ?? undefined}
            when={new Date(txn.createdAt)}
          />
        </ScrollView>
      ) : txn === null ? (
        <Text className="p-5 text-muted">Transaction not found.</Text>
      ) : null}
      {txn?.status === 'pending' ? (
        <View className="px-5 pb-4">
          <Button onPress={() => router.push({ pathname: '/pay/confirm', params: { id: txn.id } })}>
            <Text>Did it go through?</Text>
          </Button>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
