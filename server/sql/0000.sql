CREATE TABLE IF NOT EXISTS `comments` (
	`id` integer PRIMARY KEY NOT NULL,
	`feed_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `feeds` (
	`id` integer PRIMARY KEY NOT NULL,
	`alias` text,
	`title` text,
	`content` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`allow_comment` TINYINT DEFAULT 1 NOT NULL,
	`status` TEXT CHECK (status IN ('publish', 'draft', 'private')) DEFAULT 'publish' NOT NULL,
	`property` TEXT CHECK (property IN ('post', 'page')) DEFAULT 'post' NOT NULL,
	`views` INTEGER DEFAULT 0 NOT NULL,
	`uid` integer NOT NULL,
	`top` INTEGER DEFAULT 0
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`uid`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `friends` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`desc` text,
	`avatar` text NOT NULL,
	`url` text NOT NULL,
	`uid` integer NOT NULL,
	`accepted` integer DEFAULT 0 NOT NULL,
	`health` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`uid`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`openid` text NOT NULL,
	`avatar` text,
	`permission` integer DEFAULT 0,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `metas` (
    `id` integer PRIMARY KEY NOT NULL,
    `name` text NOT NULL,
    `alias` text,
    `type` text NOT NULL,
    `description` text,
    `parent` integer,
    `created_at` integer DEFAULT (unixepoch()) NOT NULL,
    `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (`parent`) REFERENCES `metas`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `feed_metas` (
    `feed_id` integer NOT NULL,
    `meta_id` integer NOT NULL,
    `type` text NOT NULL,
    `created_at` integer DEFAULT (unixepoch()) NOT NULL,
    `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY (`meta_id`) REFERENCES `metas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX idx_metas_type ON metas(type);
CREATE INDEX idx_metas_alias ON metas(alias);
CREATE INDEX idx_feed_metas_type ON feed_metas(type);
