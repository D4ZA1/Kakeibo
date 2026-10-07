import { randomUUID } from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { payRaw, shareQrImage, type UpiApp } from '@/../modules/upi-intent';
import { useDb } from '@/db/provider';
import type { Db } from '@/db/sqlite';
import { usePayDraft, type PayDraft } from '@/features/pay/draft';
import { isMerchantCode } from '@/features/pay/mcc';
import { applyAppResult, resumablePending, savePending } from '@/features/pay/payment';
import { parseUpiResponse } from '@/features/pay/upiResponse';
import { buildPayUri, parseUpiUri } from '@/features/pay/upiUri';
import { formatPaise } from '@/lib/money';

export type Outcome = 'success' | 'confirm' | 'waiting';

/**
 * Saves the payment as pending, then hands it to the UPI app. Merchant QRs go as an intent and
 * resolve with the app's result; personal payees go as a shared QR image and return 'waiting'
 * (no result comes back, so Waiting sends the user to Confirm when they return).
 */
export async function startPayment(db: Db, draft: PayDraft, app: UpiApp) {
  const qr = parseUpiUri(draft.rawUri);
  if (!qr || !draft.amountPaise) throw new Error('Draft has no payable link');
  const id = randomUUID();
  const payUri = buildPayUri(qr, draft.amountPaise, draft.note);
  await savePending(db, { id, draft, payUri, upiApp: app.label });
  usePayDraft.getState().update({ txnId: id, upiApp: app.label });

  const result: Promise<Outcome> = isMerchantCode(draft.merchantCode)
    ? payRaw(payUri, app.packageName)
        .then((r) => applyAppResult(db, id, parseUpiResponse(r.raw)))
        .then(
          (ok) => (ok ? 'success' : 'confirm'),
          () => 'confirm',
        )
    : Promise.resolve(shareQrImage(payUri, app.packageName) ? 'waiting' : 'confirm');
  return { id, result };
}

const REMINDERS = 'payment-reminders';

// "Ask me later" ids, so the resume check doesn't immediately reopen them this session.
const askedLater = new Set<string>();

export async function askLater(id: string, payee: string, amountPaise: number) {
  askedLater.add(id);
  // Android 13+ only shows the permission prompt once a channel exists.
  await Notifications.setNotificationChannelAsync(REMINDERS, {
    name: 'Payment reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  const { granted } = await Notifications.requestPermissionsAsync();
  if (!granted) return;
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: 'Did your payment go through?',
      body: `${formatPaise(amountPaise)} to ${payee} is still pending.`,
      data: { txnId: id },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 30 * 60,
      channelId: REMINDERS,
    },
  });
}

/** A payment got an answer: drop its reminder. */
export const settled = (id: string) => Notifications.cancelScheduledNotificationAsync(id);

const openConfirm = (id: string) => router.push({ pathname: '/pay/confirm', params: { id } });

/**
 * On launch and whenever the app returns: if the newest payment is still pending and recent and no
 * payment flow is running (the draft is gone, e.g. Android killed us), reopen it on Confirm.
 * Also opens Confirm when the reminder notification is tapped.
 */
export function useResumePending() {
  const db = useDb();
  useEffect(() => {
    const check = async () => {
      if (usePayDraft.getState().draft) return;
      const id = await resumablePending(db);
      if (id && !askedLater.has(id)) openConfirm(id);
    };
    check();
    const app = AppState.addEventListener('change', (s) => s === 'active' && check());
    const tap = Notifications.addNotificationResponseReceivedListener((r) => {
      const id = r.notification.request.content.data?.txnId;
      if (typeof id === 'string') openConfirm(id);
    });
    return () => {
      app.remove();
      tap.remove();
    };
  }, [db]);
}
