import { beforeEach, describe, expect, test } from '@jest/globals';

import type { Db } from '@/db/sqlite';
import { createTestDb } from '@/db/test-db';
import { draftFromTxn, type PayDraft } from '@/features/pay/draft';

import {
  applyAppResult,
  cancelPayment,
  markByUser,
  recategorize,
  RESUME_WINDOW_MS,
  resumablePending,
  savePending,
} from './payment';

let db: Db;
beforeEach(() => {
  db = createTestDb();
});

const draft: PayDraft = {
  rawUri: 'upi://pay?pa=shop@ybl&am=250.00&mc=5411&tr=T1',
  payeeVpa: 'shop@ybl',
  payeeName: 'Shop',
  amountPaise: 25000,
  amountLocked: true,
  merchantCode: '5411',
  txnRef: 'T1',
  categoryId: 'food',
  note: 'Lunch',
};

const save = (id: string, d: Partial<PayDraft> = {}, now = 1000) =>
  savePending(db, { id, draft: { ...draft, ...d }, payUri: draft.rawUri, upiApp: 'GPay', now });
const row = (id: string) =>
  db.selectFrom('transactions').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
const rule = () => db.selectFrom('payeeRules').selectAll().executeTakeFirst();

describe('savePending', () => {
  test('saves the draft as pending with the link that was sent', async () => {
    await save('a');
    expect(await row('a')).toMatchObject({
      status: 'pending',
      payeeVpa: 'shop@ybl',
      amountPaise: 25000,
      categoryId: 'food',
      note: 'Lunch',
      merchantCode: '5411',
      qrTxnRef: 'T1',
      rawUri: draft.rawUri,
      upiApp: 'GPay',
      createdAt: 1000,
    });
  });

  test('writes the payee rule only when "Always tag" was on', async () => {
    await save('a');
    expect(await rule()).toBeUndefined();
    await save('b', { saveRule: true });
    expect(await rule()).toMatchObject({ payeeVpa: 'shop@ybl', categoryId: 'food' });
  });

  test('refuses a draft without an amount or category', async () => {
    await expect(save('a', { amountPaise: undefined })).rejects.toThrow();
    await expect(save('b', { categoryId: undefined })).rejects.toThrow();
  });
});

describe('applyAppResult', () => {
  test('SUCCESS settles the payment and keeps the references', async () => {
    await save('a');
    const ok = await applyAppResult(db, 'a', {
      status: 'SUCCESS',
      txnId: 'AXI1',
      approvalRef: '4281',
      raw: 'Status=SUCCESS',
    });
    expect(ok).toBe(true);
    expect(await row('a')).toMatchObject({
      status: 'success',
      statusSource: 'app',
      upiTxnId: 'AXI1',
      upiApprovalRef: '4281',
      upiResponseRaw: 'Status=SUCCESS',
    });
  });

  test.each(['FAILURE', 'SUBMITTED', 'UNKNOWN'] as const)(
    '%s stays pending for the user to confirm (rule 2)',
    async (status) => {
      await save('a');
      expect(await applyAppResult(db, 'a', { status, raw: `Status=${status}` })).toBe(false);
      expect(await row('a')).toMatchObject({
        status: 'pending',
        upiResponseRaw: `Status=${status}`,
      });
    },
  );

  test('never overrides a result the user already gave', async () => {
    await save('a');
    await cancelPayment(db, 'a');
    await applyAppResult(db, 'a', { status: 'SUCCESS' });
    expect((await row('a')).status).toBe('failed');
  });
});

test('cancelPayment marks it failed by the user', async () => {
  await save('a');
  await cancelPayment(db, 'a', 2000);
  expect(await row('a')).toMatchObject({
    status: 'failed',
    statusSource: 'user',
    failReason: 'user_cancelled',
    updatedAt: 2000,
  });
});

describe('resumablePending', () => {
  test('returns the newest payment while it is pending and recent', async () => {
    await save('a', {}, 1000);
    expect(await resumablePending(db, 1000 + RESUME_WINDOW_MS - 1)).toBe('a');
    expect(await resumablePending(db, 1000 + RESUME_WINDOW_MS)).toBeUndefined();
  });

  test('ignores an older pending one once a newer payment exists', async () => {
    await save('a', {}, 1000);
    await save('b', {}, 2000);
    await cancelPayment(db, 'b');
    expect(await resumablePending(db, 3000)).toBeUndefined();
  });

  test('nothing saved → nothing to resume', async () => {
    expect(await resumablePending(db)).toBeUndefined();
  });
});

test('draftFromTxn rebuilds a payable draft from the saved row (Try again after a kill)', async () => {
  await save('a', { saveRule: true });
  const d = draftFromTxn(await row('a'))!;
  expect(d).toEqual({
    rawUri: draft.rawUri,
    payeeVpa: 'shop@ybl',
    payeeName: 'Shop',
    amountPaise: 25000,
    amountLocked: true,
    merchantCode: '5411',
    txnRef: 'T1',
    categoryId: 'food',
    note: 'Lunch',
  });
  // Paying it again saves a second row; the first stays as it was.
  await savePending(db, { id: 'b', draft: d, payUri: d.rawUri, upiApp: 'GPay', now: 2000 });
  expect((await row('b')).status).toBe('pending');
});

test('draftFromTxn refuses a row whose link no longer parses', async () => {
  await save('a');
  expect(draftFromTxn({ ...(await row('a')), rawUri: 'not a link' })).toBeNull();
});

describe('markByUser', () => {
  test('"Yes, it\'s paid" marks a pending payment successful, by the user', async () => {
    await save('a');
    expect(await markByUser(db, 'a', true, 50)).toBe(true);
    expect(await row('a')).toMatchObject({
      status: 'success',
      statusSource: 'user',
      failReason: null,
      updatedAt: 50,
    });
  });

  test('"No, it failed" marks it failed with reason user_marked', async () => {
    await save('a');
    await markByUser(db, 'a', false);
    expect(await row('a')).toMatchObject({ status: 'failed', failReason: 'user_marked' });
  });

  test('never overwrites a payment that already has a result', async () => {
    await save('a');
    await applyAppResult(db, 'a', { status: 'SUCCESS' });
    expect(await markByUser(db, 'a', false)).toBe(false);
    expect((await row('a')).status).toBe('success');
    expect(await markByUser(db, 'missing', true)).toBe(false);
  });
});

test('recategorize moves a payment and returns the old category for Undo', async () => {
  await save('a');
  expect(await recategorize(db, 'a', 'tech', 5000)).toBe('food');
  expect(await row('a')).toMatchObject({ categoryId: 'tech', updatedAt: 5000 });
  expect(await recategorize(db, 'a', 'food')).toBe('tech');
  expect(await recategorize(db, 'missing', 'food')).toBeUndefined();
});
