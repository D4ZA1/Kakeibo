import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryGrid } from '@/components/CategoryGrid';
import { Text } from '@/components/ui/text';
import { useCategories, useDb, useTxn } from '@/db/provider';
import { recategorize } from '@/features/pay/payment';
import { toast } from '@/features/toast/toast';
import { formatPaise } from '@/lib/money';

/** Bottom sheet: change a saved payment's category, with Undo in a toast. */
export default function ChangeCategory() {
  const db = useDb();
  const { id } = useLocalSearchParams<{ id: string }>();
  const txn = useTxn(id);
  const { list: categories, cat } = useCategories();

  const pick = async (categoryId: string) => {
    if (!txn) return;
    router.back();
    if (categoryId === txn.categoryId) return;
    const previous = await recategorize(db, txn.id, categoryId);
    const moved = cat(categoryId);
    toast.show({
      variant: 'action',
      title: `Moved to ${moved?.name}`,
      subtitle: `${txn.payeeName ?? txn.payeeVpa}, ${formatPaise(txn.amountPaise)}`,
      categoryColor: moved?.color,
      action: previous
        ? { label: 'Undo', onPress: () => recategorize(db, txn.id, previous) }
        : undefined,
    });
  };

  return (
    <View className="flex-1 justify-end bg-scrim">
      <Pressable className="flex-1" accessibilityLabel="Close" onPress={() => router.back()} />
      <SafeAreaView edges={['bottom']} className="rounded-t-[32px] bg-surface px-5 pb-4">
        <View className="mb-5 mt-3 h-1 w-10 self-center rounded-pill bg-outline" />
        <Text className="mb-4 font-bold text-[24px]">Change category</Text>
        {txn && (
          <CategoryGrid
            categories={categories}
            selected={txn.categoryId}
            onSelect={pick}
            tileBg="bg-surface-2"
          />
        )}
      </SafeAreaView>
    </View>
  );
}
