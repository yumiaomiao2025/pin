import { app } from 'electron';
import path from 'node:path';

import { openDatabase, type AppDatabase, type DatabaseHandle } from './database';
import { settings } from './schema';

const SETTINGS_ID = 1;
const DATABASE_FILENAME = 'desk-widgets.sqlite';

let handle: DatabaseHandle | undefined;

function getMigrationsFolder() {
  return path.join(__dirname, '../../drizzle');
}

export function initializeAppDatabase(): AppDatabase {
  if (handle) {
    return handle.db;
  }

  const databasePath = path.join(app.getPath('userData'), DATABASE_FILENAME);
  handle = openDatabase(databasePath, getMigrationsFolder());

  handle.db
    .insert(settings)
    .values({ id: SETTINGS_ID })
    .onConflictDoNothing({ target: settings.id })
    .run();

  return handle.db;
}

export function closeAppDatabase() {
  handle?.close();
  handle = undefined;
}
