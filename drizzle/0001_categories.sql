ALTER TABLE `expenses` ADD `category` text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE `groups` ADD `kind` text DEFAULT 'other' NOT NULL;