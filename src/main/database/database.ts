import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { schema, type AppSchema } from './schema';

export type AppDatabase = ReturnType<typeof drizzle<AppSchema>>;

export interface DatabaseHandle {
  db: AppDatabase;
  sqlite: Database.Database;
  close: () => void;
}

export function openDatabase(databasePath: string, migrationsFolder: string): DatabaseHandle {
  const sqlite = new Database(databasePath);
  sqlite.pragma('journal_mode = WAL');
  const db = drizzle(sqlite, { schema });
  // Table rebuilds must disable foreign keys before the migrator's transaction;
  // changing this pragma inside that transaction has no effect.
  sqlite.pragma('foreign_keys = OFF');
  try {
    migrate(db, { migrationsFolder });
  } catch (error) {
    sqlite.close();
    throw error;
  }
  sqlite.pragma('foreign_keys = ON');

  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}
