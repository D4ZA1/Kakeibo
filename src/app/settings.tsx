import Constants from 'expo-constants';
import { router } from 'expo-router';
import {
  ArrowLeft,
  Bell,
  ChartPie,
  CircleHelp,
  Cloud,
  CreditCard,
  Database,
  Download,
  FileText,
  Lock,
  LogOut,
  Moon,
  ScanLine,
  Trash2,
  TrendingUp,
} from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { SettingsGroup, SettingsRow } from '@/components/SettingsRow';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { setSetting } from '@/db/client';
import { seedSampleMonths } from '@/db/dev-seed';
import { useDb } from '@/db/provider';
import { SAMPLE_PROFILE } from '@/db/sample';
import type { Db } from '@/db/sqlite';
import { SEED_CATEGORIES } from '@/db/seed';
import { periodTotal } from '@/features/insights/queries';
import { periodRange, previousRange } from '@/lib/dates';
import { formatPaise } from '@/lib/money';
import { useTokens } from '@/lib/use-tokens';

// ponytail: only Dark mode does anything; the other switches are local state until their milestones
// (theme persistence lands with the settings table in M1).
function useDemoToggle(initial: boolean) {
  const [value, onChange] = useState(initial);
  return { value, onChange };
}

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

export default function Settings() {
  const t = useTokens();
  const db = useDb();
  const { colorScheme, setColorScheme } = useColorScheme();
  const chooseEveryTime = useDemoToggle(false);
  const backup = useDemoToggle(true);
  const appLock = useDemoToggle(true);
  const reminders = useDemoToggle(true);
  const monthly = useDemoToggle(true);

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
        <Button variant="icon" accessibilityLabel="Back" onPress={() => router.back()}>
          <ArrowLeft size={22} strokeWidth={1.8} color={t.text} />
        </Button>
        <Text className="font-semibold text-lg">Settings</Text>
        <View className="w-11" />
      </View>

      <ScrollView contentContainerClassName="gap-6 px-5 pb-10 pt-4">
        <View className="flex-row items-center gap-4 rounded-card bg-surface p-5">
          <Avatar name={SAMPLE_PROFILE.name} size={56} />
          <View className="flex-1">
            <Text className="font-extrabold text-[22px]">{SAMPLE_PROFILE.name}</Text>
            <Text className="text-muted">{SAMPLE_PROFILE.phone}</Text>
            <Text className="text-muted">{SAMPLE_PROFILE.email}</Text>
          </View>
          <Pressable
            role="button"
            onPress={() => router.push('/profile/edit')}
            className="h-9 justify-center rounded-[18px] border-[1.5px] border-outline px-4"
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
          <SettingsRow icon={CreditCard} title="Default UPI app" value="Google Pay" />
          <SettingsRow
            icon={ScanLine}
            title="Choose app every time"
            subtitle="Show the app list before each payment"
            toggle={chooseEveryTime}
          />
        </SettingsGroup>

        <SettingsGroup label="Categories & data">
          <SettingsRow
            icon={ChartPie}
            title="Manage categories"
            value={String(SEED_CATEGORIES.length)}
          />
          <SettingsRow
            icon={Cloud}
            title="Backup & sync"
            subtitle="Last synced 2 min ago"
            toggle={backup}
          />
          <SettingsRow icon={Download} title="Export as CSV" />
        </SettingsGroup>

        <SettingsGroup label="Security">
          <SettingsRow
            icon={Lock}
            title="App lock"
            subtitle="Fingerprint or phone PIN"
            toggle={appLock}
          />
        </SettingsGroup>

        <SettingsGroup label="Notifications">
          <SettingsRow icon={Bell} title="Pending payment reminders" toggle={reminders} />
          <SettingsRow icon={TrendingUp} title="Monthly summary" toggle={monthly} />
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

        <SettingsGroup label="About">
          <SettingsRow icon={CircleHelp} title="Help & feedback" />
          <SettingsRow icon={FileText} title="Privacy policy" />
          <SettingsRow icon={FileText} title="Terms of use" />
        </SettingsGroup>

        <Button variant="outline" onPress={() => router.replace('/auth/login')}>
          <LogOut size={18} strokeWidth={1.8} color={t.text} />
          <Text>Log out</Text>
        </Button>
        <Pressable role="button" className="h-11 flex-row items-center justify-center gap-2">
          <Trash2 size={18} strokeWidth={1.8} color={t['bad-text']} />
          <Text className="font-semibold text-bad-text">Delete account and data</Text>
        </Pressable>
        <Text className="text-center text-[13px] text-muted">
          Version {Constants.expoConfig?.version}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
