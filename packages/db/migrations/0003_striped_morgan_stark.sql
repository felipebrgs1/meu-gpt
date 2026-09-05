CREATE TABLE `login_attempts` (
	`ip` text PRIMARY KEY NOT NULL,
	`fails` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`updated_at` text NOT NULL
);
