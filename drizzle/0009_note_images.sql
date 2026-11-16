CREATE TABLE `note_images` (
	`id` text PRIMARY KEY NOT NULL,
	`widget_id` text NOT NULL,
	`offset` integer NOT NULL,
	`mime` text NOT NULL,
	`data` blob NOT NULL,
	FOREIGN KEY (`widget_id`) REFERENCES `widgets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_images_widget_offset_idx` ON `note_images` (`widget_id`,`offset`);