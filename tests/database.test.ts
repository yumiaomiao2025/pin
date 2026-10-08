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
import { COLOR_PRESETS, deriveColorVars, normalizeKitColors } from '../src/shared/colors';

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
  assert.equal(initial.fontSize, 13);
  assert.equal(initial.defaultOpacity, 100);

  const updated = repositories.settings.update({ fontSize: 16, defaultOpacity: 80 });
  assert.equal(updated.fontSize, 16);
  assert.equal(updated.defaultOpacity, 80);
  assert.equal(repositories.settings.ensure().fontSize, 16);
});

test('persists opacity from 5 to 100 and rejects values outside the range', () => {
  const widget = repositories.widgets.create({ type: 'note', opacity: 5 });
  for (const opacity of [5, 34, 100]) {
    assert.equal(repositories.settings.update({ defaultOpacity: opacity }).defaultOpacity, opacity);
    assert.equal(repositories.widgets.update(widget.id, { opacity })?.opacity, opacity);
  }
  for (const opacity of [-1, 0, 1, 4, 101]) {
    assert.throws(() => repositories.settings.update({ defaultOpacity: opacity }), /settings_opacity_check/);
    assert.throws(() => repositories.widgets.update(widget.id, { opacity }), /widgets_opacity_check/);
  }
});

for (const lastMigration of [1, 2, 3, 4, 5, 6]) {
  test('upgrades settings from migration ' + lastMigration + ' without losing content or colors', () => {
    const oldMigrations = path.join(temporaryDirectory, 'old-migrations');
    fs.mkdirSync(path.join(oldMigrations, 'meta'), { recursive: true });
    const journal = JSON.parse(fs.readFileSync(path.join(migrationsFolder, 'meta/_journal.json'), 'utf8'));
    journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= lastMigration);
    fs.writeFileSync(path.join(oldMigrations, 'meta/_journal.json'), JSON.stringify(journal));
    for (const entry of journal.entries) {
      fs.copyFileSync(path.join(migrationsFolder, `${entry.tag}.sql`), path.join(oldMigrations, `${entry.tag}.sql`));
    }

    handle.close();
    const databasePath = path.join(temporaryDirectory, 'upgrade.sqlite');
    handle = openDatabase(databasePath, oldMigrations);
    const old = createRepositories(handle.db);
    const previousOpacity = lastMigration === 3 ? 1 : lastMigration === 2 ? 5 : 72;
    handle.sqlite.prepare('INSERT INTO settings (id, font_size, default_opacity) VALUES (1, 17, ?)').run(previousOpacity);
    if (lastMigration <= 4) {
      handle.sqlite.exec("UPDATE settings SET theme = 'dark', auto_theme = 1");
    }
    const previousSettings = handle.sqlite.prepare('SELECT * FROM settings').get() as Record<string, unknown>;
    const kit = old.customKits.create({
      name: 'Keep dark kit', paper: '#0D0D0D', ink: '#F2F2F2',
      title: '#FFE566', accent: '#FFE566', spine: null, shadow: '#F2F2F2',
    });
    handle.sqlite.prepare(`INSERT INTO widgets
      (id, type, note_text, opacity, paper_color, ink_color, follows_default)
      VALUES ('legacy-widget', 'desk', 'keep note', ?, ?, ?, 0)`).run(previousOpacity, kit.paper, kit.ink);
    const widget = handle.sqlite.prepare('SELECT * FROM widgets').get() as Record<string, unknown> & { id: string };
    const todo = old.todos.create({ widgetId: widget.id, text: 'keep todo', done: true });
    const clip = old.clipItems.create({ widgetId: widget.id, text: 'keep clip' });
    assert.throws(() => handle.sqlite.prepare('UPDATE widgets SET opacity = 0 WHERE id = ?').run(widget.id), /widgets_opacity_check/);
    handle.close();

    handle = openDatabase(databasePath, migrationsFolder);
    const upgraded = createRepositories(handle.db);
    assert.deepEqual(handle.sqlite.prepare('SELECT * FROM widgets').get(), {
      ...widget, opacity: Math.max(5, previousOpacity), color_kit_id: null,
    });
    assert.deepEqual(upgraded.todos.getById(todo.id), todo);
    assert.deepEqual(upgraded.clipItems.getById(clip.id), clip);
    assert.deepEqual(upgraded.customKits.getById(kit.id), kit);
    const settingsWithoutRemovedFields = { ...previousSettings };
    delete settingsWithoutRemovedFields.theme;
    delete settingsWithoutRemovedFields.auto_theme;
    delete settingsWithoutRemovedFields.scrollbar;
    assert.deepEqual(handle.sqlite.prepare('SELECT * FROM settings').get(), {
      ...settingsWithoutRemovedFields, default_opacity: Math.max(5, previousOpacity), default_color_kit_id: null,
    });
    const columns = handle.sqlite.pragma('table_info(settings)') as Array<{ name: string }>;
    assert.equal(columns.some(({ name }) => name === 'theme' || name === 'auto_theme'), false);
    assert.equal(upgraded.settings.get()?.fontSize, 17);
    assert.equal(upgraded.settings.get()?.defaultOpacity, Math.max(5, previousOpacity));
    assert.equal(upgraded.settings.update({ defaultOpacity: 5 }).defaultOpacity, 5);
    assert.equal(upgraded.widgets.update(widget.id, { opacity: 5 })?.opacity, 5);
    assert.equal(handle.sqlite.pragma('foreign_keys', { simple: true }), 1);
    assert.deepEqual(handle.sqlite.pragma('foreign_key_check'), []);
    handle.close();

    handle = openDatabase(databasePath, migrationsFolder);
    const reopened = createRepositories(handle.db);
    assert.equal(reopened.settings.get()?.defaultOpacity, 5);
    assert.equal(reopened.widgets.getById(widget.id)?.opacity, 5);
    reopened.widgets.delete(widget.id);
    assert.equal(reopened.todos.getById(todo.id), undefined);
    assert.equal(reopened.clipItems.getById(clip.id), undefined);
  });
}

test('persists the global window and text settings', () => {
  const updated = repositories.settings.update({
    pinAll: true,
    autostart: true,
    snap: false,
    opacityBar: false,
    hoverFull: false,
    maxLines: 2,
    defaultOpacity: 72,
  });

  assert.equal(updated.pinAll, true);
  assert.equal(updated.autostart, true);
  assert.equal(updated.snap, false);
  assert.equal(updated.opacityBar, false);
  assert.equal(updated.hoverFull, false);
  assert.equal(updated.maxLines, 2);
  assert.equal(updated.defaultOpacity, 72);
});

test('provides stable color presets and derived display colors', () => {
  assert.deepEqual(COLOR_PRESETS.map((preset) => preset.id), ['plain', 'kraft', 'blueprint', 'grass']);
  assert.equal(COLOR_PRESETS[0].name, '经典黄');
  const derived = deriveColorVars(COLOR_PRESETS[0]);
  assert.equal(derived.title, '#FFE566');
  assert.equal(derived.sub, '#888888');
  assert.equal(derived.soft, '#F1F1F1');
});

test('saves and edits named custom kits independently from built-in colors', () => {
  const preset = { ...COLOR_PRESETS[0] };
  const colors = normalizeKitColors({ paper: '#dceedd', accent: '#e44d70', ink: '#222222' });
  const created = repositories.customKits.create({ name: '我的套装', ...colors });
  assert.equal(created.title, '#E44D70');
  assert.equal(created.shadow, '#222222');
  assert.equal(created.spine, null);
  const updated = repositories.customKits.update(created.id, {
    name: '修改后的套装', ...normalizeKitColors({ ...colors, accent: '#77bbcc' }),
  });
  assert.equal(updated?.name, '修改后的套装');
  assert.equal(updated?.title, '#77BBCC');
  assert.equal(updated?.accent, '#77BBCC');
  assert.deepEqual(COLOR_PRESETS[0], preset);
});

test('persists selected kit identity when named kits share the same colors', () => {
  const colors = normalizeKitColors(COLOR_PRESETS[0]);
  const first = repositories.customKits.create({ name: '套装一', ...colors });
  const second = repositories.customKits.create({ name: '套装二', ...colors });
  repositories.settings.update({ defaultColorKitId: second.id });
  const widget = repositories.widgets.create({ type: 'note', colorKitId: first.id });
  handle.close();
  handle = openDatabase(path.join(temporaryDirectory, 'test.sqlite'), migrationsFolder);
  repositories = createRepositories(handle.db);
  assert.equal(repositories.settings.get()?.defaultColorKitId, second.id);
  assert.equal(repositories.widgets.getById(widget.id)?.colorKitId, first.id);
  assert.equal(repositories.customKits.getById(second.id)?.name, '套装二');
});

test('preserves chosen text colors even when the background has low contrast', () => {
  const preset = COLOR_PRESETS[0];
  for (const [paper, ink] of [
    ['#2770C4', '#292C2E'],
    ['#FFFFFF', '#CCCCCC'],
    ['#292C2E', '#292C2E'],
  ]) {
    const colors = deriveColorVars({ ...preset, paper, ink, accent: '#4F81BA', title: '#4F81BA', shadow: ink });
    assert.equal(colors.paper, paper);
    assert.equal(colors.ink, ink);
    assert.equal(colors.accent, '#4F81BA');
    assert.equal(colors.title, '#4F81BA');
    assert.equal(colors.shadow, ink);
  }
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
