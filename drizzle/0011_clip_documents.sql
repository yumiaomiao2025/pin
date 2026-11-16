CREATE TABLE `__new_clip_images` (
	`id` text PRIMARY KEY NOT NULL,
	`clip_id` text NOT NULL,
	`offset` integer NOT NULL,
	`mime` text NOT NULL,
	`data` blob NOT NULL,
	FOREIGN KEY (`clip_id`) REFERENCES `clip_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_clip_images` (`id`, `clip_id`, `offset`, `mime`, `data`)
SELECT `clip_id`, `clip_id`, 0, `mime`, `data` FROM `clip_images`;--> statement-breakpoint
DROP TABLE `clip_images`;--> statement-breakpoint
ALTER TABLE `__new_clip_images` RENAME TO `clip_images`;--> statement-breakpoint
CREATE INDEX `clip_images_clip_offset_idx` ON `clip_images` (`clip_id`,`offset`);--> statement-breakpoint
ALTER TABLE `clip_items` ADD `document_text` text;--> statement-breakpoint
UPDATE `clip_items` SET `document_text` = char(10) WHERE `kind` = 'image';
