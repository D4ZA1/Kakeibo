import type { Db } from '@/db/sqlite';

// Byte order mark: tells Excel the file is UTF-8 (otherwise ₹ shows as garbage).
const BOM = String.fromCharCode(0xfeff);

const HEADER = ['Date', 'Payee', 'UPI ID', 'Amount (₹)', 'Category', 'Note', 'Status'];

/**
 * One CSV cell: quoted when it holds a comma, quote or newline, and prefixed with ' when it starts
 * like a formula (=, +, -, @, tab, CR) so a payee name can't run code in a spreadsheet.
 */
export function cell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const isoLocal = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Every payment, newest first, as CSV (UTF-8 with BOM so Excel reads ₹ correctly). */
export async function exportCsv(db: Db): Promise<{ csv: string; count: number }> {
  const rows = await db
    .selectFrom('transactions')
    .leftJoin('categories', 'categories.id', 'transactions.categoryId')
    .select([
      'transactions.createdAt',
      'transactions.payeeName',
      'transactions.payeeVpa',
      'transactions.amountPaise',
      'categories.name as category',
      'transactions.note',
      'transactions.status',
    ])
    .orderBy('transactions.createdAt', 'desc')
    .execute();
  const lines = rows.map((r) =>
    [
      isoLocal(r.createdAt),
      r.payeeName ?? '',
      r.payeeVpa,
      (r.amountPaise / 100).toFixed(2),
      r.category ?? '',
      r.note ?? '',
      r.status,
    ]
      .map(cell)
      .join(','),
  );
  const csv = BOM + [HEADER.map(cell).join(','), ...lines].join('\r\n') + '\r\n';
  return { csv, count: rows.length };
}
