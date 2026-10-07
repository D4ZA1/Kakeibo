import { requireOptionalNativeModule } from 'expo';

export type UpiApp = { packageName: string; label: string; iconBase64?: string };
export type RawUpiResult = { raw: string | null; resultCode: number; cancelled: boolean };

type Native = {
  getInstalledApps(): UpiApp[];
  pay(uri: string, packageName: string): Promise<RawUpiResult>;
  shareQrImage(uri: string, packageName: string): boolean;
};

// Android only; null on iOS (payments are Android-only, rule 5).
const native = requireOptionalNativeModule<Native>('UpiIntent');

export const getInstalledApps = (): UpiApp[] => native?.getInstalledApps() ?? [];

/** Opens the UPI app with the link and resolves when it returns. */
export function payRaw(uri: string, packageName: string): Promise<RawUpiResult> {
  if (!native) return Promise.reject(new Error('UPI payments need Android'));
  return native.pay(uri, packageName);
}

/** Shares `uri` as a QR image to the app, which reads it like a scanned QR. No result comes back. */
export const shareQrImage = (uri: string, packageName: string): boolean =>
  native?.shareQrImage(uri, packageName) ?? false;
