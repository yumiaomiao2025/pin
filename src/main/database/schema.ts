import { relations, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

export const WIDGET_TYPES = ['note', 'todo', 'clip', 'desk'] as const;
export const DESK_TABS = ['note', 'todo', 'clip'] as const;
export const THEMES = ['light', 'dark'] as const;
export const SCROLLBAR_MODES = ['always', 'overlay', 'hidden'] as const;

export type WidgetType = (typeof WIDGET_TYPES)[number];
export type DeskTab = (typeof DESK_TABS)[number];
export type Theme = (typeof THEMES)[number];
export type ScrollbarMode = (typeof SCROLLBAR_MODES)[number];

export const DEFAULT_COLORS: Readonly<{
  paper: string;
  ink: string;
  title: string;
  accent: string;
  spine: string | null;
  shadow: string;
}> = {
  paper: '#FFFFFF',
  ink: '#111111',
  title: '#FFE566',
  accent: '#FFE566',
  spine: null,
  shadow: '#111111',
};

export const settings = sqliteTable(
  'settings',
  {
    id: integer('id').primaryKey(),
    theme: text('theme', { enum: THEMES }).notNull().default('light'),
    autoTheme: integer('auto_theme', { mode: 'boolean' }).notNull().default(false),
    defaultPaperColor: text('default_paper_color').notNull().default(DEFAULT_COLORS.paper),
    defaultInkColor: text('default_ink_color').notNull().default(DEFAULT_COLORS.ink),
    defaultTitleColor: text('default_title_color').default(DEFAULT_COLORS.title),
    defaultAccentColor: text('default_accent_color').notNull().default(DEFAULT_COLORS.accent),
    defaultSpineColor: text('default_spine_color'),
    defaultShadowColor: text('default_shadow_color').notNull().default(DEFAULT_COLORS.shadow),
    fontSize: integer('font_size').notNull().default(13),
    scrollbar: text('scrollbar', { enum: SCROLLBAR_MODES }).notNull().default('overlay'),
    maxLines: integer('max_lines').notNull().default(0),
    hoverFull: integer('hover_full', { mode: 'boolean' }).notNull().default(true),
    opacityBar: integer('opacity_bar', { mode: 'boolean' }).notNull().default(true),
    defaultOpacity: integer('default_opacity').notNull().default(100),
    pinAll: integer('pin_all', { mode: 'boolean' }).notNull().default(false),
    autostart: integer('autostart', { mode: 'boolean' }).notNull().default(false),
    snap: integer('snap', { mode: 'boolean' }).notNull().default(true),
  },
  (table) => [
    check('settings_singleton_id_check', sql`${table.id} = 1`),
    check('settings_theme_check', sql`${table.theme} in ('light', 'dark')`),
    check(
      'settings_scrollbar_check',
      sql`${table.scrollbar} in ('always', 'overlay', 'hidden')`,
    ),
    check('settings_max_lines_check', sql`${table.maxLines} between 0 and 3`),
    check('settings_font_size_check', sql`${table.fontSize} between 11 and 18`),
    check('settings_opacity_check', sql`${table.defaultOpacity} between 35 and 100`),
  ],
);

export const widgets = sqliteTable(
  'widgets',
  {
    id: text('id').primaryKey(),
    type: text('type', { enum: WIDGET_TYPES }).notNull(),
    title: text('title').notNull().default(''),
    x: integer('x').notNull().default(0),
    y: integer('y').notNull().default(0),
    width: integer('width').notNull().default(320),
    height: integer('height').notNull().default(320),
    displayId: integer('display_id'),
    zIndex: integer('z_index').notNull().default(0),
    pin: integer('pin', { mode: 'boolean' }).notNull().default(false),
    hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
    collapsed: integer('collapsed', { mode: 'boolean' }).notNull().default(false),
    opacity: integer('opacity').notNull().default(100),
    noteText: text('note_text').notNull().default(''),
    activeTab: text('active_tab', { enum: DESK_TABS }).notNull().default('note'),
    paperColor: text('paper_color').notNull().default(DEFAULT_COLORS.paper),
    inkColor: text('ink_color').notNull().default(DEFAULT_COLORS.ink),
    titleColor: text('title_color').default(DEFAULT_COLORS.title),
    accentColor: text('accent_color').notNull().default(DEFAULT_COLORS.accent),
    spineColor: text('spine_color'),
    shadowColor: text('shadow_color').notNull().default(DEFAULT_COLORS.shadow),
    followsDefault: integer('follows_default', { mode: 'boolean' }).notNull().default(true),
  },
  (table) => [
    index('widgets_type_idx').on(table.type),
    index('widgets_z_index_idx').on(table.zIndex),
    check('widgets_type_check', sql`${table.type} in ('note', 'todo', 'clip', 'desk')`),
    check('widgets_width_check', sql`${table.width} >= 240`),
    check('widgets_height_check', sql`${table.height} >= 160`),
    check('widgets_opacity_check', sql`${table.opacity} between 35 and 100`),
    check('widgets_active_tab_check', sql`${table.activeTab} in ('note', 'todo', 'clip')`),
  ],
);

export const todos = sqliteTable(
  'todos',
  {
    id: text('id').primaryKey(),
    widgetId: text('widget_id')
      .notNull()
      .references(() => widgets.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    done: integer('done', { mode: 'boolean' }).notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('todos_widget_sort_idx').on(table.widgetId, table.sortOrder)],
);

export const clipItems = sqliteTable(
  'clip_items',
  {
    id: text('id').primaryKey(),
    widgetId: text('widget_id')
      .notNull()
      .references(() => widgets.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    unique('clip_items_widget_text_unique').on(table.widgetId, table.text),
    index('clip_items_widget_sort_idx').on(table.widgetId, table.sortOrder),
  ],
);

export const customKits = sqliteTable(
  'custom_kits',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    paper: text('paper').notNull(),
    ink: text('ink').notNull(),
    title: text('title'),
    accent: text('accent').notNull(),
    spine: text('spine'),
    shadow: text('shadow').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('custom_kits_name_idx').on(table.name)],
);

export const widgetsRelations = relations(widgets, ({ many }) => ({
  todos: many(todos),
  clipItems: many(clipItems),
}));

export const todosRelations = relations(todos, ({ one }) => ({
  widget: one(widgets, {
    fields: [todos.widgetId],
    references: [widgets.id],
  }),
}));

export const clipItemsRelations = relations(clipItems, ({ one }) => ({
  widget: one(widgets, {
    fields: [clipItems.widgetId],
    references: [widgets.id],
  }),
}));

export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;
export type Widget = typeof widgets.$inferSelect;
export type NewWidget = typeof widgets.$inferInsert;
export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;
export type ClipItem = typeof clipItems.$inferSelect;
export type NewClipItem = typeof clipItems.$inferInsert;
export type CustomKit = typeof customKits.$inferSelect;
export type NewCustomKit = typeof customKits.$inferInsert;

export const schema = {
  settings,
  widgets,
  todos,
  clipItems,
  customKits,
  widgetsRelations,
  todosRelations,
  clipItemsRelations,
};

export type AppSchema = typeof schema;
