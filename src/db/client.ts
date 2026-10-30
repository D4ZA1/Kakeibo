import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import {
  deleteDatabaseSync,
  openDatabaseSync,
  type SQLiteBindValue,
  type SQLiteDatabase,
} from 'expo-sqlite';

import { createKysely, migrate, type Db, type SyncSqlite } from '@/db/sqlite';

const KEY_NAME = 'db-key';
const DB_NAME = 'kakeibo.db';

let handle: SQLiteDatabase | null = null;

/** 256-bit SQLCipher key, generated on first launch and kept in the device keystore. */
function databaseKey(): string {
  let key = SecureStore.getItem(KEY_NAME);
  if (!key) {
    key = Array.from(getRandomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
    SecureStore.setItem(KEY_NAME, key);
  }
  return key;
}

/** Opens the encrypted database and runs pending migrations. Throws if either fails. */
export function openDatabase(): Db {
  const sqlite = openDatabaseSync(DB_NAME, { enableChangeListener: true });
  handle = sqlite;
  try {
    // Must be the first statement. Expo Go has no SQLCipher and ignores it (database unencrypted).
    sqlite.execSync(`PRAGMA key = "x'${databaseKey()}'"`);
    sqlite.execSync('PRAGMA foreign_keys = ON');
    const conn: SyncSqlite = {
      exec: (sql) => sqlite.execSync(sql),
      all: (sql, params) => sqlite.getAllSync(sql, params as SQLiteBindValue[]),
      run: (sql, params) => {
        const r = sqlite.runSync(sql, params as SQLiteBindValue[]);
        return { changes: r.changes, lastInsertRowid: r.lastInsertRowId };
      },
    };
    migrate(conn);
    return createKysely(conn);
  } catch (e) {
    sqlite.closeSync();
    handle = null;
    throw e;
  }
}

/** A wrong key (e.g. the keystore was reset) makes SQLCipher report the file as not a database. */
export const isKeyMismatch = (e: Error) => /not a database|file is encrypted/i.test(e.message);

/**
 * Deletes the database file and its key. Afterwards the app must reload: the next open makes a new
 * key and an empty database.
 */
export async function wipeDatabase() {
  handle?.closeSync();
  handle = null;
  deleteDatabaseSync(DB_NAME);
  await SecureStore.deleteItemAsync(KEY_NAME);
}

/** Every key the settings table may hold. Add here before using a new one. */
export type SettingKey =
  | 'theme' // 'dark' | 'light'
  | 'firstName'
  | 'preferredUpiApp' // package name
  | 'alwaysUseUpiApp' // '1' | '0'
  | 'appLock' // '1' | '0'
  | 'reminders' // '1' | '0'
  | 'consentVersion';

export async function getSetting(db: Db, key: SettingKey) {
  const row = await db
    .selectFrom('settings')
    .select('value')
    .where('key', '=', key)
    .executeTakeFirst();
  return row?.value;
}

export function setSetting(db: Db, key: SettingKey, value: string) {
  return db
    .insertInto('settings')
    .values({ key, value })
    .onConflict((oc) => oc.column('key').doUpdateSet({ value }))
    .execute();
}
