export type ParsedUpi = {
  rawUri: string;
  pa: string;
  pn?: string;
  am?: string;
  cu?: string;
  tn?: string;
  tr?: string;
  mc?: string;
  sign?: string;
};

export const VPA = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}$/;

/** A scanned QR's text → its UPI fields, or null if it isn't a payable INR `upi://pay` link. */
export function parseUpiUri(text: string): ParsedUpi | null {
  const raw = text.trim();
  if (!/^upi:\/\/pay\?/i.test(raw)) return null;
  const params = new URLSearchParams(raw.slice(raw.indexOf('?') + 1));
  // Keys are case-insensitive in the wild (PA=, Am=).
  const get = (k: string) => {
    for (const [key, v] of params) if (key.toLowerCase() === k) return v.trim() || undefined;
    return undefined;
  };
  const pa = get('pa');
  if (!pa || !VPA.test(pa)) return null;
  const cu = get('cu');
  if (cu && cu.toUpperCase() !== 'INR') return null;
  const am = get('am');
  if (am && !(Number(am) > 0)) return null;
  const sign = get('sign');
  // A signed link can't be changed, so without its own amount there's no way to pay what the user types.
  if (sign && !am) return null;
  return {
    rawUri: raw,
    pa,
    pn: get('pn'),
    am,
    cu,
    tn: get('tn'),
    tr: get('tr'),
    mc: get('mc'),
    sign,
  };
}

/**
 * An Indian mobile number → 10-digit normalized phone ('9876543210'), or null if it isn't one.
 */
export function normalizeIndianPhone(phone: string): string | null {
  const d = phone.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

/**
 * An Indian mobile number → its NPCI "UPI number" address (`9876543210@upi`), or null if it isn't one.
 * shortcut: assumes the payee has a UPI number linked (default in GPay/PhonePe); the UPI app shows
 * the resolved name before paying, so a wrong guess fails visibly rather than paying a stranger.
 */
export function upiNumberVpa(phone: string): string | null {
  const d = normalizeIndianPhone(phone);
  return d ? `${d}@upi` : null;
}

export const amountToPaise = (am: string) => Math.round(Number(am) * 100);

/** The link handed to the UPI app. Merchant QRs (amount or signature) go through unchanged. */
export function buildPayUri(d: ParsedUpi, amountPaise: number, note?: string): string {
  if (d.am || d.sign) return d.rawUri;
  const q: [string, string][] = [
    ['pa', d.pa],
    ...(d.pn ? [['pn', d.pn] as [string, string]] : []),
    ['am', (amountPaise / 100).toFixed(2)],
    ['cu', 'INR'],
    ...(note ? [['tn', note.slice(0, 50)] as [string, string]] : []),
  ];
  // encodeURIComponent, not URLSearchParams: some UPI apps show a '+' for a space literally.
  return `upi://pay?${q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}
