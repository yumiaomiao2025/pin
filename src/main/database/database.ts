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
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });

  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}
