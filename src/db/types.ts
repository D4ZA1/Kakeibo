import type { Generated, Insertable, Selectable } from 'kysely';

// Kysely table types. Columns are snake_case in SQL; CamelCasePlugin maps them to these names.
export type Database = {
  categories: CategoriesTable;
  transactions: TransactionsTable;
  payeeRules: PayeeRulesTable;
  settings: SettingsTable;
  savedPayees: SavedPayeesTable;
};

export type CategoriesTable = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  archived: Generated<number>; // 0 | 1
};

export const TXN_STATUSES = ['pending', 'success', 'failed'] as const;
export const STATUS_SOURCES = ['app', 'user'] as const;
export const FAIL_REASONS = ['app_failure', 'user_cancelled', 'user_marked', 'no_upi_app'] as const;

export type TxnStatus = (typeof TXN_STATUSES)[number];

export type TransactionsTable = {
  id: string;
  payeeVpa: string;
  payeeName: string | null;
  amountPaise: number;
  categoryId: string;
  note: string | null;
  merchantCode: string | null;
  qrTxnRef: string | null;
  rawUri: string;
  upiApp: string | null;
  upiTxnId: string | null;
  upiApprovalRef: string | null;
  upiResponseRaw: string | null;
  status: TxnStatus;
  statusSource: (typeof STATUS_SOURCES)[number] | null;
  failReason: (typeof FAIL_REASONS)[number] | null;
  createdAt: number; // epoch ms
  updatedAt: number;
};

export type PayeeRulesTable = {
  payeeVpa: string;
  categoryId: string;
  createdAt: number;
  updatedAt: number;
};

export type SettingsTable = { key: string; value: string };

export type SavedPayeesTable = {
  phone: string;
  vpa: string;
  name: string | null;
  rawUri: string;
  createdAt: number;
  updatedAt: number;
};

export type Transaction = Selectable<TransactionsTable>;
export type NewTransaction = Insertable<TransactionsTable>;
export type SavedPayee = Selectable<SavedPayeesTable>;
export type NewSavedPayee = Insertable<SavedPayeesTable>;
