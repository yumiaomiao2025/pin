PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`default_paper_color` text DEFAULT '#FFFFFF' NOT NULL,
	`default_ink_color` text DEFAULT '#111111' NOT NULL,
	`default_title_color` text DEFAULT '#FFE566',
	`default_accent_color` text DEFAULT '#FFE566' NOT NULL,
	`default_spine_color` text,
	`default_shadow_color` text DEFAULT '#111111' NOT NULL,
	`font_size` integer DEFAULT 13 NOT NULL,
	`max_lines` integer DEFAULT 0 NOT NULL,
	`hover_full` integer DEFAULT true NOT NULL,
	`opacity_bar` integer DEFAULT true NOT NULL,
	`default_opacity` integer DEFAULT 100 NOT NULL,
	`pin_all` integer DEFAULT false NOT NULL,
	`autostart` integer DEFAULT false NOT NULL,
	`snap` integer DEFAULT true NOT NULL,
	CONSTRAINT "settings_singleton_id_check" CHECK("__new_settings"."id" = 1),
	CONSTRAINT "settings_max_lines_check" CHECK("__new_settings"."max_lines" between 0 and 3),
	CONSTRAINT "settings_font_size_check" CHECK("__new_settings"."font_size" between 11 and 18),
	CONSTRAINT "settings_opacity_check" CHECK("__new_settings"."default_opacity" between 5 and 100)
);
--> statement-breakpoint
INSERT INTO `__new_settings`("id", "default_paper_color", "default_ink_color", "default_title_color", "default_accent_color", "default_spine_color", "default_shadow_color", "font_size", "max_lines", "hover_full", "opacity_bar", "default_opacity", "pin_all", "autostart", "snap") SELECT "id", "default_paper_color", "default_ink_color", "default_title_color", "default_accent_color", "default_spine_color", "default_shadow_color", "font_size", "max_lines", "hover_full", "opacity_bar", "default_opacity", "pin_all", "autostart", "snap" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;