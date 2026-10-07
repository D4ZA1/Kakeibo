import { addDatabaseChangeListener } from 'expo-sqlite';
import { useColorScheme } from 'nativewind';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type DependencyList,
  type ReactNode,
} from 'react';

import { getSetting, openDatabase } from '@/db/client';
import type { Db } from '@/db/sqlite';

const DbContext = createContext<Db | null>(null);

type Opened = { db: Db; error?: undefined } | { db?: undefined; error: Error };

function open(): Opened {
  try {
    return { db: openDatabase() };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/** Opens and migrates the database once; renders `fallback(error)` if that fails. */
export function DatabaseProvider({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback: (error: Error) => ReactNode;
}) {
  const [opened] = useState(open);
  const { setColorScheme } = useColorScheme();

  useEffect(() => {
    if (!opened.db) return;
    getSetting(opened.db, 'theme').then((theme) => {
      if (theme === 'dark' || theme === 'light') setColorScheme(theme);
    });
  }, [opened, setColorScheme]);

  if (opened.error) return fallback(opened.error);
  return <DbContext.Provider value={opened.db}>{children}</DbContext.Provider>;
}

export function useDb(): Db {
  const db = useContext(DbContext);
  if (!db) throw new Error('useDb must be used inside <DatabaseProvider>');
  return db;
}

/**
 * Runs `query` now and again after any write to the database. `undefined` until the first result.
 * Re-runs when `deps` change, like useEffect.
 */
export function useLiveQuery<T>(
  query: (db: Db) => Promise<T>,
  deps: DependencyList,
): T | undefined {
  const db = useDb();
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    let alive = true;
    const run = () =>
      query(db).then(
        (r) => alive && setData(r),
        (e) => alive && setError(e),
      );
    run();
    const sub = addDatabaseChangeListener(run);
    return () => {
      alive = false;
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, ...deps]);
  if (error) throw error; // to the route's error boundary instead of a blank screen
  return data;
}

/** All categories in display order (live from the categories table) and a lookup by id. */
export function useCategories() {
  const list =
    useLiveQuery(
      (db) => db.selectFrom('categories').selectAll().orderBy('sortOrder').execute(),
      [],
    ) ?? [];
  return { list, cat: (id?: string) => list.find((c) => c.id === id) };
}

/** One transaction, live. undefined while loading, null if there is no such id. */
export function useTxn(id: string) {
  return useLiveQuery(
    async (db) =>
      (await db.selectFrom('transactions').selectAll().where('id', '=', id).executeTakeFirst()) ??
      null,
    [id],
  );
}
