PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`theme` text DEFAULT 'light' NOT NULL,
	`auto_theme` integer DEFAULT false NOT NULL,
	`default_paper_color` text DEFAULT '#FFFFFF' NOT NULL,
	`default_ink_color` text DEFAULT '#111111' NOT NULL,
	`default_title_color` text DEFAULT '#FFE566',
	`default_accent_color` text DEFAULT '#FFE566' NOT NULL,
	`default_spine_color` text,
	`default_shadow_color` text DEFAULT '#111111' NOT NULL,
	`font_size` integer DEFAULT 13 NOT NULL,
	`scrollbar` text DEFAULT 'overlay' NOT NULL,
	`max_lines` integer DEFAULT 0 NOT NULL,
	`hover_full` integer DEFAULT true NOT NULL,
	`opacity_bar` integer DEFAULT true NOT NULL,
	`default_opacity` integer DEFAULT 100 NOT NULL,
	`pin_all` integer DEFAULT false NOT NULL,
	`autostart` integer DEFAULT false NOT NULL,
	`snap` integer DEFAULT true NOT NULL,
	CONSTRAINT "settings_singleton_id_check" CHECK("__new_settings"."id" = 1),
	CONSTRAINT "settings_theme_check" CHECK("__new_settings"."theme" in ('light', 'dark')),
	CONSTRAINT "settings_scrollbar_check" CHECK("__new_settings"."scrollbar" in ('always', 'overlay', 'hidden')),
	CONSTRAINT "settings_max_lines_check" CHECK("__new_settings"."max_lines" between 0 and 3),
	CONSTRAINT "settings_font_size_check" CHECK("__new_settings"."font_size" between 11 and 18),
	CONSTRAINT "settings_opacity_check" CHECK("__new_settings"."default_opacity" between 1 and 100)
);
--> statement-breakpoint
INSERT INTO `__new_settings`("id", "theme", "auto_theme", "default_paper_color", "default_ink_color", "default_title_color", "default_accent_color", "default_spine_color", "default_shadow_color", "font_size", "scrollbar", "max_lines", "hover_full", "opacity_bar", "default_opacity", "pin_all", "autostart", "snap") SELECT "id", "theme", "auto_theme", "default_paper_color", "default_ink_color", "default_title_color", "default_accent_color", "default_spine_color", "default_shadow_color", "font_size", "scrollbar", "max_lines", "hover_full", "opacity_bar", "default_opacity", "pin_all", "autostart", "snap" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;--> statement-breakpoint
CREATE TABLE `__new_widgets` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`x` integer DEFAULT 0 NOT NULL,
	`y` integer DEFAULT 0 NOT NULL,
	`width` integer DEFAULT 320 NOT NULL,
	`height` integer DEFAULT 320 NOT NULL,
	`display_id` integer,
	`z_index` integer DEFAULT 0 NOT NULL,
	`pin` integer DEFAULT false NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`collapsed` integer DEFAULT false NOT NULL,
	`opacity` integer DEFAULT 100 NOT NULL,
	`note_text` text DEFAULT '' NOT NULL,
	`active_tab` text DEFAULT 'note' NOT NULL,
	`paper_color` text DEFAULT '#FFFFFF' NOT NULL,
	`ink_color` text DEFAULT '#111111' NOT NULL,
	`title_color` text DEFAULT '#FFE566',
	`accent_color` text DEFAULT '#FFE566' NOT NULL,
	`spine_color` text,
	`shadow_color` text DEFAULT '#111111' NOT NULL,
	`follows_default` integer DEFAULT true NOT NULL,
	CONSTRAINT "widgets_type_check" CHECK("__new_widgets"."type" in ('note', 'todo', 'clip', 'desk')),
	CONSTRAINT "widgets_width_check" CHECK("__new_widgets"."width" >= 240),
	CONSTRAINT "widgets_height_check" CHECK("__new_widgets"."height" >= 160),
	CONSTRAINT "widgets_opacity_check" CHECK("__new_widgets"."opacity" between 1 and 100),
	CONSTRAINT "widgets_active_tab_check" CHECK("__new_widgets"."active_tab" in ('note', 'todo', 'clip'))
);
--> statement-breakpoint
INSERT INTO `__new_widgets`("id", "type", "title", "x", "y", "width", "height", "display_id", "z_index", "pin", "hidden", "collapsed", "opacity", "note_text", "active_tab", "paper_color", "ink_color", "title_color", "accent_color", "spine_color", "shadow_color", "follows_default") SELECT "id", "type", "title", "x", "y", "width", "height", "display_id", "z_index", "pin", "hidden", "collapsed", "opacity", "note_text", "active_tab", "paper_color", "ink_color", "title_color", "accent_color", "spine_color", "shadow_color", "follows_default" FROM `widgets`;--> statement-breakpoint
DROP TABLE `widgets`;--> statement-breakpoint
ALTER TABLE `__new_widgets` RENAME TO `widgets`;--> statement-breakpoint
CREATE INDEX `widgets_type_idx` ON `widgets` (`type`);--> statement-breakpoint
CREATE INDEX `widgets_z_index_idx` ON `widgets` (`z_index`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
