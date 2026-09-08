-- Add composite unique constraint to prevent duplicate receipt per branch (race-condition-safe)
ALTER TABLE `reviews` ADD UNIQUE INDEX `reviews_branch_receipt_unique`(`branchId`, `receiptNo`);
