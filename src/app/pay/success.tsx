import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { categoryOf, Receipt } from '@/components/receipt/Receipt';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useCategories, useTxn } from '@/db/provider';
import { usePayDraft } from '@/features/pay/draft';

const groupRef = (ref: string) => ref.replace(/(\d{4})(?=\d)/g, '$1 ');

export default function Success() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { list: categories } = useCategories();
  const clearDraft = usePayDraft((s) => s.clear);
  const txn = useTxn(id);
  if (!txn || !categories.length) return <SafeAreaView className="flex-1 bg-bg" />;
  const ref = txn.upiApprovalRef ?? txn.upiTxnId;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="px-5 pt-2 pb-6">
        <Receipt
          status="success"
          amountPaise={txn.amountPaise}
          payeeName={txn.payeeName ?? txn.payeeVpa}
          category={categoryOf(txn.categoryId, categories)}
          note={txn.note ?? undefined}
          upiRef={ref ? groupRef(ref) : undefined}
          app={txn.upiApp ?? undefined}
          when={new Date(txn.createdAt)}
        />
      </ScrollView>
      <View className="px-5 pb-4">
        <Button
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
