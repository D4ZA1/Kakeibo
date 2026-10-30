import { router, useLocalSearchParams } from 'expo-router';
import { Clock } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryLabel, categoryOf, StatusCircle } from '@/components/receipt/Receipt';
import { Text } from '@/components/ui/text';
import { useCategories, useDb, useTxn } from '@/db/provider';
import { usePayDraft } from '@/features/pay/draft';
import { askLater, settled } from '@/features/pay/flow';
import { markByUser } from '@/features/pay/payment';
import { parseUpiResponse } from '@/features/pay/upiResponse';
import { toast, tryOrToast } from '@/features/toast/toast';
import { formatPaise } from '@/lib/money';
import { useTokens } from '@/lib/use-tokens';

function Answer({
  ok,
  title,
  subtitle,
  onPress,
}: {
  ok: boolean;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      role="button"
      onPress={onPress}
      className={`flex-row items-center gap-4 rounded-[30px] border-2 bg-surface px-5 py-5 active:opacity-80 ${ok ? 'border-ok' : 'border-bad'}`}
    >
      <StatusCircle ok={ok} size={56} />
      <View className="flex-1">
        <Text className="font-extrabold text-xl">{title}</Text>
        <Text className="text-muted">{subtitle}</Text>
      </View>
    </Pressable>
  );
}

export default function Confirm() {
  const t = useTokens();
  const db = useDb();
  const { list: categories } = useCategories();
  const clearDraft = usePayDraft((s) => s.clear);
  const { id } = useLocalSearchParams<{ id: string }>();
  const txn = useTxn(id);
  if (!txn || !categories.length) return <SafeAreaView className="flex-1 bg-bg" />;

  const payee = txn.payeeName ?? txn.payeeVpa;
  const app = txn.upiApp ?? 'Your UPI app';
  const category = categoryOf(txn.categoryId, categories);
  const reported = parseUpiResponse(txn.upiResponseRaw).status;
  const answer = (paid: boolean) =>
    tryOrToast("Couldn't save your answer", async () => {
      await markByUser(db, txn.id, paid);
      router.replace({ pathname: paid ? '/pay/success' : '/pay/failed', params: { id: txn.id } });
      await settled(txn.id); // dropping the reminder must not block the next screen
    });
  const later = async () => {
    await askLater(db, txn.id, payee, txn.amountPaise);
    toast.show({
      variant: 'pending',
      title: 'Saved as pending',
      subtitle: "We'll ask you again in 30 min",
    });
    clearDraft();
    router.dismissAll();
    router.replace('/');
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 gap-6 px-5 pt-16">
        <View className="flex-row items-center gap-3 rounded-card bg-surface px-3.5 py-3">
          <View
            className="h-11 w-11 items-center justify-center rounded-pill"
            style={{ backgroundColor: category.color }}
          >
            <Text className="font-bold text-ink">{payee[0]}</Text>
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-base">{payee}</Text>
            <CategoryLabel category={category} />
          </View>
          <Text className="font-extrabold text-2xl">{formatPaise(txn.amountPaise)}</Text>
        </View>
        <View className="gap-3">
          <Text className="font-extrabold text-[34px] leading-[40px]">
            Did the payment go through?
          </Text>
          <Text className="text-base leading-6 text-muted">
            {reported === 'FAILURE'
              ? `${app} reported a failure, but that isn't always right.`
              : `${app} didn't send a clear result.`}{' '}
            A quick look at its success screen or your bank SMS tells you.
          </Text>
        </View>
      </View>
      <View className="gap-3 px-5 pb-2">
        <Answer
          ok
          title="Yes, it's paid"
          subtitle={`Saved to ${category.name}`}
          onPress={() => answer(true)}
        />
        <Answer
          ok={false}
          title="No, it failed"
          subtitle="Nothing is counted in your spending"
          onPress={() => answer(false)}
        />
        <Pressable
          role="button"
          onPress={later}
          className="h-14 flex-row items-center justify-center gap-2"
        >
          <Clock size={18} strokeWidth={1.8} color={t.muted} />
          <Text className="font-semibold text-base text-muted">Not sure, ask me later</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
