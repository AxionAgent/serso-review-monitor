import { and, desc, eq, inArray, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  auditLogs,
  branches,
  InsertAuditLog,
  InsertBranch,
  InsertQRCode,
  InsertReview,
  InsertReviewAlert,
  InsertTeam,
  qrCodes,
  reviewAlerts,
  reviews,
  settings,
  teams,
  User,
  users,
  overallRating,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { resolveStoreFromTicket, storeLabel } from "./store";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: Partial<User> & Pick<User, "openId">): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: any = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  for (const field of ["name", "email", "loginMethod", "branchId", "status"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = values[field];
    }
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export type ScopeUser = Pick<User, "role" | "branchId"> | null | undefined;
export function isSuperAdmin(user: ScopeUser) {
  return user?.role === "admin" || user?.role === "super_admin";
}
export function scopedBranchId(user: ScopeUser) {
  return user?.role === "branch_admin" ? user.branchId ?? -1 : undefined;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db;
}

export async function getSettings() {
  const db = await requireDb();
  const row = await db.select().from(settings).limit(1);
  if (row[0]) return row[0];
  await db.insert(settings).values({});
  return (await db.select().from(settings).limit(1))[0];
}

export async function findActiveQR(code: string) {
  const db = await requireDb();
  const result = await db
    .select({ qr: qrCodes, branch: branches })
    .from(qrCodes)
    .leftJoin(branches, eq(qrCodes.branchId, branches.id))
    .where(eq(qrCodes.code, code.trim().toUpperCase()))
    .limit(1);
  return result[0];
}

export async function listBranches(user?: ScopeUser) {
  const db = await requireDb();
  const branchId = scopedBranchId(user);
  return db.select().from(branches).where(branchId === undefined ? undefined : eq(branches.id, branchId)).orderBy(branches.name);
}

export async function listTeams(user?: ScopeUser) {
  const db = await requireDb();
  const branchId = scopedBranchId(user);
  return db.select().from(teams).where(branchId === undefined ? undefined : eq(teams.branchId, branchId)).orderBy(teams.name);
}

export async function getBranchActiveTeams(branchId: number) {
  const db = await requireDb();
  return db.select({ id: teams.id, name: teams.name }).from(teams).where(and(eq(teams.branchId, branchId), eq(teams.status, "active"))).orderBy(teams.name);
}

export async function listQRCodes(user?: ScopeUser) {
  const db = await requireDb();
  const branchId = scopedBranchId(user);
  const query = db
    .select({ qr: qrCodes, branchName: branches.name })
    .from(qrCodes)
    .leftJoin(branches, eq(qrCodes.branchId, branches.id));
  return query.where(branchId === undefined ? undefined : eq(qrCodes.branchId, branchId)).orderBy(desc(qrCodes.createdAt));
}

/** Public homepage routes: active QR codes with their active branch (no auth). */
export async function listPublicRoutes() {
  const db = await requireDb();
  const rows = await db
    .select({ code: qrCodes.code, name: qrCodes.name, branchName: branches.name })
    .from(qrCodes)
    .innerJoin(branches, eq(qrCodes.branchId, branches.id))
    .where(and(eq(qrCodes.status, "active"), eq(branches.status, "active")))
    .orderBy(branches.name, qrCodes.name);
  return rows;
}

async function getJoinedReviews(user?: ScopeUser) {
  const db = await requireDb();
  const branchId = scopedBranchId(user);
  const rows = await db
    .select({ review: reviews, branch: branches, qr: qrCodes, team: teams })
    .from(reviews)
    .leftJoin(branches, eq(reviews.branchId, branches.id))
    .leftJoin(qrCodes, eq(reviews.qrCodeId, qrCodes.id))
    .leftJoin(teams, eq(reviews.teamId, teams.id))
    .where(branchId === undefined ? undefined : eq(reviews.branchId, branchId))
    .orderBy(desc(reviews.createdAt));
  return rows;
}

function filterRows(rows: Awaited<ReturnType<typeof getJoinedReviews>>, input: { branchId?: number; qrCodeId?: number; teamId?: number; storeCode?: string; status?: string; search?: string; rating?: string; startDate?: string; endDate?: string }) {
  const start = input.startDate ? new Date(`${input.startDate}T00:00:00`) : undefined;
  const end = input.endDate ? new Date(`${input.endDate}T23:59:59`) : undefined;
  return rows.filter(({ review }) => {
    const overall = overallRating(review);
    const haystack = `${review.receiptNo} ${review.comment ?? ""}`.toLowerCase();
    if (input.branchId && review.branchId !== input.branchId) return false;
    if (input.qrCodeId && review.qrCodeId !== input.qrCodeId) return false;
    if (input.teamId && review.teamId !== input.teamId) return false;
    if (input.storeCode) {
      const code = resolveStoreFromTicket(review.receiptNo).code;
      if (code !== input.storeCode) return false;
    }
    if (input.status && review.status !== input.status) return false;
    if (input.search && !haystack.includes(input.search.toLowerCase())) return false;
    if (input.rating === "low" && Math.min(review.installationRating, review.groomingRating, review.serviceRating) > 2) return false;
    if (input.rating === "high" && overall < 4) return false;
    if (start && review.createdAt < start) return false;
    if (end && review.createdAt > end) return false;
    return true;
  });
}

export async function listReviews(user: ScopeUser, input: Parameters<typeof filterRows>[1] & { page?: number; pageSize?: number } = {}) {
  const joined = await getJoinedReviews(user);
  const allRows = filterRows(joined, input);
  const total = allRows.length;
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, input.pageSize ?? 10));
  const totalPages = Math.ceil(total / pageSize) || 1;
  const startIdx = (page - 1) * pageSize;
  const pagedRows = allRows.slice(startIdx, startIdx + pageSize);

  const items = pagedRows.map(({ review, branch, qr, team }) => ({
    ...review,
    branchName: branch?.name ?? "Unassigned",
    branchCode: branch?.code ?? "N/A",
    qrName: qr?.name ?? "Direct",
    teamName: team?.name ?? "Unassigned",
    overall: overallRating(review),
    storeCode: resolveStoreFromTicket(review.receiptNo).code,
    storeName: storeLabel(review.receiptNo),
  }));

  // store options: unik dari SEMUA review (SEBELUM filter) — biar dropdown tetap
  // lengkap walau sedang memfilter store. Misal filter "Selma" sudah aktif,
  // dropdown tetap berisi Selma, Pontianak, dll dan bisa pindah ke store lain.
  const storeMap = new Map<string, string>();
  for (const { review } of joined) {
    const { code, name } = resolveStoreFromTicket(review.receiptNo);
    if (code && !storeMap.has(code)) storeMap.set(code, storeLabel(review.receiptNo) ?? code);
  }
  const storeOptions = Array.from(storeMap.entries())
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
    storeOptions,
  };
}

export async function getReviewDetail(user: ScopeUser, id: number) {
  const db = await requireDb();
  const branchId = scopedBranchId(user);
  // Direct query by id — avoids fetching all reviews (was O(N))
  const rows = await db
    .select({ review: reviews, branch: branches, qr: qrCodes, team: teams })
    .from(reviews)
    .leftJoin(branches, eq(reviews.branchId, branches.id))
    .leftJoin(qrCodes, eq(reviews.qrCodeId, qrCodes.id))
    .leftJoin(teams, eq(reviews.teamId, teams.id))
    .where(and(eq(reviews.id, id), branchId === undefined ? undefined : eq(reviews.branchId, branchId)))
    .limit(1);
  const row = rows[0];
  if (!row) return undefined;
  const alerts = await db.select().from(reviewAlerts).where(eq(reviewAlerts.reviewId, id)).orderBy(desc(reviewAlerts.createdAt));
  return { ...row.review, branch: row.branch, qr: row.qr, team: row.team, overall: overallRating(row.review), storeCode: resolveStoreFromTicket(row.review.receiptNo).code, storeName: storeLabel(row.review.receiptNo), alerts };
}

export async function createAuditLog(input: InsertAuditLog) {
  const db = await requireDb();
  await db.insert(auditLogs).values(input);
}

export async function createBranch(input: InsertBranch, userId?: number) {
  const db = await requireDb();
  const result = await db.insert(branches).values(input);
  const id = Number(result[0].insertId);
  await createAuditLog({ userId, action: `Created branch ${input.name}`, targetType: "branch", targetId: id });
  return (await db.select().from(branches).where(eq(branches.id, id)).limit(1))[0];
}

export async function toggleBranch(id: number, status: "active" | "inactive", userId?: number) {
  const db = await requireDb();
  await db.update(branches).set({ status }).where(eq(branches.id, id));
  await createAuditLog({ userId, action: `${status === "active" ? "Activated" : "Disabled"} branch`, targetType: "branch", targetId: id });
  return { success: true };
}

export async function deleteBranch(id: number, userId?: number) {
  const db = await requireDb();
  const branchReviews = await db.select({ id: reviews.id }).from(reviews).where(eq(reviews.branchId, id));
  const reviewIds = branchReviews.map((row) => row.id);
  if (reviewIds.length) {
    await db.delete(reviewAlerts).where(inArray(reviewAlerts.reviewId, reviewIds));
    await db.delete(reviews).where(inArray(reviews.id, reviewIds));
  }
  await db.update(users).set({ branchId: null }).where(eq(users.branchId, id));
  await db.delete(qrCodes).where(eq(qrCodes.branchId, id));
  await db.delete(teams).where(eq(teams.branchId, id));
  await db.delete(branches).where(eq(branches.id, id));
  await createAuditLog({ userId, action: "Deleted branch and related records", targetType: "branch", targetId: id });
  return { success: true, deletedReviews: reviewIds.length };
}

export async function deleteTeam(id: number, userId?: number) {
  const db = await requireDb();
  await db.update(reviews).set({ teamId: null }).where(eq(reviews.teamId, id));
  await db.delete(teams).where(eq(teams.id, id));
  await createAuditLog({ userId, action: "Deleted team", targetType: "team", targetId: id });
  return { success: true };
}

export async function deleteQRCode(id: number, userId?: number) {
  const db = await requireDb();
  await db.update(reviews).set({ qrCodeId: null }).where(eq(reviews.qrCodeId, id));
  await db.delete(qrCodes).where(eq(qrCodes.id, id));
  await createAuditLog({ userId, action: "Deleted QR code", targetType: "qr_code", targetId: id });
  return { success: true };
}

export async function deleteReview(user: ScopeUser, id: number, userId?: number) {
  const detail = await getReviewDetail(user, id);
  if (!detail) throw new Error("Review not found");
  const db = await requireDb();
  await db.delete(reviewAlerts).where(eq(reviewAlerts.reviewId, id));
  await db.delete(reviews).where(eq(reviews.id, id));
  await createAuditLog({ userId, action: "Deleted review", targetType: "review", targetId: id });
  return { success: true };
}

export async function deleteAllReviews(userId?: number) {
  const db = await requireDb();
  const rows = await db.select({ id: reviews.id }).from(reviews);
  await db.delete(reviewAlerts);
  await db.delete(reviews);
  await createAuditLog({ userId, action: "Deleted all reviews", targetType: "review", targetId: null, metadata: JSON.stringify({ count: rows.length }) });
  return { success: true, deleted: rows.length };
}

export async function createTeam(input: InsertTeam, userId?: number) {
  const db = await requireDb();
  const result = await db.insert(teams).values(input);
  const id = Number(result[0].insertId);
  await createAuditLog({ userId, action: `Created team ${input.name}`, targetType: "team", targetId: id });
  return (await db.select().from(teams).where(eq(teams.id, id)).limit(1))[0];
}

export async function createQRCode(input: InsertQRCode, userId?: number) {
  const db = await requireDb();
  const result = await db.insert(qrCodes).values(input);
  const id = Number(result[0].insertId);
  await createAuditLog({ userId, action: `Generated QR ${input.name}`, targetType: "qr_code", targetId: id });
  return (await db.select().from(qrCodes).where(eq(qrCodes.id, id)).limit(1))[0];
}

export async function toggleQRCode(id: number, status: "active" | "inactive", userId?: number) {
  const db = await requireDb();
  await db.update(qrCodes).set({ status }).where(eq(qrCodes.id, id));
  await createAuditLog({ userId, action: `${status === "active" ? "Activated" : "Disabled"} QR code`, targetType: "qr_code", targetId: id });
  return { success: true };
}

export async function createReview(input: InsertReview, threshold: number) {
  const db = await requireDb();
  // V2 mode (QR universal): branchId null → duplicate check per receiptNo saja
  const recent = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(input.branchId == null ? eq(reviews.receiptNo, input.receiptNo) : and(eq(reviews.branchId, input.branchId), eq(reviews.receiptNo, input.receiptNo)))
    .limit(1);
  if (recent[0]) return { duplicate: true as const };

  const result = await db.insert(reviews).values(input);
  const id = Number(result[0].insertId);
  if (Math.min(input.installationRating, input.groomingRating, input.serviceRating) <= threshold) {
    const alert: InsertReviewAlert = {
      reviewId: id,
      type: "negative_review",
      severity: "critical",
      message: "Low customer rating requires attention",
      status: "open",
    };
    await db.insert(reviewAlerts).values(alert);
  }
  return { duplicate: false as const, reviewId: id };
}

export async function updateReviewStatus(user: ScopeUser, id: number, status: "new" | "reviewed" | "resolved" | "archived", userId?: number, note?: string | null) {
  const detail = await getReviewDetail(user, id);
  if (!detail) throw new Error("Review not found");
  // Rule: status resolved/archived ↛ new (irreversible). Boleh resolved→archived.
  if ((detail.status === "resolved" || detail.status === "archived") && status === "new") {
    throw new Error(`Review yang sudah ${detail.status === "resolved" ? "Resolved" : "Archived"} tidak dapat dikembalikan ke status New.`);
  }
  const db = await requireDb();
  // note: disimpan saat resolve (opsional); clear saat pindah ke new/archived biar tidak nyangkut
  const setFields: Record<string, unknown> = { status };
  if (status === "resolved") setFields.note = note?.trim() ? note.trim() : null;
  else setFields.note = null;
  await db.update(reviews).set(setFields).where(eq(reviews.id, id));
  if (status === "resolved") {
    await db.update(reviewAlerts).set({ status: "resolved", resolvedBy: userId, resolvedAt: new Date() }).where(and(eq(reviewAlerts.reviewId, id), eq(reviewAlerts.status, "open")));
  }
  await createAuditLog({ userId, action: `Changed review status to ${status}`, targetType: "review", targetId: id });
  return { success: true };
}

/** V2: assign review unassigned (branchId NULL) ke branch & tim. */
export async function assignReview(user: ScopeUser, id: number, branchId: number, teamId: number | null, userId?: number) {
  const detail = await getReviewDetail(user, id);
  if (!detail) throw new Error("Review not found");
  const db = await requireDb();
  await db.update(reviews).set({ branchId, teamId }).where(eq(reviews.id, id));
  await createAuditLog({ userId, action: `Assigned review to branch #${branchId}${teamId ? ` / team #${teamId}` : ""}`, targetType: "review", targetId: id });
  return { success: true };
}

export async function listAlerts(user: ScopeUser, existingRows?: Awaited<ReturnType<typeof getJoinedReviews>>) {
  const rows = existingRows ?? await getJoinedReviews(user);
  const ids = rows.map(({ review }) => review.id);
  if (!ids.length) return [];
  const db = await requireDb();
  const alerts = await db.select().from(reviewAlerts).where(inArray(reviewAlerts.reviewId, ids)).orderBy(desc(reviewAlerts.createdAt));
  const index = new Map(rows.map(({ review, branch }) => [review.id, { receiptNo: review.receiptNo, branchName: branch?.name ?? "Unassigned", overall: overallRating(review) }]));
  return alerts.map((alert) => ({ ...alert, ...(index.get(alert.reviewId) ?? {}) }));
}

export async function resolveAlert(user: ScopeUser, id: number, userId?: number) {
  const db = await requireDb();
  const alertList = await db.select().from(reviewAlerts).where(eq(reviewAlerts.id, id)).limit(1);
  const targetAlert = alertList[0];
  await db.update(reviewAlerts).set({ status: "resolved", resolvedBy: userId, resolvedAt: new Date() }).where(eq(reviewAlerts.id, id));
  if (targetAlert?.reviewId) {
    await db.update(reviews).set({ status: "resolved" }).where(eq(reviews.id, targetAlert.reviewId));
  }
  await createAuditLog({ userId, action: "Resolved review alert & updated review status", targetType: "review_alert", targetId: id });
  return { success: true };
}

export async function dashboardData(user: ScopeUser, input: { branchId?: number; qrCodeId?: number; teamId?: number; startDate?: string; endDate?: string } = {}) {
  // Archived reviews are excluded from analytics/KPI (V2 spec)
  const rows = filterRows(await getJoinedReviews(user), input).filter(({ review }) => review.status !== "archived");
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const monthKey = now.toISOString().slice(0, 7);
  const total = rows.length;
  const average = total ? Math.round((rows.reduce((sum, row) => sum + overallRating(row.review), 0) / total) * 100) / 100 : 0;
  const dimension = (key: "installationRating" | "groomingRating" | "serviceRating") => total ? Math.round((rows.reduce((sum, row) => sum + row.review[key], 0) / total) * 100) / 100 : 0;
  const ratingDistribution = [5, 4, 3, 2, 1].map((rating) => {
    const count = rows.filter(({ review }) => Math.round(overallRating(review)) === rating).length;
    return { rating, count, percentage: total ? Math.round((count / total) * 100) : 0 };
  });
  const trend = Array.from({ length: 14 }, (_, offset) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (13 - offset));
    const key = date.toISOString().slice(0, 10);
    const dayRows = rows.filter(({ review }) => review.createdAt.toISOString().slice(0, 10) === key);
    return { date: key.slice(5), count: dayRows.length, average: dayRows.length ? Math.round((dayRows.reduce((sum, row) => sum + overallRating(row.review), 0) / dayRows.length) * 100) / 100 : 0 };
  });
  const aggregate = <T extends { id: number; name: string }>(items: T[]) => items.map((item) => {
    const itemRows = rows.filter(({ branch, team, qr }) => branch?.id === item.id || team?.id === item.id || qr?.id === item.id);
    return { id: item.id, name: item.name, reviews: itemRows.length, average: itemRows.length ? Math.round((itemRows.reduce((sum, row) => sum + overallRating(row.review), 0) / itemRows.length) * 100) / 100 : 0, installation: itemRows.length ? Math.round((itemRows.reduce((sum, row) => sum + row.review.installationRating, 0) / itemRows.length) * 100) / 100 : 0, grooming: itemRows.length ? Math.round((itemRows.reduce((sum, row) => sum + row.review.groomingRating, 0) / itemRows.length) * 100) / 100 : 0, service: itemRows.length ? Math.round((itemRows.reduce((sum, row) => sum + row.review.serviceRating, 0) / itemRows.length) * 100) / 100 : 0 };
  });
  const db = await requireDb();
  const [branchRows, teamRows, qrRows, alertRows] = await Promise.all([
    db.select().from(branches).orderBy(branches.name),
    db.select().from(teams).orderBy(teams.name),
    db.select().from(qrCodes).orderBy(qrCodes.name),
    listAlerts(user),
  ]);
  const scopedBranch = scopedBranchId(user);
  const branchesForUser = scopedBranch === undefined ? branchRows : branchRows.filter((row) => row.id === scopedBranch);
  const teamsForUser = scopedBranch === undefined ? teamRows : teamRows.filter((row) => row.branchId === scopedBranch);
  const qrForUser = scopedBranch === undefined ? qrRows : qrRows.filter((row) => row.branchId === scopedBranch);
  return {
    kpis: { total, average, today: rows.filter(({ review }) => review.createdAt.toISOString().slice(0, 10) === todayKey).length, month: rows.filter(({ review }) => review.createdAt.toISOString().slice(0, 7) === monthKey).length, positive: rows.filter(({ review }) => overallRating(review) >= 4).length, negative: rows.filter(({ review }) => Math.min(review.installationRating, review.groomingRating, review.serviceRating) <= 2).length },
    dimensions: { installation: dimension("installationRating"), grooming: dimension("groomingRating"), service: dimension("serviceRating"), overall: average },
    ratingDistribution,
    trend,
    branchAnalytics: branchesForUser.map((item) => ({ ...aggregate([item])[0], code: item.code })),
    teamAnalytics: teamsForUser.map((item) => ({ ...aggregate([item])[0], branchId: item.branchId })),
    qrAnalytics: qrForUser.map((item) => ({ ...aggregate([item])[0], code: item.code, branchId: item.branchId })),
    recentReviews: rows.slice(0, 7).map(({ review, branch, qr }) => ({ ...review, branchName: branch?.name ?? "Unassigned", qrName: qr?.name ?? "Direct", overall: overallRating(review), storeCode: resolveStoreFromTicket(review.receiptNo).code, storeName: storeLabel(review.receiptNo) })),
    alerts: alertRows.slice(0, 8),
    alertSummary: { critical: alertRows.filter((a) => a.status === "open" && a.severity === "critical").length, attention: alertRows.filter((a) => a.status === "open" && a.severity === "attention").length, resolved: alertRows.filter((a) => a.status === "resolved").length },
  };
}

export async function exportReviews(user: ScopeUser, input: Parameters<typeof filterRows>[1] = {}) {
  const allRows = filterRows(await getJoinedReviews(user), input);
  return allRows.map(({ review, branch, qr, team }) => ({
    date: review.createdAt.toISOString(),
    receiptNo: review.receiptNo,
    branchName: branch?.name ?? "Unassigned",
    branchCode: branch?.code ?? "N/A",
    qrName: qr?.name ?? "Direct",
    teamName: team?.name ?? "Unassigned",
    installationRating: review.installationRating,
    groomingRating: review.groomingRating,
    serviceRating: review.serviceRating,
    overall: overallRating(review),
    comment: review.comment ?? "",
    status: review.status,
    storeCode: resolveStoreFromTicket(review.receiptNo).code,
    storeName: storeLabel(review.receiptNo),
  }));
}

export async function findReviewsBySearch(user: ScopeUser, search: string) {
  const db = await requireDb();
  const scope = scopedBranchId(user);
  return db
    .select({ id: reviews.id, receiptNo: reviews.receiptNo, comment: reviews.comment, branchName: branches.name })
    .from(reviews)
    .innerJoin(branches, eq(reviews.branchId, branches.id))
    .where(and(scope === undefined ? undefined : eq(reviews.branchId, scope), or(like(reviews.receiptNo, `%${search}%`), like(reviews.comment, `%${search}%`))))
    .orderBy(desc(reviews.createdAt))
    .limit(10);
}
