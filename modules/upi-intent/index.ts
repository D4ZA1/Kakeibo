import { requireOptionalNativeModule } from 'expo';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { AppState, Linking, Platform } from 'react-native';

import { writeQrPngFile } from '@/features/pay/qrExport';

export type UpiApp = { packageName: string; label: string; iconBase64?: string };
export type RawUpiResult = { raw: string | null; resultCode: number; cancelled: boolean };

type Native = {
  getInstalledApps(): UpiApp[];
  pay(uri: string, packageName: string): Promise<RawUpiResult>;
  shareQrImage(uri: string, packageName: string): Promise<void>;
  shareFile(text: string, fileName: string, mimeType: string): Promise<void>;
};

// Android only; null on iOS (no app enumeration or activity-result there).
const native = requireOptionalNativeModule<Native>('UpiIntent');

/**
 * iOS has no `queryIntentActivities`-style enumeration, so there's no real way to know which of
 * these are installed. Listed unconditionally (like Android's "known package names" table, used
 * only for labels/ordering there); picking an app that isn't installed just fails to open, same as
 * any broken deep link, and `choose-app`'s existing error toast covers it.
 */
const IOS_APPS: UpiApp[] = [
  { packageName: 'gpay', label: 'Google Pay' },
  { packageName: 'phonepe', label: 'PhonePe' },
  { packageName: 'paytmmp', label: 'Paytm' },
  { packageName: 'bhim', label: 'BHIM' },
];

export const getInstalledApps = (): UpiApp[] =>
  native?.getInstalledApps() ?? (Platform.OS === 'ios' ? IOS_APPS : []);

/**
 * Per-app iOS deep link: same `pa`/`pn`/`am`/... query as the generic `upi://pay`, with the app's
 * own scheme in front (confirmed for Google Pay's `gpay://upi/pay?...` by Google's own iOS
 * integration guide; the same `<scheme>://upi/pay` shape is the common convention other UPI apps
 * use too, but that part isn't officially documented — recheck if an app stops responding to it).
 */
function iosAppUri(uri: string, packageName: string): string {
  const known = IOS_APPS.some((a) => a.packageName === packageName);
  if (!known) return uri;
  const query = uri.slice(uri.indexOf('?'));
  return `${packageName}://upi/pay${query}`;
}

/**
 * Opens the UPI app with the link. On iOS there's no activity-result callback, so this resolves
 * immediately with an unknown result — the caller already treats that as "go to Confirm" (rule 2).
 */
export function payRaw(uri: string, packageName: string): Promise<RawUpiResult> {
  if (native) return native.pay(uri, packageName);
  if (Platform.OS === 'ios') {
    return Linking.openURL(iosAppUri(uri, packageName)).then(() => ({
      raw: null,
      resultCode: 0,
      cancelled: false,
    }));
  }
  return Promise.reject(new Error('UPI payments need Android'));
}

/**
 * Shares `uri` as a QR image to the app, which reads it like a scanned QR. Resolves when the user is
 * back in Kakeibo (the app returns no payment result).
 *
 * iOS has no "send to this exact app" intent, and GPay isn't a share target there, and it refuses
 * direct links to personal payees ("exceeded limit"). So we save the QR to Photos and open the app,
 * where the user scans it from their gallery; once they're back, the QR is deleted (iOS asks first).
 */
export async function shareQrImage(uri: string, packageName: string): Promise<void> {
  if (native) return native.shareQrImage(uri, packageName);
  if (Platform.OS !== 'ios') return Promise.reject(new Error('UPI payments need Android'));
  const file = await writeQrPngFile(uri);
  // Read-write, not add-only: deleting the QR afterwards needs it.
  const { granted } = await MediaLibrary.requestPermissionsAsync(false);
  if (!granted) throw new Error('Photos access denied');
  const asset = await MediaLibrary.createAssetAsync(file);
  try {
    await Linking.openURL(`${packageName}://`);
    await backInApp();
  } finally {
    // The user may decline iOS's delete prompt; the QR just stays in Photos then.
    await MediaLibrary.deleteAssetsAsync(asset).catch(() => {});
  }
}

/** Resolves the next time Kakeibo comes back to the foreground. */
const backInApp = () =>
  new Promise<void>((resolve) => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      sub.remove();
      resolve();
    });
  });

/** Writes `text` to a temporary file and opens the share sheet; resolves when it closes. */
export async function shareFile(text: string, fileName: string, mimeType: string): Promise<void> {
  if (native) return native.shareFile(text, fileName, mimeType);
  if (Platform.OS !== 'ios') return Promise.reject(new Error('Sharing a file needs Android'));
  const { cacheDirectory, writeAsStringAsync } = await import('expo-file-system/legacy');
  const uri = `${cacheDirectory}${fileName}`;
  await writeAsStringAsync(uri, text);
  await Sharing.shareAsync(uri, { mimeType });
}
