ALTER TABLE `reviews` MODIFY COLUMN `status` enum('new','open','reviewed','resolved','archived') NOT NULL DEFAULT 'new';--> statement-breakpoint
ALTER TABLE `qr_codes` MODIFY COLUMN `branchId` int;
