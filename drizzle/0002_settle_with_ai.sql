CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`title` text NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`share_token` text NOT NULL,
	`share_images` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `batches_share_token_unique` ON `batches` (`share_token`);--> statement-breakpoint
CREATE INDEX `batches_group_idx` ON `batches` (`group_id`);--> statement-breakpoint
CREATE TABLE `bill_images` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`batch_id` text,
	`expense_id` text,
	`bill_no` integer,
	`mime` text NOT NULL,
	`bytes` blob NOT NULL,
	`thumb` blob NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`expense_id`) REFERENCES `expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `bill_images_group_idx` ON `bill_images` (`group_id`);--> statement-breakpoint
CREATE INDEX `bill_images_expense_idx` ON `bill_images` (`expense_id`);--> statement-breakpoint
CREATE INDEX `bill_images_batch_idx` ON `bill_images` (`batch_id`);--> statement-breakpoint
ALTER TABLE `expenses` ADD `batch_id` text REFERENCES batches(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `expenses` ADD `note` text;--> statement-breakpoint
CREATE INDEX `expenses_batch_idx` ON `expenses` (`batch_id`);--> statement-breakpoint
ALTER TABLE `settlements` ADD `batch_id` text REFERENCES batches(id) ON DELETE set null;