import { CameraView, scanFromURLAsync, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { launchImageLibraryAsync } from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, AtSign, Flashlight, Image as ImageIcon, ScanLine } from 'lucide-react-native';
import { vars } from 'nativewind';
import { useCallback, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { usePayDraft } from '@/features/pay/draft';
import { parseUpiUri } from '@/features/pay/upiUri';
import { themes } from '@/lib/theme';

// The scanner is always dark (camera UI), whatever the app theme.
const dark = themes.dark;
const darkVars = vars(dark);
const corner = 'absolute h-14 w-14 border-text';

export default function Scan() {
  const [torch, setTorch] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);
  // Barcode callbacks fire many times per second; this stops a second read while we navigate.
  const busy = useRef(false);
  const start = usePayDraft((s) => s.start);
  const clearDraft = usePayDraft((s) => s.clear);

  useFocusEffect(
    useCallback(() => {
      busy.current = false;
      setInvalid(false);
      setFocused(true);
      return () => {
        setFocused(false);
        setTorch(false);
      };
    }, []),
  );

  const handle = (text: string) => {
    if (busy.current) return;
    busy.current = true;
    const qr = parseUpiUri(text);
    if (!qr) return setInvalid(true); // stays busy until "Scan to pay" re-arms
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const draft = start(qr);
    router.push(draft.amountLocked ? '/pay/details' : '/pay/amount');
  };

  const rearm = () => {
    busy.current = false;
    setInvalid(false);
  };

  const fromGallery = async () => {
    const picked = await launchImageLibraryAsync({ mediaTypes: ['images'] });
    if (picked.canceled) return;
    const [code] = await scanFromURLAsync(picked.assets[0].uri, ['qr']).catch(() => []);
    rearm();
    handle(code?.data ?? '');
  };

  const enterUpiId = () => {
    clearDraft();
    router.push('/pay/amount');
  };

  const granted = permission?.granted;

  return (
    <SafeAreaView className="flex-1 bg-camera px-5 pt-4" style={darkVars} edges={['top']}>
      <View className="flex-row items-center justify-between">
        <Button
          variant="icon"
          accessibilityLabel="Back"
          onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
        >
          <ArrowLeft size={22} strokeWidth={1.8} color={dark.text} />
        </Button>
        <Text className="font-bold text-lg">Scan any UPI QR</Text>
        <Button
          variant="icon"
          className={torch ? 'bg-text' : undefined}
          accessibilityLabel={torch ? 'Turn flashlight off' : 'Turn flashlight on'}
          onPress={() => setTorch(!torch)}
        >
          <Flashlight size={20} strokeWidth={1.8} color={torch ? dark['on-primary'] : dark.text} />
        </Button>
      </View>

      <View className="flex-1 items-center justify-center gap-4">
        {granted && focused && (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={invalid ? undefined : ({ data }) => handle(data)}
          />
        )}
        <View className="aspect-square w-2/3 items-center justify-center">
          <View
            className={`${corner} left-0 top-0 rounded-tl-[22px] border-l-[3px] border-t-[3px]`}
          />
          <View
            className={`${corner} right-0 top-0 rounded-tr-[22px] border-r-[3px] border-t-[3px]`}
          />
          <View
            className={`${corner} bottom-0 left-0 rounded-bl-[22px] border-b-[3px] border-l-[3px]`}
          />
          <View
            className={`${corner} bottom-0 right-0 rounded-br-[22px] border-b-[3px] border-r-[3px]`}
          />
          {granted ? (
            <View className="h-[3px] w-5/6 rounded-pill bg-ok" />
          ) : (
            permission && (
              <View className="items-center gap-3 px-2">
                <Text className="text-center text-muted">
                  Kakeibo needs the camera to scan UPI QR codes.
                </Text>
                <Button
                  variant="outline"
                  onPress={permission.canAskAgain ? requestPermission : Linking.openSettings}
                >
                  <Text>{permission.canAskAgain ? 'Allow camera' : 'Open settings'}</Text>
                </Button>
              </View>
            )
          )}
        </View>
        <View className="mt-6 h-9 flex-row items-center gap-2 rounded-pill bg-surface px-4">
          <View className={`h-2 w-2 rounded-full ${invalid ? 'bg-bad' : 'bg-ok'}`} />
          <Text className="font-semibold text-sm">
            {invalid ? "This QR isn't a UPI payment code" : 'Looking for a QR code'}
          </Text>
        </View>
        <Text className="px-8 text-center text-muted">
          {invalid
            ? 'Tap Scan to pay to try another code.'
            : 'Shop counters, personal QRs and bills all work. Details fill in as soon as the code is read.'}
        </Text>
      </View>

      <View className="flex-row gap-3">
        <Button variant="outline" className="flex-1 px-3" onPress={fromGallery}>
          <ImageIcon size={18} strokeWidth={1.8} color={dark.text} />
          <Text>From gallery</Text>
        </Button>
        <Button variant="outline" className="flex-1 px-3" onPress={enterUpiId}>
          <AtSign size={18} strokeWidth={1.8} color={dark.text} />
          <Text>Enter UPI ID</Text>
        </Button>
      </View>
      <Button className="mb-4 mt-3" onPress={rearm}>
        <ScanLine size={20} strokeWidth={1.8} color={dark['on-primary']} />
        <Text>Scan to pay</Text>
      </Button>
    </SafeAreaView>
  );
}
