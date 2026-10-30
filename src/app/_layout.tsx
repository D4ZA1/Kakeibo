import '@/global.css';

import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  Figtree_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/figtree';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { cssInterop, vars } from 'nativewind';
import { reloadAppAsync } from 'expo';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { isKeyMismatch, wipeDatabase } from '@/db/client';
import { DatabaseProvider } from '@/db/provider';
import { QrExportHost } from '@/features/pay/qrExport';
import { ToastHost } from '@/features/toast/ToastHost';
import { AppLock } from '@/features/lock/AppLock';
import { themes } from '@/lib/theme';
import { useThemeName } from '@/lib/use-tokens';

SplashScreen.preventAutoHideAsync();
// NativeWind only styles core RN components; register SafeAreaView so className works on it.
cssInterop(SafeAreaView, { className: 'style' });

const themeVars = { dark: vars(themes.dark), light: vars(themes.light) };

/** The database didn't open. A lost key (keystore reset) can't be recovered, so offer a fresh start. */
function OpenFailed({ error }: { error: Error }) {
  const keyLost = isKeyMismatch(error);
  return (
    <View className="flex-1 justify-center gap-3 bg-bg px-5">
      <Text className="font-bold text-lg">Couldn&apos;t open your data</Text>
      <Text className="text-muted">
        {keyLost
          ? "This phone no longer has the key that unlocks your saved payments, so they can't be read. Starting fresh deletes them and gives you an empty app."
          : error.message}
      </Text>
      {keyLost && (
        <Button
          variant="outline"
          onPress={async () => {
            await wipeDatabase();
            await reloadAppAsync();
          }}
        >
          <Text>Start fresh</Text>
        </Button>
      )}
    </View>
  );
}

export default function RootLayout() {
  const theme = useThemeName();
  const [loaded, error] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    Figtree_800ExtraBold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Theme variables must sit on a plain View: NativeWind only applies vars() to components it styles. */}
      <View style={[{ flex: 1 }, themeVars[theme]]}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <DatabaseProvider fallback={(e) => <OpenFailed error={e} />}>
          <AppLock>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: themes[theme].bg },
              }}
            />
            <ToastHost />
            <QrExportHost />
          </AppLock>
        </DatabaseProvider>
      </View>
    </GestureHandlerRootView>
  );
}
