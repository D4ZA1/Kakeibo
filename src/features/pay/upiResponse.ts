export type UpiStatus = 'SUCCESS' | 'FAILURE' | 'SUBMITTED' | 'UNKNOWN';

export type UpiResult = {
  status: UpiStatus; // UNKNOWN = no data / unparseable
  txnId?: string;
  approvalRef?: string;
  responseCode?: string;
  txnRef?: string;
  raw?: string;
};

const decode = (v: string) => {
  try {
    return decodeURIComponent(v.replace(/\+/g, ' '));
  } catch {
    return v; // a stray '%' shouldn't lose the rest of the response
  }
};

/** "txnId=AXI1&Status=SUCCESS&ApprovalRefNo=42…" → fields. Keys are case-insensitive; empty values are dropped. */
export function parseUpiResponse(raw?: string | null): UpiResult {
  if (!raw?.trim()) return { status: 'UNKNOWN', raw: raw ?? undefined };
  const map: Record<string, string> = {};
  for (const part of raw.split('&')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const value = decode(part.slice(i + 1).trim());
    if (value && value !== 'null') map[part.slice(0, i).trim().toLowerCase()] = value;
  }
  const s = (map.status ?? '').toUpperCase();
  return {
    status: s === 'SUCCESS' || s === 'FAILURE' || s === 'SUBMITTED' ? s : 'UNKNOWN',
    txnId: map.txnid,
    approvalRef: map.approvalrefno,
    responseCode: map.responsecode,
    txnRef: map.txnref,
    raw,
  };
}
