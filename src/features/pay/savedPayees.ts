import type { Db } from '@/db/sqlite';
import type { SavedPayee } from '@/db/types';

/** Lookup a linked payee by 10-digit mobile number. */
export async function getSavedPayee(db: Db, phone: string): Promise<SavedPayee | undefined> {
  return db
    .selectFrom('savedPayees')
    .selectAll()
    .where('phone', '=', phone)
    .executeTakeFirst();
}

/** Link or update a contact's real UPI VPA and raw URI. */
export async function savePayee(
  db: Db,
  {
    phone,
    vpa,
    name,
    rawUri,
    now = Date.now(),
  }: {
    phone: string;
    vpa: string;
    name?: string | null;
    rawUri: string;
    now?: number;
  },
): Promise<SavedPayee> {
  await db
    .insertInto('savedPayees')
    .values({
      phone,
      vpa,
      name: name ?? null,
      rawUri,
      createdAt: now,
      updatedAt: now,
    })
    .onConflict((oc) =>
      oc.column('phone').doUpdateSet({
        vpa,
        name: name ?? null,
        rawUri,
        updatedAt: now,
      }),
    )
    .execute();

  return (await getSavedPayee(db, phone))!;
}

/** Remove a linked payee. */
export async function deleteSavedPayee(db: Db, phone: string): Promise<boolean> {
  const res = await db.deleteFrom('savedPayees').where('phone', '=', phone).executeTakeFirst();
  return Number(res.numDeletedRows) > 0;
}

/** All saved payees in most-recently-updated order. */
export async function listSavedPayees(db: Db): Promise<SavedPayee[]> {
  return db.selectFrom('savedPayees').selectAll().orderBy('updatedAt', 'desc').execute();
}
