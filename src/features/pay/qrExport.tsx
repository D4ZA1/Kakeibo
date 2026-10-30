import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

/**
 * iOS has no native QR-encode API, so this renders one off-screen with react-native-qrcode-svg
 * (SVG via the react-native-svg we already depend on) and rasterizes it with that library's own
 * `toDataURL`. One request in flight at a time; mount `<QrExportHost />` once, at the app root.
 */
type Request = { text: string; resolve: (base64: string) => void; reject: (e: unknown) => void };
let request: Request | null = null;
let setHostText: ((text: string | null) => void) | null = null;

export function generateQrPng(text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    request = { text, resolve, reject };
    setHostText?.(text);
  });
}

type SvgRef = { toDataURL: (cb: (base64?: string) => void) => void };

export function QrExportHost() {
  const [text, setText] = useState<string | null>(null);
  const svgRef = useRef<SvgRef | null>(null);
  setHostText = setText;

  useEffect(() => {
    if (!text) return;
    const done = (fn: () => void) => {
      setText(null);
      fn();
      request = null;
    };
    // The native view may not be created or laid out yet: toDataURL can throw, or hand back
    // undefined until iOS has drawn it. Retry each frame for up to ~1s.
    let raf = 0;
    let tries = 0;
    const attempt = () => {
      try {
        svgRef.current?.toDataURL((base64?: string) => {
          if (base64) done(() => request?.resolve(base64));
          else if (++tries < 60) raf = requestAnimationFrame(attempt);
          else done(() => request?.reject(new Error('QR image came back empty')));
        });
      } catch (e) {
        if (++tries < 60) raf = requestAnimationFrame(attempt);
        else done(() => request?.reject(e));
      }
    };
    raf = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(raf);
  }, [text]);

  if (!text) return null;
  return (
    // Off-screen and non-interactive: this view exists only to rasterize, never to be seen.
    <View pointerEvents="none" style={{ position: 'absolute', top: -9999, left: -9999 }}>
      {/* Scanners reading from an image need a white border (quiet zone) and black-on-white. */}
      <QRCode
        value={text}
        size={800}
        quietZone={80}
        color="black"
        backgroundColor="white"
        getRef={(ref: SvgRef | null) => (svgRef.current = ref)}
      />
    </View>
  );
}

/** Writes a freshly generated QR for `text` to a cache file and returns its file:// uri. */
export async function writeQrPngFile(text: string): Promise<string> {
  const base64 = await generateQrPng(text);
  const dir = `${FileSystem.cacheDirectory}upi-qr/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const uri = `${dir}pay.png`;
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  return uri;
}
