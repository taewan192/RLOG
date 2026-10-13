CREATE TABLE `characters` (
	`name` text PRIMARY KEY NOT NULL,
	`server` text NOT NULL,
	`job` text NOT NULL,
	`guild` text,
	`item_level` real NOT NULL,
	`combat_power` real NOT NULL,
	`profile` text NOT NULL,
	`updated_at` text NOT NULL,
	`searches` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT '접수' NOT NULL,
	`created_at` text NOT NULL
);
