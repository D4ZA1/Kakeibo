import { router } from 'expo-router';
import { ArrowLeft, User } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Field } from '@/components/auth/Field';
import { PhotoAvatar } from '@/components/auth/PhotoAvatar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { getSetting, setSetting } from '@/db/client';
import { useDb } from '@/db/provider';
import { toast } from '@/features/toast/toast';
import { useTokens } from '@/lib/use-tokens';

export default function EditProfile() {
  const t = useTokens();
  const db = useDb();
  const [name, setName] = useState('');
  const firstName = name.trim();

  useEffect(() => {
    getSetting(db, 'firstName').then((n) => setName(n ?? ''));
  }, [db]);

  const save = async () => {
    await setSetting(db, 'firstName', firstName);
    router.back();
    toast.show({ variant: 'success', title: 'Profile updated' });
  };

  return (
    <SafeAreaView className="flex-1 bg-bg pb-4">
      <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
        <Button variant="icon" accessibilityLabel="Back" onPress={() => router.back()}>
          <ArrowLeft size={22} strokeWidth={1.8} color={t.text} />
        </Button>
        <Text className="font-semibold text-lg">Edit profile</Text>
        <View className="w-11" />
      </View>
      <ScrollView
        contentContainerClassName="gap-6 px-5 pb-6 pt-2"
        keyboardShouldPersistTaps="handled"
      >
        <PhotoAvatar name={firstName || '?'} size={104} />
        <Field label="First name" icon={User} value={name} onChangeText={setName} maxLength={40} />
      </ScrollView>
      <View className="px-5">
        <Button disabled={!firstName} onPress={save}>
          <Text>Save changes</Text>
        </Button>
      </View>
    </SafeAreaView>
  );
}
