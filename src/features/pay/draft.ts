import { create } from 'zustand';

import type { Transaction } from '@/db/types';
import { amountToPaise, parseUpiUri, type ParsedUpi } from '@/features/pay/upiUri';

/** The in-progress payment from scan to result (docs/spec.md, "Payment draft"). */
export type PayDraft = {
  rawUri: string;
  payeeVpa: string;
  payeeName?: string;
  amountPaise?: number;
  amountLocked: boolean;
  merchantCode?: string;
  txnRef?: string;
  qrNote?: string;
  categoryId?: string;
  note?: string;
  saveRule?: boolean; // "Always tag", written once the payment is saved
  txnId?: string; // our DB id once saved as pending
  upiApp?: string; // label of the app it was sent to
};

type Store = {
  draft: PayDraft | null;
  start: (qr: ParsedUpi) => PayDraft;
  update: (patch: Partial<PayDraft>) => void;
  clear: () => void;
};

export const usePayDraft = create<Store>((set) => ({
  draft: null,
  start: (qr) => {
    const draft: PayDraft = {
      rawUri: qr.rawUri,
      payeeVpa: qr.pa,
      payeeName: qr.pn,
      amountPaise: qr.am ? amountToPaise(qr.am) : undefined,
      amountLocked: Boolean(qr.am),
      merchantCode: qr.mc,
      txnRef: qr.tr,
      qrNote: qr.tn,
    };
    set({ draft });
    return draft;
  },
  update: (patch) => set((s) => (s.draft ? { draft: { ...s.draft, ...patch } } : s)),
  clear: () => set({ draft: null }),
}));

/**
 * A draft for paying a saved transaction again ("Try again" after the app was killed and the
 * in-memory draft is gone). `rawUri` is the link we sent, so it is paid the same way as before.
 */
export function draftFromTxn(txn: Transaction): PayDraft | null {
  if (!parseUpiUri(txn.rawUri)) return null;
  return {
    rawUri: txn.rawUri,
    payeeVpa: txn.payeeVpa,
    payeeName: txn.payeeName ?? undefined,
    amountPaise: txn.amountPaise,
    amountLocked: true,
    merchantCode: txn.merchantCode ?? undefined,
    txnRef: txn.qrTxnRef ?? undefined,
    categoryId: txn.categoryId,
    note: txn.note ?? undefined,
  };
}
