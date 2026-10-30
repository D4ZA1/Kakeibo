import Constants from 'expo-constants';
import { reloadAppAsync } from 'expo';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import {
  ArrowLeft,
  Bell,
  CreditCard,
  Database,
  Download,
  Lock,
  Moon,
  ScanLine,
  Trash2,
} from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getInstalledApps, shareFile } from '@/../modules/upi-intent';
import { Avatar } from '@/components/Avatar';
import { SettingsGroup, SettingsRow } from '@/components/SettingsRow';
import { Text } from '@/components/ui/text';
import { setSetting, wipeDatabase, type SettingKey } from '@/db/client';
import { seedSampleMonths } from '@/db/dev-seed';
import { useDb, useLiveQuery } from '@/db/provider';
import type { Db } from '@/db/sqlite';
import { exportCsv } from '@/features/export/csv';
import { periodTotal } from '@/features/insights/queries';
import { lockAvailable, setAppLock } from '@/features/lock/lock';
import { toast, tryOrToast } from '@/features/toast/toast';
import { periodRange, previousRange } from '@/lib/dates';
import { formatPaise } from '@/lib/money';
import { useTokens } from '@/lib/use-tokens';

async function seedAndReadBack(db: Db) {
  const inserted = await seedSampleMonths(db);
  const month = periodRange('month', new Date());
  const [current, previous] = await Promise.all([
    periodTotal(db, month),
    periodTotal(db, previousRange('month', month)),
  ]);
  Alert.alert(
    'Sample data',
    `Inserted ${inserted} payments.\nThis month: ${formatPaise(current)}\nLast month: ${formatPaise(previous)}`,
  );
}

async function exportAll(db: Db) {
  const day = new Date().toISOString().slice(0, 10);
  const { csv, count } = await exportCsv(db);
  if (!shareFile(csv, `kakeibo-${day}.csv`, 'text/csv'))
    throw new Error('Share sheet did not open');
  toast.show({ variant: 'success', title: `Exported ${count} payment${count === 1 ? '' : 's'}` });
}

function confirmDeleteAll() {
  const wipe = async () => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    await wipeDatabase();
    await reloadAppAsync();
  };
  Alert.alert(
    'Delete all data?',
    'Every payment, rule and setting on this phone is deleted. Export a CSV first if you want a copy.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Are you sure?', "This can't be undone.", [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete everything', style: 'destructive', onPress: wipe },
          ]),
      },
    ],
  );
}

export default function Settings() {
  const t = useTokens();
  const db = useDb();
  const { colorScheme, setColorScheme } = useColorScheme();
  const settings = useLiveQuery(async (db) => {
    const rows = await db.selectFrom('settings').selectAll().execute();
    return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Partial<
      Record<SettingKey, string>
    >;
  }, []);
  const [canLock, setCanLock] = useState(true);
  useEffect(() => {
    lockAvailable().then(setCanLock);
  }, []);

  const s = settings ?? {};
  const preferred = getInstalledApps().find((a) => a.packageName === s.preferredUpiApp);
  const flag = (key: SettingKey, on: boolean) => setSetting(db, key, on ? '1' : '0');

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
        <Pressable
          role="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center rounded-[22px] bg-surface"
        >
          <ArrowLeft size={22} strokeWidth={1.8} color={t.text} />
        </Pressable>
        <Text className="font-semibold text-lg">Settings</Text>
        <View className="w-11" />
      </View>

      <ScrollView contentContainerClassName="gap-6 px-5 pb-10 pt-4">
        <View className="flex-row items-center gap-4 rounded-card bg-surface p-5">
          <Avatar name={s.firstName ?? ''} size={56} />
          <Text className="flex-1 font-extrabold text-[22px]">{s.firstName}</Text>
          <Pressable
            role="button"
            onPress={() => router.push('/profile/edit')}
            className="h-11 justify-center rounded-[22px] border-[1.5px] border-outline px-4"
          >
            <Text className="font-semibold">Edit</Text>
          </Pressable>
        </View>

        <SettingsGroup label="Appearance">
          <SettingsRow
            icon={Moon}
            title="Dark mode"
            subtitle="Off switches to the light theme"
            toggle={{
              value: colorScheme === 'dark',
              onChange: (on) => {
                const theme = on ? 'dark' : 'light';
                setColorScheme(theme);
                setSetting(db, 'theme', theme);
              },
            }}
          />
        </SettingsGroup>

        <SettingsGroup label="Payments">
          <SettingsRow
            icon={CreditCard}
            title="Default UPI app"
            value={preferred?.label ?? 'None yet'}
          />
          <SettingsRow
            icon={ScanLine}
            title="Choose app every time"
            subtitle="Show the app list before each payment"
            toggle={{
              value: s.alwaysUseUpiApp !== '1',
              onChange: (on) => flag('alwaysUseUpiApp', !on),
            }}
          />
        </SettingsGroup>

        <SettingsGroup label="Security">
          <SettingsRow
            icon={Lock}
            title="App lock"
            subtitle={
              canLock
                ? 'Fingerprint, face or phone PIN after a minute away'
                : 'Set a screen lock on your phone first'
            }
            toggle={{
              value: s.appLock === '1',
              onChange: (on) => {
                if (on && !canLock) {
                  Alert.alert(
                    'No screen lock',
                    'App lock uses your phone’s fingerprint, face or PIN. Set one in Android settings first.',
                  );
                  return;
                }
                setAppLock(db, on);
              },
            }}
          />
        </SettingsGroup>

        <SettingsGroup label="Notifications">
          <SettingsRow
            icon={Bell}
            title="Pending payment reminders"
            subtitle="After “Not sure, ask me later”"
            toggle={{ value: s.reminders !== '0', onChange: (on) => flag('reminders', on) }}
          />
        </SettingsGroup>

        <SettingsGroup label="Your data">
          <SettingsRow
            icon={Download}
            title="Export as CSV"
            onPress={() => tryOrToast("Couldn't export", () => exportAll(db))}
          />
          <SettingsRow icon={Trash2} title="Delete all data" onPress={confirmDeleteAll} />
        </SettingsGroup>

        {__DEV__ && (
          <SettingsGroup label="Developer">
            <SettingsRow
              icon={Database}
              title="Seed sample months"
              onPress={() => seedAndReadBack(db)}
            />
            <SettingsRow
              icon={CreditCard}
              title="UPI intent test"
              onPress={() => router.push('/dev/upi-test')}
            />
          </SettingsGroup>
        )}

        <Text className="text-center text-[13px] text-muted">
          Version {Constants.expoConfig?.version}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
