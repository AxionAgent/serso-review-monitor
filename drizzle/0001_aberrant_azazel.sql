CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`action` varchar(160) NOT NULL,
	`targetType` varchar(80) NOT NULL,
	`targetId` int,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `branches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(16) NOT NULL,
	`name` varchar(160) NOT NULL,
	`address` varchar(255),
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `branches_id` PRIMARY KEY(`id`),
	CONSTRAINT `branches_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `qr_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`code` varchar(32) NOT NULL,
	`url` varchar(255) NOT NULL,
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `qr_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `qr_codes_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `review_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reviewId` int NOT NULL,
	`type` varchar(64) NOT NULL,
	`severity` enum('critical','attention','info') NOT NULL DEFAULT 'critical',
	`message` varchar(255) NOT NULL,
	`status` enum('open','resolved') NOT NULL DEFAULT 'open',
	`resolvedBy` int,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `review_alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`qrCodeId` int,
	`teamId` int,
	`receiptNo` varchar(80) NOT NULL,
	`installationRating` int NOT NULL,
	`groomingRating` int NOT NULL,
	`serviceRating` int NOT NULL,
	`comment` text,
	`status` enum('new','reviewed','resolved','archived') NOT NULL DEFAULT 'new',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyName` varchar(160) NOT NULL DEFAULT 'Layanan Prima',
	`reviewPageTitle` varchar(160) NOT NULL DEFAULT 'Bagikan pengalaman Anda',
	`thankYouMessage` text NOT NULL DEFAULT ('Masukan Anda membantu kami meningkatkan kualitas layanan.'),
	`negativeThreshold` int NOT NULL DEFAULT 2,
	`timezone` varchar(64) NOT NULL DEFAULT 'Asia/Jakarta',
	`primaryColor` varchar(32) NOT NULL DEFAULT '#1d6f63',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teams_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','super_admin','branch_admin','viewer') NOT NULL DEFAULT 'viewer';--> statement-breakpoint
ALTER TABLE `users` ADD `branchId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `status` enum('active','inactive') DEFAULT 'active' NOT NULL;--> statement-breakpoint
CREATE INDEX `audit_user_idx` ON `audit_logs` (`userId`);--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `branches_status_idx` ON `branches` (`status`);--> statement-breakpoint
CREATE INDEX `qr_codes_branch_idx` ON `qr_codes` (`branchId`);--> statement-breakpoint
CREATE INDEX `qr_codes_status_idx` ON `qr_codes` (`status`);--> statement-breakpoint
CREATE INDEX `alerts_review_idx` ON `review_alerts` (`reviewId`);--> statement-breakpoint
CREATE INDEX `alerts_status_idx` ON `review_alerts` (`status`);--> statement-breakpoint
CREATE INDEX `alerts_severity_idx` ON `review_alerts` (`severity`);--> statement-breakpoint
CREATE INDEX `reviews_branch_idx` ON `reviews` (`branchId`);--> statement-breakpoint
CREATE INDEX `reviews_qr_idx` ON `reviews` (`qrCodeId`);--> statement-breakpoint
CREATE INDEX `reviews_receipt_idx` ON `reviews` (`receiptNo`);--> statement-breakpoint
CREATE INDEX `reviews_created_idx` ON `reviews` (`createdAt`);--> statement-breakpoint
CREATE INDEX `reviews_status_idx` ON `reviews` (`status`);--> statement-breakpoint
CREATE INDEX `reviews_ratings_idx` ON `reviews` (`installationRating`,`groomingRating`,`serviceRating`);--> statement-breakpoint
CREATE INDEX `teams_branch_idx` ON `teams` (`branchId`);--> statement-breakpoint
CREATE INDEX `teams_status_idx` ON `teams` (`status`);--> statement-breakpoint
CREATE INDEX `users_branch_idx` ON `users` (`branchId`);