CREATE TABLE `alerts_sent` (
	`eventId` text NOT NULL,
	`recipient` text NOT NULL,
	`status` text NOT NULL,
	`idempotencyKey` text NOT NULL,
	`sentAt` integer,
	FOREIGN KEY (`eventId`) REFERENCES `reply_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alerts_sent_idempotencyKey_unique` ON `alerts_sent` (`idempotencyKey`);--> statement-breakpoint
CREATE UNIQUE INDEX `alert_event_recipient` ON `alerts_sent` (`eventId`,`recipient`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`brief` text DEFAULT '' NOT NULL,
	`sample` text DEFAULT '' NOT NULL,
	`tone` text DEFAULT 'professional' NOT NULL,
	`minWords` integer DEFAULT 50 NOT NULL,
	`maxWords` integer DEFAULT 150 NOT NULL,
	`bannedPhrases` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `column_mappings` (
	`sheetId` text PRIMARY KEY NOT NULL,
	`mapping` text NOT NULL,
	FOREIGN KEY (`sheetId`) REFERENCES `sheets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`firstContactedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_email_unique` ON `contacts` (`email`);--> statement-breakpoint
CREATE TABLE `daily_counters` (
	`localDate` text PRIMARY KEY NOT NULL,
	`sentCount` integer DEFAULT 0 NOT NULL,
	`capApplied` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`campaignId` text NOT NULL,
	`leadId` text NOT NULL,
	`versionId` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`flags` text DEFAULT '[]' NOT NULL,
	`usedFields` text DEFAULT '[]' NOT NULL,
	`confidence` real DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`edited` integer DEFAULT false NOT NULL,
	`idempotencyKey` text NOT NULL,
	`isTest` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`leadId`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`versionId`) REFERENCES `template_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drafts_idempotencyKey_unique` ON `drafts` (`idempotencyKey`);--> statement-breakpoint
CREATE UNIQUE INDEX `draft_lead_version_test` ON `drafts` (`leadId`,`versionId`,`isTest`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`campaignId` text NOT NULL,
	`status` text NOT NULL,
	`total` integer NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`errors` integer DEFAULT 0 NOT NULL,
	`tokens` integer DEFAULT 0 NOT NULL,
	`lastError` text,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`campaignId` text NOT NULL,
	`sheetId` text NOT NULL,
	`contactId` text,
	`raw` text NOT NULL,
	`cleaned` text NOT NULL,
	`segment` text NOT NULL,
	FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sheetId`) REFERENCES `sheets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reply_events` (
	`id` text PRIMARY KEY NOT NULL,
	`messageId` text NOT NULL,
	`sendId` text NOT NULL,
	`type` text NOT NULL,
	`snippet` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`sendId`) REFERENCES `send_log`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reply_events_messageId_unique` ON `reply_events` (`messageId`);--> statement-breakpoint
CREATE TABLE `send_log` (
	`id` text PRIMARY KEY NOT NULL,
	`draftId` text NOT NULL,
	`contactId` text NOT NULL,
	`startedAt` integer NOT NULL,
	`sentAt` integer,
	`localDate` text NOT NULL,
	`messageId` text,
	`threadId` text,
	`status` text NOT NULL,
	`error` text,
	`dryRun` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`draftId`) REFERENCES `drafts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contactId`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `send_log_draftId_unique` ON `send_log` (`draftId`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sheets` (
	`id` text PRIMARY KEY NOT NULL,
	`campaignId` text NOT NULL,
	`name` text NOT NULL,
	`headers` text NOT NULL,
	`rowCount` integer NOT NULL,
	FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `suppression` (
	`email` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `template_analyses` (
	`campaignId` text PRIMARY KEY NOT NULL,
	`analysis` text NOT NULL,
	FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `template_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`campaignId` text NOT NULL,
	`analysis` text NOT NULL,
	`sample` text NOT NULL,
	`approved` integer DEFAULT false NOT NULL,
	`testedAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `worker_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
