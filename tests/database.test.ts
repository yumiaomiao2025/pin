import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach } from 'node:test';

import {
  createAppDatabaseService,
  type AppDatabaseService,
} from '../src/main/database/app-service';
import { openDatabase, type DatabaseHandle } from '../src/main/database/database';
import { createRepositories, type AppRepositories } from '../src/main/database/repositories';

const migrationsFolder = path.resolve('drizzle');

let temporaryDirectory: string;
let handle: DatabaseHandle;
let repositories: AppRepositories;
let service: AppDatabaseService;
let nextTime: number;
let nextId: number;

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-database-'));
  nextTime = 1_700_000_000_000;
  nextId = 0;
  handle = openDatabase(path.join(temporaryDirectory, 'test.sqlite'), migrationsFolder);
  const options = {
    now: () => nextTime++,
    createId: () => `generated-${nextId++}`,
  };
  repositories = createRepositories(handle.db, options);
  service = createAppDatabaseService(handle.db, options);
});

afterEach(() => {
  handle.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('initializes and updates the singleton settings row', () => {
  assert.equal(repositories.settings.get(), undefined);

  const initial = repositories.settings.ensure();
  assert.equal(initial.id, 1);
  assert.equal(initial.theme, 'light');
  assert.equal(initial.defaultOpacity, 100);

  const updated = repositories.settings.update({ theme: 'dark', defaultOpacity: 80 });
  assert.equal(updated.theme, 'dark');
  assert.equal(updated.defaultOpacity, 80);
  assert.equal(repositories.settings.ensure().theme, 'dark');
});

test('persists the global window and text settings', () => {
  const updated = repositories.settings.update({
    pinAll: true,
    autostart: true,
    snap: false,
    opacityBar: false,
    hoverFull: false,
    maxLines: 2,
    scrollbar: 'hidden',
    defaultOpacity: 72,
  });

  assert.equal(updated.pinAll, true);
  assert.equal(updated.autostart, true);
  assert.equal(updated.snap, false);
  assert.equal(updated.opacityBar, false);
  assert.equal(updated.hoverFull, false);
  assert.equal(updated.maxLines, 2);
  assert.equal(updated.scrollbar, 'hidden');
  assert.equal(updated.defaultOpacity, 72);
});

test('creates, updates, and deletes widgets with cascading content', () => {
  const widget = repositories.widgets.create({ id: 'widget-1', type: 'desk', title: 'Desk' });
  const todo = repositories.todos.create({ id: 'todo-1', widgetId: widget.id, text: 'First' });
  const clip = repositories.clipItems.create({ id: 'clip-1', widgetId: widget.id, text: 'Copy me' });

  assert.equal(repositories.widgets.getById(widget.id)?.title, 'Desk');
  assert.equal(repositories.widgets.update(widget.id, { title: 'Updated' })?.title, 'Updated');
  assert.equal(repositories.todos.getById(todo.id)?.text, 'First');
  assert.equal(repositories.clipItems.getById(clip.id)?.text, 'Copy me');

  assert.equal(repositories.widgets.delete(widget.id), true);
  assert.equal(repositories.widgets.delete(widget.id), false);
  assert.equal(repositories.todos.getById(todo.id), undefined);
  assert.equal(repositories.clipItems.getById(clip.id), undefined);
});

test('persists widget visibility and pin state in z-index order', () => {
  const first = repositories.widgets.create({
    id: 'manager-first',
    type: 'note',
    zIndex: 2,
    hidden: true,
    pin: true,
  });
  const second = repositories.widgets.create({ id: 'manager-second', type: 'todo', zIndex: 1 });

  assert.equal(repositories.widgets.getById(first.id)?.hidden, true);
  assert.equal(repositories.widgets.getById(first.id)?.pin, true);
  assert.deepEqual(
    repositories.widgets.list().map((widget) => widget.id),
    [second.id, first.id],
  );
  assert.equal(repositories.widgets.update(first.id, { hidden: false, pin: false })?.hidden, false);
  assert.equal(repositories.widgets.getById(first.id)?.pin, false);
});

test('persists the active tab for each desk widget', () => {
  const firstDesk = repositories.widgets.create({ id: 'desk-tabs-first', type: 'desk' });
  const secondDesk = repositories.widgets.create({ id: 'desk-tabs-second', type: 'desk' });

  assert.equal(firstDesk.activeTab, 'note');
  assert.equal(repositories.widgets.update(firstDesk.id, { activeTab: 'clip' })?.activeTab, 'clip');
  assert.equal(repositories.widgets.getById(firstDesk.id)?.activeTab, 'clip');
  assert.equal(repositories.widgets.getById(secondDesk.id)?.activeTab, 'note');
});

test('restricts todo and clip content to compatible widget types', () => {
  const note = repositories.widgets.create({ id: 'note-widget', type: 'note' });
  const todo = repositories.widgets.create({ id: 'todo-widget-service', type: 'todo' });
  const clip = repositories.widgets.create({ id: 'clip-widget-service', type: 'clip' });

  assert.throws(
    () => service.createTodo({ widgetId: note.id, text: 'invalid' }),
    /todo items can only belong/,
  );
  assert.throws(
    () => service.createClipItem({ widgetId: todo.id, text: 'invalid' }),
    /clip items can only belong/,
  );
  assert.equal(service.createTodo({ widgetId: todo.id, text: 'valid todo' }).widgetId, todo.id);
  assert.equal(service.createClipItem({ widgetId: clip.id, text: 'valid clip' }).widgetId, clip.id);
  assert.throws(
    () => service.createTodo({ widgetId: 'missing-widget', text: 'invalid' }),
    /does not exist/,
  );
});

test('preserves todo order and supports multiline edits and reordering', () => {
  const widget = repositories.widgets.create({ id: 'todo-widget', type: 'todo' });
  const first = repositories.todos.create({
    id: 'todo-first',
    widgetId: widget.id,
    text: 'line one\nline two',
  });
  const second = repositories.todos.create({ id: 'todo-second', widgetId: widget.id, text: 'Second' });

  assert.deepEqual(
    repositories.todos.listByWidget(widget.id).map((item) => item.id),
    [first.id, second.id],
  );
  assert.equal(repositories.todos.update(first.id, { done: true })?.done, true);

  const reordered = repositories.todos.reorder(widget.id, [second.id, first.id]);
  assert.deepEqual(reordered.map((item) => item.id), [second.id, first.id]);
  assert.equal(repositories.todos.update(first.id, { text: 'updated\ntext' })?.text, 'updated\ntext');
  assert.throws(() => repositories.todos.reorder(widget.id, [first.id]), /exactly once/);
});

test('deduplicates clip text and evicts the oldest item above the limit', () => {
  const widget = repositories.widgets.create({ id: 'clip-widget', type: 'clip' });
  const first = repositories.clipItems.create({ id: 'clip-first', widgetId: widget.id, text: 'first' });
  const duplicate = repositories.clipItems.create({ id: 'clip-duplicate', widgetId: widget.id, text: 'first' });

  assert.equal(duplicate.id, first.id);
  assert.equal(repositories.clipItems.listByWidget(widget.id).length, 1);

  for (let index = 1; index <= 20; index += 1) {
    repositories.clipItems.create({
      id: `clip-${index}`,
      widgetId: widget.id,
      text: `item-${index}`,
    });
  }

  const items = repositories.clipItems.listByWidget(widget.id);
  assert.equal(items.length, 20);
  assert.equal(repositories.clipItems.getById(first.id), undefined);
  assert.equal(items.at(-1)?.text, 'item-20');

  assert.throws(
    () => repositories.clipItems.update('clip-2', { text: 'item-3' }),
    /already exists/,
  );
});

test('supports custom kit CRUD and transaction rollback', () => {
  const kit = repositories.customKits.create({
    id: 'kit-1',
    name: 'Warm',
    paper: '#FFFFFF',
    ink: '#111111',
    title: '#FFE566',
    accent: '#FFE566',
    spine: null,
    shadow: '#111111',
  });
  assert.equal(repositories.customKits.update(kit.id, { name: 'Warm renamed' })?.name, 'Warm renamed');
  assert.equal(repositories.customKits.delete(kit.id), true);
  assert.equal(repositories.customKits.getById(kit.id), undefined);

  assert.throws(
    () =>
      service.transaction(({ widgets, todos }) => {
        const widget = widgets.create({ id: 'rollback-widget', type: 'desk' });
        todos.create({ id: 'rollback-todo', widgetId: widget.id, text: 'rolled back' });
        throw new Error('rollback');
      }),
    /rollback/,
  );
  assert.equal(repositories.widgets.getById('rollback-widget'), undefined);
  assert.equal(repositories.todos.getById('rollback-todo'), undefined);

  service.transaction(({ widgets }) => {
    widgets.create({ id: 'committed-widget', type: 'note', noteText: 'kept' });
  });
  assert.equal(repositories.widgets.getById('committed-widget')?.noteText, 'kept');
});

test('persists migration data after closing and reopening the database', () => {
  const databasePath = path.join(temporaryDirectory, 'reopen.sqlite');
  handle.close();
  handle = openDatabase(databasePath, migrationsFolder);
  const firstRepositories = createRepositories(handle.db);
  firstRepositories.settings.ensure();
  firstRepositories.widgets.create({ id: 'persistent-widget', type: 'note', noteText: 'persisted' });
  handle.close();

  handle = openDatabase(databasePath, migrationsFolder);
  const reopenedRepositories = createRepositories(handle.db);
  assert.equal(reopenedRepositories.settings.get()?.id, 1);
  assert.equal(reopenedRepositories.widgets.getById('persistent-widget')?.noteText, 'persisted');
});
