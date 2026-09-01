CREATE TABLE `clip_items` (
	`id` text PRIMARY KEY NOT NULL,
	`widget_id` text NOT NULL,
	`text` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`widget_id`) REFERENCES `widgets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `clip_items_widget_sort_idx` ON `clip_items` (`widget_id`,`sort_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `clip_items_widget_text_unique` ON `clip_items` (`widget_id`,`text`);--> statement-breakpoint
CREATE TABLE `custom_kits` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`paper` text NOT NULL,
	`ink` text NOT NULL,
	`title` text,
	`accent` text NOT NULL,
	`spine` text,
	`shadow` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `custom_kits_name_idx` ON `custom_kits` (`name`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`theme` text DEFAULT 'light' NOT NULL,
	`auto_theme` integer DEFAULT false NOT NULL,
	`default_paper_color` text DEFAULT '#FFFFFF' NOT NULL,
	`default_ink_color` text DEFAULT '#111111' NOT NULL,
	`default_title_color` text DEFAULT '#FFE566',
	`default_accent_color` text DEFAULT '#FFE566' NOT NULL,
	`default_spine_color` text,
	`default_shadow_color` text DEFAULT '#111111' NOT NULL,
	`scrollbar` text DEFAULT 'overlay' NOT NULL,
	`max_lines` integer DEFAULT 0 NOT NULL,
	`hover_full` integer DEFAULT true NOT NULL,
	`opacity_bar` integer DEFAULT true NOT NULL,
	`default_opacity` integer DEFAULT 100 NOT NULL,
	`pin_all` integer DEFAULT false NOT NULL,
	`autostart` integer DEFAULT false NOT NULL,
	`snap` integer DEFAULT true NOT NULL,
	CONSTRAINT "settings_singleton_id_check" CHECK("settings"."id" = 1),
	CONSTRAINT "settings_theme_check" CHECK("settings"."theme" in ('light', 'dark')),
	CONSTRAINT "settings_scrollbar_check" CHECK("settings"."scrollbar" in ('always', 'overlay', 'hidden')),
	CONSTRAINT "settings_max_lines_check" CHECK("settings"."max_lines" between 0 and 3),
	CONSTRAINT "settings_opacity_check" CHECK("settings"."default_opacity" between 35 and 100)
);
--> statement-breakpoint
CREATE TABLE `todos` (
	`id` text PRIMARY KEY NOT NULL,
	`widget_id` text NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`widget_id`) REFERENCES `widgets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `todos_widget_sort_idx` ON `todos` (`widget_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `widgets` (
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
	CONSTRAINT "widgets_type_check" CHECK("widgets"."type" in ('note', 'todo', 'clip', 'desk')),
	CONSTRAINT "widgets_width_check" CHECK("widgets"."width" >= 240),
	CONSTRAINT "widgets_height_check" CHECK("widgets"."height" >= 160),
	CONSTRAINT "widgets_opacity_check" CHECK("widgets"."opacity" between 35 and 100),
	CONSTRAINT "widgets_active_tab_check" CHECK("widgets"."active_tab" in ('note', 'todo', 'clip'))
);
--> statement-breakpoint
CREATE INDEX `widgets_type_idx` ON `widgets` (`type`);--> statement-breakpoint
CREATE INDEX `widgets_z_index_idx` ON `widgets` (`z_index`);