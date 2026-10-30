import { router } from 'expo-router';
import { User } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Field } from '@/components/auth/Field';
import { PhotoAvatar } from '@/components/auth/PhotoAvatar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { setSetting } from '@/db/client';
import { useDb } from '@/db/provider';

// Bump when the notice below changes; M8 records consent per version.
const CONSENT_VERSION = '1';

// ponytail: plain-language placeholder until the M8 privacy notice (DPDP Rules 2025) is written.
const NOTICE = [
  'Kakeibo keeps your payments (who you paid, how much, when, your notes and categories) and your first name on this phone, encrypted.',
  'We use them only to show your spending. Nothing leaves the phone unless you turn on backup later.',
  'Payments happen in your UPI app. We never see your PIN or your bank details.',
  'You can export or delete everything from Settings at any time.',
];

export default function Welcome() {
  const db = useDb();
  const [name, setName] = useState('');
  const firstName = name.trim();

  const start = async () => {
    await setSetting(db, 'firstName', firstName);
    await setSetting(db, 'consentVersion', CONSENT_VERSION);
    router.replace('/');
  };

  return (
    <SafeAreaView className="flex-1 bg-bg pb-4">
      <ScrollView
        contentContainerClassName="gap-6 px-5 pb-6 pt-10"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-2">
          <Text className="font-extrabold text-[34px]">Welcome</Text>
          <Text className="text-[17px] text-muted">
            One quick thing and you&apos;re ready to scan.
          </Text>
        </View>
        <PhotoAvatar name={firstName || '?'} />
        <Field
          label="Your first name"
          icon={User}
          value={name}
          onChangeText={setName}
          maxLength={40}
          autoCapitalize="words"
          autoComplete="given-name"
          returnKeyType="done"
        />
        <View className="gap-2 rounded-card bg-surface p-5">
          <Text className="font-bold">Your data</Text>
          {NOTICE.map((line) => (
            <Text key={line} className="text-muted">
              • {line}
            </Text>
          ))}
        </View>
      </ScrollView>
      <View className="px-5">
        <Button disabled={!firstName} onPress={start}>
          <Text>Agree and get started</Text>
        </Button>
      </View>
    </SafeAreaView>
  );
}
