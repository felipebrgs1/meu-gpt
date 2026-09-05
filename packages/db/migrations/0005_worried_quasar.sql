CREATE TABLE `auth_state` (
	`id` text PRIMARY KEY NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`must_change` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
