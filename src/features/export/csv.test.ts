import { expect, test } from '@jest/globals';

import { createTestDb } from '@/db/test-db';

import { cell, exportCsv } from './csv';

test.each([
  ['plain', 'Swiggy', 'Swiggy'],
  ['comma', 'Apple Store, BKC', '"Apple Store, BKC"'],
  ['quote', 'The "best" chai', '"The ""best"" chai"'],
  ['newline', 'a\nb', '"a\nb"'],
  ['formula =', '=HYPERLINK("x")', `"'=HYPERLINK(""x"")"`],
  ['formula +', '+91 shop', "'+91 shop"],
  ['formula -', '-5', "'-5"],
  ['formula @', '@SUM(A1)', "'@SUM(A1)"],
])('cell: %s', (_, input, out) => {
  expect(cell(input)).toBe(out);
});

test('exportCsv writes a header and every payment, newest first, amounts in rupees', async () => {
  const db = createTestDb();
  const base = { rawUri: 'upi://pay', categoryId: 'food', updatedAt: 0 } as const;
  await db
    .insertInto('transactions')
    .values([
      {
        ...base,
        id: '1',
        payeeVpa: 'a@ybl',
        payeeName: 'Old',
        amountPaise: 12550,
        status: 'success',
        createdAt: new Date(2026, 9, 1, 9, 5).getTime(),
      },
      {
        ...base,
        id: '2',
        payeeVpa: 'b@ybl',
        payeeName: null,
        amountPaise: 100,
        status: 'failed',
        note: 'x, y',
        createdAt: new Date(2026, 9, 2, 18, 30).getTime(),
      },
    ])
    .execute();
  const { csv, count } = await exportCsv(db);
  expect(count).toBe(2);
  expect(csv.startsWith('\uFEFF')).toBe(true);
  expect(csv.slice(1).split('\r\n')).toEqual([
    'Date,Payee,UPI ID,Amount (₹),Category,Note,Status',
    '2026-10-02 18:30,,b@ybl,1.00,Food,"x, y",failed',
    '2026-10-01 09:05,Old,a@ybl,125.50,Food,,success',
    '',
  ]);
});
