import { randomUUID } from 'node:crypto';

import { and, asc, eq } from 'drizzle-orm';

import type { AppDatabase } from './database';
import {
  clipItems,
  customKits,
  settings,
  todos,
  widgets,
  type ClipItem,
  type CustomKit,
  type NewClipItem,
  type NewCustomKit,
  type NewSettings,
  type NewTodo,
  type NewWidget,
  type Settings,
  type Todo,
  type Widget,
} from './schema';

export const SETTINGS_SINGLETON_ID = 1;
export const MAX_CLIP_ITEMS = 20;

export type DatabaseExecutor = Pick<AppDatabase, 'select' | 'insert' | 'update' | 'delete'>;

export interface RepositoryOptions {
  now?: () => number;
  createId?: () => string;
}

type RepositoryRuntime = Required<RepositoryOptions>;

export type CreateWidgetInput = Omit<NewWidget, 'id'> & { id?: string };
export type UpdateWidgetInput = Partial<Omit<NewWidget, 'id'>>;

export type CreateTodoInput = Omit<NewTodo, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: number;
  updatedAt?: number;
};
export type UpdateTodoInput = Partial<Pick<NewTodo, 'text' | 'done' | 'sortOrder'>>;

export type CreateClipItemInput = Omit<NewClipItem, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: number;
  updatedAt?: number;
};
export type UpdateClipItemInput = Partial<Pick<NewClipItem, 'text' | 'sortOrder'>>;

export type CreateCustomKitInput = Omit<NewCustomKit, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: number;
  updatedAt?: number;
};
export type UpdateCustomKitInput = Partial<Omit<NewCustomKit, 'id' | 'createdAt' | 'updatedAt'>>;

export type UpdateSettingsInput = Partial<Omit<NewSettings, 'id'>>;

export interface WidgetRepository {
  list(): Widget[];
  getById(id: string): Widget | undefined;
  create(input: CreateWidgetInput): Widget;
  update(id: string, patch: UpdateWidgetInput): Widget | undefined;
  delete(id: string): boolean;
}

export interface TodoRepository {
  listByWidget(widgetId: string): Todo[];
  getById(id: string): Todo | undefined;
  create(input: CreateTodoInput): Todo;
  update(id: string, patch: UpdateTodoInput): Todo | undefined;
  delete(id: string): boolean;
  reorder(widgetId: string, orderedIds: string[]): Todo[];
}

export interface ClipItemRepository {
  listByWidget(widgetId: string): ClipItem[];
  getById(id: string): ClipItem | undefined;
  getByWidgetAndText(widgetId: string, text: string): ClipItem | undefined;
  create(input: CreateClipItemInput): ClipItem;
  update(id: string, patch: UpdateClipItemInput): ClipItem | undefined;
  delete(id: string): boolean;
  reorder(widgetId: string, orderedIds: string[]): ClipItem[];
}

export interface CustomKitRepository {
  list(): CustomKit[];
  getById(id: string): CustomKit | undefined;
  create(input: CreateCustomKitInput): CustomKit;
  update(id: string, patch: UpdateCustomKitInput): CustomKit | undefined;
  delete(id: string): boolean;
}

export interface SettingsRepository {
  get(): Settings | undefined;
  ensure(): Settings;
  update(patch: UpdateSettingsInput): Settings;
}

export interface AppRepositories {
  widgets: WidgetRepository;
  todos: TodoRepository;
  clipItems: ClipItemRepository;
  customKits: CustomKitRepository;
  settings: SettingsRepository;
}

function getRuntime(options: RepositoryOptions = {}): RepositoryRuntime {
  return {
    now: options.now ?? Date.now,
    createId: options.createId ?? randomUUID,
  };
}

function assertCompleteOrder(currentIds: string[], orderedIds: string[], entityName: string) {
  if (
    currentIds.length !== orderedIds.length ||
    new Set(orderedIds).size !== orderedIds.length ||
    orderedIds.some((id) => !currentIds.includes(id))
  ) {
    throw new Error(`${entityName} reorder must include each existing item exactly once`);
  }
}

function requireRow<T>(row: T | undefined, entityName: string): T {
  if (!row) {
    throw new Error(`${entityName} was inserted but could not be read back`);
  }
  return row;
}

export function createWidgetRepository(
  db: DatabaseExecutor,
  options: RepositoryOptions = {},
): WidgetRepository {
  const runtime = getRuntime(options);

  return {
    list: () => db.select().from(widgets).orderBy(asc(widgets.zIndex), asc(widgets.id)).all(),

    getById: (id) => db.select().from(widgets).where(eq(widgets.id, id)).get(),

    create: (input) => {
      const { id = runtime.createId(), ...values } = input;
      db.insert(widgets).values({ id, ...values }).run();
      return requireRow(db.select().from(widgets).where(eq(widgets.id, id)).get(), 'Widget');
    },

    update: (id, patch) => {
      const result = db.update(widgets).set(patch).where(eq(widgets.id, id)).run();
      return result.changes === 0
        ? undefined
        : db.select().from(widgets).where(eq(widgets.id, id)).get();
    },

    delete: (id) => db.delete(widgets).where(eq(widgets.id, id)).run().changes > 0,
  };
}

export function createTodoRepository(
  db: DatabaseExecutor,
  options: RepositoryOptions = {},
): TodoRepository {
  const runtime = getRuntime(options);
  const listByWidget = (widgetId: string) =>
    db
      .select()
      .from(todos)
      .where(eq(todos.widgetId, widgetId))
      .orderBy(asc(todos.sortOrder), asc(todos.createdAt), asc(todos.id))
      .all();

  return {
    listByWidget,

    getById: (id) => db.select().from(todos).where(eq(todos.id, id)).get(),

    create: (input) => {
      const { id = runtime.createId(), createdAt = runtime.now(), updatedAt = createdAt, ...values } =
        input;
      const sortOrder =
        values.sortOrder ??
        Math.max(-1, ...db.select({ sortOrder: todos.sortOrder }).from(todos).where(eq(todos.widgetId, values.widgetId)).all().map((row) => row.sortOrder)) +
          1;

      db.insert(todos).values({ id, ...values, sortOrder, createdAt, updatedAt }).run();
      return requireRow(db.select().from(todos).where(eq(todos.id, id)).get(), 'Todo');
    },

    update: (id, patch) => {
      const result = db.update(todos).set({ ...patch, updatedAt: runtime.now() }).where(eq(todos.id, id)).run();
      return result.changes === 0 ? undefined : db.select().from(todos).where(eq(todos.id, id)).get();
    },

    delete: (id) => db.delete(todos).where(eq(todos.id, id)).run().changes > 0,

    reorder: (widgetId, orderedIds) => {
      const current = db
        .select({ id: todos.id })
        .from(todos)
        .where(eq(todos.widgetId, widgetId))
        .all()
        .map((row) => row.id);
      assertCompleteOrder(current, orderedIds, 'Todo');

      orderedIds.forEach((id, sortOrder) => {
        db.update(todos).set({ sortOrder, updatedAt: runtime.now() }).where(and(eq(todos.id, id), eq(todos.widgetId, widgetId))).run();
      });
      return listByWidget(widgetId);
    },
  };
}

export function createClipItemRepository(
  db: DatabaseExecutor,
  options: RepositoryOptions = {},
): ClipItemRepository {
  const runtime = getRuntime(options);

  const listByWidget = (widgetId: string) =>
    db
      .select()
      .from(clipItems)
      .where(eq(clipItems.widgetId, widgetId))
      .orderBy(asc(clipItems.sortOrder), asc(clipItems.createdAt), asc(clipItems.id))
      .all();

  return {
    listByWidget,

    getById: (id) => db.select().from(clipItems).where(eq(clipItems.id, id)).get(),

    getByWidgetAndText: (widgetId, text) =>
      db
        .select()
        .from(clipItems)
        .where(and(eq(clipItems.widgetId, widgetId), eq(clipItems.text, text)))
        .get(),

    create: (input) => {
      const duplicate = db
        .select()
        .from(clipItems)
        .where(and(eq(clipItems.widgetId, input.widgetId), eq(clipItems.text, input.text)))
        .get();
      if (duplicate) {
        return duplicate;
      }

      const { id = runtime.createId(), createdAt = runtime.now(), updatedAt = createdAt, ...values } =
        input;
      const sortOrder =
        values.sortOrder ??
        Math.max(-1, ...listByWidget(values.widgetId).map((row) => row.sortOrder)) + 1;
      db.insert(clipItems).values({ id, ...values, sortOrder, createdAt, updatedAt }).run();

      const rows = listByWidget(values.widgetId);
      rows.slice(0, Math.max(0, rows.length - MAX_CLIP_ITEMS)).forEach((row) => {
        db.delete(clipItems).where(eq(clipItems.id, row.id)).run();
      });

      return requireRow(db.select().from(clipItems).where(eq(clipItems.id, id)).get(), 'Clip item');
    },

    update: (id, patch) => {
      if (patch.text !== undefined) {
        const current = db.select().from(clipItems).where(eq(clipItems.id, id)).get();
        if (!current) {
          return undefined;
        }
        const duplicate = db
          .select()
          .from(clipItems)
          .where(and(eq(clipItems.widgetId, current.widgetId), eq(clipItems.text, patch.text)))
          .get();
        if (duplicate && duplicate.id !== id) {
          throw new Error('Clip text already exists in this widget');
        }
      }

      const result = db.update(clipItems).set({ ...patch, updatedAt: runtime.now() }).where(eq(clipItems.id, id)).run();
      return result.changes === 0 ? undefined : db.select().from(clipItems).where(eq(clipItems.id, id)).get();
    },

    delete: (id) => db.delete(clipItems).where(eq(clipItems.id, id)).run().changes > 0,

    reorder: (widgetId, orderedIds) => {
      const current = db
        .select({ id: clipItems.id })
        .from(clipItems)
        .where(eq(clipItems.widgetId, widgetId))
        .all()
        .map((row) => row.id);
      assertCompleteOrder(current, orderedIds, 'Clip item');

      orderedIds.forEach((id, sortOrder) => {
        db.update(clipItems).set({ sortOrder, updatedAt: runtime.now() }).where(and(eq(clipItems.id, id), eq(clipItems.widgetId, widgetId))).run();
      });
      return listByWidget(widgetId);
    },
  };
}

export function createCustomKitRepository(
  db: DatabaseExecutor,
  options: RepositoryOptions = {},
): CustomKitRepository {
  const runtime = getRuntime(options);

  return {
    list: () => db.select().from(customKits).orderBy(asc(customKits.createdAt), asc(customKits.id)).all(),

    getById: (id) => db.select().from(customKits).where(eq(customKits.id, id)).get(),

    create: (input) => {
      const { id = runtime.createId(), createdAt = runtime.now(), updatedAt = createdAt, ...values } =
        input;
      db.insert(customKits).values({ id, ...values, createdAt, updatedAt }).run();
      return requireRow(db.select().from(customKits).where(eq(customKits.id, id)).get(), 'Custom kit');
    },

    update: (id, patch) => {
      const result = db.update(customKits).set({ ...patch, updatedAt: runtime.now() }).where(eq(customKits.id, id)).run();
      return result.changes === 0 ? undefined : db.select().from(customKits).where(eq(customKits.id, id)).get();
    },

    delete: (id) => db.delete(customKits).where(eq(customKits.id, id)).run().changes > 0,
  };
}

export function createSettingsRepository(
  db: DatabaseExecutor,
): SettingsRepository {
  const get = () => db.select().from(settings).where(eq(settings.id, SETTINGS_SINGLETON_ID)).get();

  return {
    get,

    ensure: () => {
      db.insert(settings)
        .values({ id: SETTINGS_SINGLETON_ID })
        .onConflictDoNothing({ target: settings.id })
        .run();
      return requireRow(get(), 'Settings');
    },

    update: (patch) => {
      db.insert(settings)
        .values({ id: SETTINGS_SINGLETON_ID })
        .onConflictDoNothing({ target: settings.id })
        .run();
      db.update(settings).set(patch).where(eq(settings.id, SETTINGS_SINGLETON_ID)).run();
      return requireRow(get(), 'Settings');
    },
  };
}

export function createRepositories(
  db: DatabaseExecutor,
  options: RepositoryOptions = {},
): AppRepositories {
  return {
    widgets: createWidgetRepository(db, options),
    todos: createTodoRepository(db, options),
    clipItems: createClipItemRepository(db, options),
    customKits: createCustomKitRepository(db, options),
    settings: createSettingsRepository(db),
  };
}
