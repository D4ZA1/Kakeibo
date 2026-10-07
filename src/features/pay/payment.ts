import type { Db } from '@/db/sqlite';
import type { PayDraft } from '@/features/pay/draft';
import { savePayeeRule } from '@/features/pay/suggest';
import type { UpiResult } from '@/features/pay/upiResponse';

/** A pending payment younger than this is reopened on Confirm when the app comes back (rule 3). */
export const RESUME_WINDOW_MS = 30 * 60_000;

type Pending = { id: string; draft: PayDraft; payUri: string; upiApp: string; now?: number };

/** Rule 3: the row exists before the UPI app opens. Also saves "Always tag" now the payment is real. */
export async function savePending(
  db: Db,
  { id, draft, payUri, upiApp, now = Date.now() }: Pending,
) {
  if (!draft.amountPaise || !draft.categoryId)
    throw new Error('Draft needs an amount and a category');
  await db
    .insertInto('transactions')
    .values({
      id,
      payeeVpa: draft.payeeVpa,
      payeeName: draft.payeeName ?? null,
      amountPaise: draft.amountPaise,
      categoryId: draft.categoryId,
      note: draft.note ?? null,
      merchantCode: draft.merchantCode ?? null,
      qrTxnRef: draft.txnRef ?? null,
      rawUri: payUri,
      upiApp,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  if (draft.saveRule) await savePayeeRule(db, draft.payeeVpa, draft.categoryId, now);
}

/** Stores what the UPI app returned. Only an unambiguous SUCCESS settles it (rule 2); anything else stays pending for Confirm. */
export async function applyAppResult(db: Db, id: string, r: UpiResult, now = Date.now()) {
  await db
    .updateTable('transactions')
    .set({
      upiTxnId: r.txnId ?? null,
      upiApprovalRef: r.approvalRef ?? null,
      upiResponseRaw: r.raw ?? null,
      updatedAt: now,
      ...(r.status === 'SUCCESS'
        ? { status: 'success' as const, statusSource: 'app' as const }
        : {}),
    })
    .where('id', '=', id)
    .where('status', '=', 'pending')
    .execute();
  return r.status === 'SUCCESS';
}

/** The user's answer on Confirm. Only touches a payment that is still pending. */
export function markByUser(db: Db, id: string, paid: boolean, now = Date.now()) {
  return db
    .updateTable('transactions')
    .set({
      status: paid ? 'success' : 'failed',
      statusSource: 'user',
      failReason: paid ? null : 'user_marked',
      updatedAt: now,
    })
    .where('id', '=', id)
    .where('status', '=', 'pending')
    .executeTakeFirst()
    .then((r) => Number(r.numUpdatedRows) === 1);
}

/** "Cancel payment" on Waiting. */
export function cancelPayment(db: Db, id: string, now = Date.now()) {
  return db
    .updateTable('transactions')
    .set({ status: 'failed', statusSource: 'user', failReason: 'user_cancelled', updatedAt: now })
    .where('id', '=', id)
    .where('status', '=', 'pending')
    .execute();
}

/** The newest payment if it is still pending and recent: the app was likely killed mid-payment. */
export async function resumablePending(db: Db, now = Date.now()) {
  const row = await db
    .selectFrom('transactions')
    .select(['id', 'status', 'createdAt'])
    .orderBy('createdAt', 'desc')
    .limit(1)
    .executeTakeFirst();
  return row?.status === 'pending' && now - row.createdAt < RESUME_WINDOW_MS ? row.id : undefined;
}
