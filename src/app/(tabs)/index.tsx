import { router } from 'expo-router';
import { Bell, ChevronRight, ScanLine, TrendingUp } from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { TxnRow } from '@/components/TxnRow';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { getSetting } from '@/db/client';
import { useCategories, useLiveQuery } from '@/db/provider';
import type { Db } from '@/db/sqlite';
import { periodTotal, topIncrease, totalsByCategory } from '@/features/insights/queries';
import { periodLabel, periodRange, previousRange } from '@/lib/dates';
import { formatPaise, pctChange } from '@/lib/money';
import { useTokens } from '@/lib/use-tokens';

async function homeData(db: Db) {
  const month = periodRange('month', new Date());
  const prev = previousRange('month', month);
  const [name, total, prevTotal, byCategory, riser, recent] = await Promise.all([
    getSetting(db, 'firstName'),
    periodTotal(db, month),
    periodTotal(db, prev),
    totalsByCategory(db, month),
    topIncrease(db, month, prev),
    db.selectFrom('transactions').selectAll().orderBy('createdAt', 'desc').limit(3).execute(),
  ]);
  return {
    name,
    month: periodLabel('month', month),
    prevMonth: periodLabel('month', prev),
    total,
    prevTotal,
    byCategory,
    riser,
    recent,
  };
}

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const t = useTokens();
  const data = useLiveQuery(homeData, []);
  const { cat } = useCategories();
  if (!data) return <SafeAreaView className="flex-1 bg-bg" />;
  const { name, month, prevMonth, total, prevTotal, byCategory, riser, recent } = data;
  const diff = total - prevTotal;
  const riserCat = riser && cat(riser.categoryId);
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView contentContainerClassName="gap-4 px-5 pb-8 pt-4">
        <View className="flex-row items-center justify-between">
          <Pressable
            role="button"
            accessibilityLabel="Settings"
            className="flex-row items-center gap-3"
            onPress={() => router.push('/settings')}
          >
            <Avatar name={name ?? ''} />
            <View>
              <Text className="text-muted">{greeting()}</Text>
              <Text className="font-extrabold text-[17px]">{name ?? 'Hi'}</Text>
            </View>
          </Pressable>
          <Button variant="icon" accessibilityLabel="Notifications">
            <Bell size={20} strokeWidth={1.8} color={t.text} />
          </Button>
        </View>

        {recent.length === 0 ? (
          <View className="items-center gap-2 rounded-card bg-surface p-8">
            <ScanLine size={32} strokeWidth={1.8} color={t.muted} />
            <Text className="text-center text-muted">Scan your first QR to start tracking</Text>
          </View>
        ) : (
          <Pressable
            role="button"
            className="gap-3 rounded-card bg-surface p-5 active:opacity-80"
            onPress={() => router.push('/insights')}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-muted">Spent in {month}</Text>
              <ChevronRight size={18} strokeWidth={1.8} color={t.muted} />
            </View>
            <Text className="font-extrabold text-[40px] tracking-[-1.5px]">
              {formatPaise(total)}
            </Text>
            <Text className="text-muted">
              {formatPaise(Math.abs(diff))} {diff >= 0 ? 'more' : 'less'} than {prevMonth}
            </Text>
            <View className="mt-1 h-3 flex-row gap-1">
              {byCategory.map((c) => (
                <View
                  key={c.categoryId}
                  className="rounded-pill"
                  style={{ flex: c.totalPaise, backgroundColor: cat(c.categoryId)?.color }}
                />
              ))}
            </View>
            <View className="flex-row flex-wrap gap-x-4 gap-y-1">
              {byCategory.slice(0, 4).map((c) => (
                <View key={c.categoryId} className="flex-row items-center gap-1.5">
                  <View
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: cat(c.categoryId)?.color }}
                  />
                  <Text className="text-[13px] text-muted">{cat(c.categoryId)?.name}</Text>
                </View>
              ))}
            </View>
          </Pressable>
        )}

        <Button onPress={() => router.push('/scan')}>
          <ScanLine size={20} strokeWidth={1.8} color={t['on-primary']} />
          <Text>Scan & pay</Text>
        </Button>

        {riser && riserCat && prevTotal > 0 && (
          <Pressable
            role="button"
            className="flex-row items-center gap-4 rounded-card border-[1.5px] border-line p-4 active:opacity-80"
            onPress={() => router.push('/insights/compare')}
          >
            <View
              className="h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: riserCat.color }}
            >
              <TrendingUp size={18} strokeWidth={1.8} color={t.ink} />
            </View>
            <View className="flex-1">
              <Text className="font-semibold">
                {riserCat.name} is up {pctChange(riser.current, riser.previous)}% this month
              </Text>
              <Text className="text-muted">Compare with {prevMonth}</Text>
            </View>
            <ChevronRight size={18} strokeWidth={1.8} color={t.muted} />
          </Pressable>
        )}

        <View className="mt-2 flex-row items-center justify-between">
          <Text className="font-bold text-lg">Recent</Text>
          <Pressable
            role="button"
            className="h-11 justify-center"
            onPress={() => router.push('/history')}
          >
            <Text className="text-muted">See all</Text>
          </Pressable>
        </View>
        <View>
          {recent.map((x) => (
            <TxnRow key={x.id} txn={x} category={cat(x.categoryId)} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
