ALTER TABLE `documents` ADD `original_filename` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `mime_type` text DEFAULT 'text/plain' NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `file_size` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` ADD `page_count` integer;