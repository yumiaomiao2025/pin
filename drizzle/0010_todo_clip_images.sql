CREATE TABLE `clip_images` (
	`clip_id` text PRIMARY KEY NOT NULL,
	`mime` text NOT NULL,
	`data` blob NOT NULL,
	FOREIGN KEY (`clip_id`) REFERENCES `clip_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `todo_images` (
	`id` text PRIMARY KEY NOT NULL,
	`todo_id` text NOT NULL,
	`offset` integer NOT NULL,
	`mime` text NOT NULL,
	`data` blob NOT NULL,
	FOREIGN KEY (`todo_id`) REFERENCES `todos`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `todo_images_todo_offset_idx` ON `todo_images` (`todo_id`,`offset`);--> statement-breakpoint
DROP INDEX `clip_items_widget_text_unique`;--> statement-breakpoint
ALTER TABLE `clip_items` ADD `kind` text DEFAULT 'text' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `clip_items_widget_kind_text_unique` ON `clip_items` (`widget_id`,`kind`,`text`);