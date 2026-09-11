import {
  int,
  index,
  decimal,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: text("name"),
    email: varchar("email", { length: 320 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: mysqlEnum("role", ["user", "admin", "super_admin", "branch_admin", "viewer"]).default("viewer").notNull(),
    branchId: int("branchId"),
    status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  (table) => ({ branchIdx: index("users_branch_idx").on(table.branchId) }),
);

export const branches = mysqlTable(
  "branches",
  {
    id: int("id").autoincrement().primaryKey(),
    code: varchar("code", { length: 16 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    address: varchar("address", { length: 255 }),
    status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({ codeUnique: uniqueIndex("branches_code_unique").on(table.code), statusIdx: index("branches_status_idx").on(table.status) }),
);

export const teams = mysqlTable(
  "teams",
  {
    id: int("id").autoincrement().primaryKey(),
    branchId: int("branchId").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({ branchIdx: index("teams_branch_idx").on(table.branchId), statusIdx: index("teams_status_idx").on(table.status) }),
);

export const qrCodes = mysqlTable(
  "qr_codes",
  {
    id: int("id").autoincrement().primaryKey(),
    branchId: int("branchId"),
    name: varchar("name", { length: 160 }).notNull(),
    code: varchar("code", { length: 32 }).notNull(),
    url: varchar("url", { length: 255 }).notNull(),
    status: mysqlEnum("status", ["active", "inactive"]).default("active").notNull(),
    createdBy: int("createdBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({ codeUnique: uniqueIndex("qr_codes_code_unique").on(table.code), branchIdx: index("qr_codes_branch_idx").on(table.branchId), statusIdx: index("qr_codes_status_idx").on(table.status) }),
);

export const reviews = mysqlTable(
  "reviews",
  {
    id: int("id").autoincrement().primaryKey(),
    branchId: int("branchId"),
    qrCodeId: int("qrCodeId"),
    teamId: int("teamId"),
    receiptNo: varchar("receiptNo", { length: 80 }).notNull(),
    installationRating: int("installationRating").notNull(),
    groomingRating: int("groomingRating").notNull(),
    serviceRating: int("serviceRating").notNull(),
    comment: text("comment"),
    note: text("note"),
    // "new" tetap ada di enum (data lama), tapi UI memperlakukannya sebagai Open
    // + badge "New". readAt = kapan admin pertama kali membuka detail (unread dot).
    status: mysqlEnum("status", ["new", "open", "resolved", "archived"]).default("new").notNull(),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    branchIdx: index("reviews_branch_idx").on(table.branchId),
    qrIdx: index("reviews_qr_idx").on(table.qrCodeId),
    receiptIdx: index("reviews_receipt_idx").on(table.receiptNo),
    receiptBranchUnique: uniqueIndex("reviews_branch_receipt_unique").on(table.branchId, table.receiptNo),
    createdIdx: index("reviews_created_idx").on(table.createdAt),
    statusIdx: index("reviews_status_idx").on(table.status),
    ratingsIdx: index("reviews_ratings_idx").on(table.installationRating, table.groomingRating, table.serviceRating),
  }),
);

export const reviewAlerts = mysqlTable(
  "review_alerts",
  {
    id: int("id").autoincrement().primaryKey(),
    reviewId: int("reviewId").notNull(),
    type: varchar("type", { length: 64 }).notNull(),
    severity: mysqlEnum("severity", ["critical", "attention", "info"]).default("critical").notNull(),
    message: varchar("message", { length: 255 }).notNull(),
    status: mysqlEnum("status", ["open", "resolved"]).default("open").notNull(),
    resolvedBy: int("resolvedBy"),
    resolvedAt: timestamp("resolvedAt"),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({ reviewIdx: index("alerts_review_idx").on(table.reviewId), statusIdx: index("alerts_status_idx").on(table.status), severityIdx: index("alerts_severity_idx").on(table.severity) }),
);

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId"),
    action: varchar("action", { length: 160 }).notNull(),
    targetType: varchar("targetType", { length: 80 }).notNull(),
    targetId: int("targetId"),
    metadata: text("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({ userIdx: index("audit_user_idx").on(table.userId), createdIdx: index("audit_created_idx").on(table.createdAt) }),
);

export const settings = mysqlTable("settings", {
  id: int("id").autoincrement().primaryKey(),
  companyName: varchar("companyName", { length: 160 }).default("Service Solution").notNull(),
  reviewPageTitle: varchar("reviewPageTitle", { length: 160 }).default("Bagikan pengalaman Anda").notNull(),
  thankYouMessage: varchar("thankYouMessage", { length: 500 }).default("Masukan Anda membantu kami meningkatkan kualitas layanan.").notNull(),
  negativeThreshold: decimal("negativeThreshold", { precision: 3, scale: 1 }).default("3.5").notNull(),
  timezone: varchar("timezone", { length: 64 }).default("Asia/Jakarta").notNull(),
  primaryColor: varchar("primaryColor", { length: 32 }).default("#1d6f63").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Branch = typeof branches.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type QRCode = typeof qrCodes.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type ReviewAlert = typeof reviewAlerts.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type InsertReview = typeof reviews.$inferInsert;
export type InsertBranch = typeof branches.$inferInsert;
export type InsertTeam = typeof teams.$inferInsert;
export type InsertQRCode = typeof qrCodes.$inferInsert;
export type InsertReviewAlert = typeof reviewAlerts.$inferInsert;
export type InsertAuditLog = typeof auditLogs.$inferInsert;
export type InsertSettings = typeof settings.$inferInsert;

export const overallRating = (review: Pick<Review, "installationRating" | "groomingRating" | "serviceRating">) =>
  Math.round(((review.installationRating + review.groomingRating + review.serviceRating) / 3) * 100) / 100;

export const decimalToNumber = (value: string | number | null | undefined) => (value == null ? 0 : Number(value));
