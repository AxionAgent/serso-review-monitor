import { and, desc, eq, gte, inArray, isNull, like, lt, ne, notInArray, or } from "drizzle-orm";
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
export function scopedBranchId(user: ScopeUser) {
  return user?.role === "branch_admin" ? user.branchId ?? -1 : undefined;
}

/** V2: status yang disembunyikan dari semua role selain super_admin.
 *  Tambah status baru ke sini kalau perlu disembunyikan — jangan tambah cek di UI.
 */
const ADMIN_HIDDEN_STATUSES = ["archived"] as const;
export function hiddenStatusesFor(user: ScopeUser): Set<string> {
  return user?.role === "super_admin" ? new Set<string>() : new Set<string>(ADMIN_HIDDEN_STATUSES);
}

/** Reviews yang boleh dilihat user ini (super_admin = semua, lainnya tanpa hidden). */
export async function getVisibleJoinedReviews(user: ScopeUser) {
  const hidden = hiddenStatusesFor(user);
  const rows = await getJoinedReviews(user);
  return hidden.size ? rows.filter(({ review }) => !hidden.has(review.status)) : rows;
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
      if (input.storeCode === "__UNKNOWN__") {
        if (code) return false;
      } else if (code !== input.storeCode) {
        return false;
      }
    }
    // UI cuma punya Open/Resolved; "new" dianggap Open (item 1 owner).
    if (input.status === "open") { if (review.status !== "open" && review.status !== "new") return false; }
    else if (input.status && review.status !== input.status) return false;
    if (input.search && !haystack.includes(input.search.toLowerCase())) return false;
    if (input.rating === "low" && Math.min(review.installationRating, review.groomingRating, review.serviceRating) > 2) return false;
    if (input.rating === "high" && overall < 4) return false;
    if (start && review.createdAt < start) return false;
    if (end && review.createdAt > end) return false;
    return true;
  });
}

export async function listReviews(user: ScopeUser, input: Parameters<typeof filterRows>[1] & { page?: number; pageSize?: number } = {}) {
  const joined = await getVisibleJoinedReviews(user);
  // V2: admin tidak bisa memfilter ke status yang tersembunyi — paksa kosong,
  // biar query param manual `?status=archived` tidak bocorin arsip.
  const hidden = hiddenStatusesFor(user);
  const safeInput = input.status && hidden.has(input.status) ? { ...input, status: "__HIDDEN__" } : input;
  const allRows = filterRows(joined, safeInput);
  const total = allRows.length;
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, input.pageSize ?? 10));
  const totalPages = Math.ceil(total / pageSize) || 1;
  const startIdx = (page - 1) * pageSize;
  const pagedRows = allRows.slice(startIdx, startIdx + pageSize);

  const items = pagedRows.map(({ review, branch, qr, team }) => ({
    ...review,
    unread: review.status === "new" && !review.readAt,
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
    if (code) {
      storeMap.set(code, name ?? code);
    }
  }
  // Add single Unknown placeholder if any receipt could not be resolved
  const hasUnknown = joined.some(({ review }) => !resolveStoreFromTicket(review.receiptNo).code);
  if (hasUnknown) {
    storeMap.set("__UNKNOWN__", "Unknown");
  }
  const storeOptions = Array.from(storeMap.entries())
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => {
      if (a.code === "__UNKNOWN__") return 1;
      if (b.code === "__UNKNOWN__") return -1;
      return a.name.localeCompare(b.name);
    });

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
  const hidden = hiddenStatusesFor(user);
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
  // V2: admin tidak boleh buka detail review yang tersembunyi dari listnya
  // (arsip/hantu) — biar `?id=` manual tidak jadi celah.
  if (hidden.has(row.review.status)) return undefined;
  const alerts = await db.select().from(reviewAlerts).where(eq(reviewAlerts.reviewId, id)).orderBy(desc(reviewAlerts.createdAt));
  return { ...row.review, branch: row.branch, qr: row.qr, team: row.team, overall: overallRating(row.review), storeCode: resolveStoreFromTicket(row.review.receiptNo).code, storeName: storeLabel(row.review.receiptNo), alerts };
}

/** Tandai review sudah dibaca (unread dot hilang). Idempotent, tanpa audit log. */
export async function markReviewAsRead(user: ScopeUser, id: number) {
  const db = await requireDb();
  await db.update(reviews).set({ readAt: new Date() }).where(and(eq(reviews.id, id), isNull(reviews.readAt)));
  return { success: true };
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

/**
 * Superadmin-only: delete all ARCHIVED reviews + their alerts.
 * Archived reviews are excluded from analytics, so this is a safe cleanup
 * for old resolved-but-archived rows.
 */
export async function deleteArchivedReviews(userId?: number) {
  const db = await requireDb();
  const rows = await db.select({ id: reviews.id }).from(reviews).where(eq(reviews.status, "archived"));
  const ids = rows.map((row) => row.id);
  if (ids.length) {
    await db.delete(reviewAlerts).where(inArray(reviewAlerts.reviewId, ids));
    await db.delete(reviews).where(inArray(reviews.id, ids));
  }
  await createAuditLog({ userId, action: "Deleted archived reviews", targetType: "review", targetId: null, metadata: JSON.stringify({ count: ids.length }) });
  return { success: true, deleted: ids.length };
}

/**
 * Auto lifecycle: review yang masih "new" setelah 24 jam → "open" (masih butuh tindakan).
 * Review yang masih "open" setelah 7 hari → "resolved" (otomatis selesaikan).
 * Tidak menyentuh review yang sudah resolved/archived.
 */
export async function autoTransitionReviewStatus() {
  const db = await requireDb();
  const now = new Date();
  const openThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const resolvedThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const openResult = await db.update(reviews).set({ status: "open", updatedAt: now }).where(and(eq(reviews.status, "new"), lt(reviews.createdAt, openThreshold)));
  const resolvedResult = await db.update(reviews).set({ status: "resolved", updatedAt: now }).where(and(eq(reviews.status, "open"), lt(reviews.createdAt, resolvedThreshold)));
  const openCount = Number(openResult[0].affectedRows ?? 0);
  const resolvedCount = Number(resolvedResult[0].affectedRows ?? 0);
  if (openCount || resolvedCount) {
    console.log(`[Lifecycle] ${openCount} review → open, ${resolvedCount} review → resolved`);
  }
  return { open: openCount, resolved: resolvedCount };
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
  // V2: alert dipicu review dengan rating OVERALL di bawah threshold (default 3.5)
  // — bukan lagi "ada satu dimensi rendah".
  if (overallRating(input) < Number(threshold)) {
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

export async function updateReviewStatus(user: ScopeUser, id: number, status: "new" | "open" | "resolved" | "archived", userId?: number, note?: string | null) {
  const detail = await getReviewDetail(user, id);
  if (!detail) throw new Error("Review not found");
  // Rule: status resolved/archived ↛ new (irreversible). Boleh resolved→archived.
  if ((detail.status === "resolved" || detail.status === "archived") && status === "new") {
    throw new Error(`Review yang sudah ${detail.status === "resolved" ? "Resolved" : "Archived"} tidak dapat dikembalikan ke status New.`);
  }
  // V2 admin rules: admin cuma bisa open↔resolved, gak bisa archive atau set ke new.
  if (user?.role !== "super_admin" && user?.role !== "viewer") {
    if (status === "archived") throw new Error("Hanya super admin yang dapat meng-archive review.");
    if (status === "new") throw new Error("Admin tidak dapat mengembalikan review ke status New.");
  }
  if (detail.status === "new" && status === "open" && user?.role === "viewer") {
    throw new Error("Viewer tidak dapat mengubah status.");
  }
  const db = await requireDb();
  // note: disimpan saat resolve (opsional). Owner rule 2026-09-11: catatan resolve
  // TETAP tersimpan saat status pindah resolved→open — jangan di-clear lagi.
  const setFields: Record<string, unknown> = { status };
  if (note !== undefined) setFields.note = note?.trim() ? note.trim() : null;
  await db.update(reviews).set(setFields).where(eq(reviews.id, id));
  if (status === "resolved") {
    await db.update(reviewAlerts).set({ status: "resolved", resolvedBy: userId, resolvedAt: new Date() }).where(and(eq(reviewAlerts.reviewId, id), eq(reviewAlerts.status, "open")));
  }
  await createAuditLog({ userId, action: `Status diubah: ${detail.status} → ${status}`, targetType: "review", targetId: id });
  return { success: true };
}

/** Simpan catatan resolve tanpa mengubah status (dipanggil saat admin blur textarea). */
export async function updateReviewNote(user: ScopeUser, id: number, note: string | null, userId?: number) {
  const detail = await getReviewDetail(user, id);
  if (!detail) throw new Error("Review not found");
  if (user?.role === "viewer") throw new Error("Viewer tidak dapat mengubah catatan.");
  const db = await requireDb();
  const clean = note?.trim() ? note.trim() : null;
  if ((detail.note ?? null) === clean) return { success: true };
  await db.update(reviews).set({ note: clean }).where(eq(reviews.id, id));
  await createAuditLog({ userId, action: "Catatan resolve diedit", targetType: "review", targetId: id, metadata: JSON.stringify({ from: detail.note ?? "", to: clean ?? "" }) });
  return { success: true };
}

/** Riwayat edit/status sebuah review (sumber: audit_logs). */
export async function listReviewHistory(user: ScopeUser, id: number) {
  const detail = await getReviewDetail(user, id);
  if (!detail) throw new Error("Review not found");
  const db = await requireDb();
  return db
    .select({ id: auditLogs.id, action: auditLogs.action, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt, userName: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(and(eq(auditLogs.targetType, "review"), eq(auditLogs.targetId, id)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(50);
}

/** SUPER ADMIN ONLY: koreksi teks entri riwayat. */
export async function editReviewHistoryEntry(id: number, action: string, userId?: number) {
  const db = await requireDb();
  await db.update(auditLogs).set({ action: action.trim().slice(0, 160) }).where(eq(auditLogs.id, id));
  await createAuditLog({ userId, action: `Edited history entry #${id}`, targetType: "audit_log", targetId: id });
  return { success: true };
}

/** SUPER ADMIN ONLY: hapus entri riwayat. */
export async function deleteReviewHistoryEntry(id: number, userId?: number) {
  const db = await requireDb();
  await db.delete(auditLogs).where(eq(auditLogs.id, id));
  await createAuditLog({ userId, action: `Deleted history entry #${id}`, targetType: "audit_log", targetId: id });
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

/** Riwayat notifikasi untuk bell header: review terbaru + alert terbaru, digabung. */
export async function listNotifications(user: ScopeUser) {
  const db = await requireDb();
  const scope = scopedBranchId(user);
  const hidden = hiddenStatusesFor(user);
  const rv = await db
    .select({ id: reviews.id, receiptNo: reviews.receiptNo, createdAt: reviews.createdAt, status: reviews.status, readAt: reviews.readAt })
    .from(reviews)
    .where(scope === undefined ? undefined : eq(reviews.branchId, scope))
    .orderBy(desc(reviews.id))
    .limit(30);
  const al = await db
    .select({ id: reviewAlerts.id, reviewId: reviewAlerts.reviewId, message: reviewAlerts.message, severity: reviewAlerts.severity, alertStatus: reviewAlerts.status, createdAt: reviewAlerts.createdAt })
    .from(reviewAlerts)
    .orderBy(desc(reviewAlerts.id))
    .limit(15);
  const items: { kind: "review" | "alert"; id: number; reviewId: number; title: string; sub: string; severity?: string; createdAt: Date; read: boolean }[] = [];
  for (const r of rv) {
    if (hidden.has(r.status)) continue;
    items.push({ kind: "review", id: r.id, reviewId: r.id, title: `Review baru: ${r.receiptNo || "?"}`, sub: r.status === "resolved" ? "sudah resolved" : r.status === "open" ? "status open" : "menunggu tindakan", createdAt: r.createdAt, read: !!r.readAt });
  }
  for (const a of al) {
    items.push({ kind: "alert", id: a.id, reviewId: a.reviewId, title: a.message.slice(0, 80), sub: a.alertStatus === "resolved" ? "alert resolved" : `alert ${a.severity}`, severity: a.severity, createdAt: a.createdAt, read: a.alertStatus === "resolved" });
  }
  return items.sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime()).slice(0, 25);
}

/** Poll murah utk notif "review baru" di admin: 1 baris terbaru (scope user). */
export async function latestReviewAt(user: ScopeUser) {
  const db = await requireDb();
  const scope = scopedBranchId(user);
  const rows = await db
    .select({ id: reviews.id, receiptNo: reviews.receiptNo, createdAt: reviews.createdAt })
    .from(reviews)
    .where(scope === undefined ? undefined : eq(reviews.branchId, scope))
    .orderBy(desc(reviews.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listAlerts(user: ScopeUser, existingRows?: Awaited<ReturnType<typeof getJoinedReviews>>) {
  const rows = existingRows ?? await getVisibleJoinedReviews(user);
  const ids = rows.map(({ review }) => review.id);
  if (!ids.length) return [];
  const db = await requireDb();
  const alerts = await db.select().from(reviewAlerts).where(inArray(reviewAlerts.reviewId, ids)).orderBy(desc(reviewAlerts.createdAt));
  // V2: alert card butuh isi review (komentar + 3 sub-rating) supaya admin tahu
  // apa yang di-resolve, bukan cuma overall-nya.
  const index = new Map(rows.map(({ review, branch }) => [review.id, {
    receiptNo: review.receiptNo,
    branchName: branch?.name ?? "Unassigned",
    storeName: storeLabel(review.receiptNo),
    storeCode: resolveStoreFromTicket(review.receiptNo).code,
    overall: overallRating(review),
    comment: review.comment ?? null,
    installationRating: review.installationRating,
    groomingRating: review.groomingRating,
    serviceRating: review.serviceRating,
  }]));
  return alerts.map((alert) => ({ ...alert, ...(index.get(alert.reviewId) ?? {}) }));
}

/** V2: branch yang tidak boleh masuk analitik/AI (branch uji coba, masih `active` di DB). */
const ANALYTICS_EXCLUDED_BRANCH_CODES = ["TEST"];

/** Review non-archived dalam `days` hari terakhir, untuk AI summarizer.
 *  - window waktu: dashboard diminta "7 hari terakhir", bukan "N terbaru"
 *  - buang branch uji (TEST POOL)
 *  - hanya branch aktif (branch nonaktif = data histNonaktif, bukan kondisi sekarang)
 */
export async function getAllNonArchivedReviews(user: ScopeUser, days = 7) {
  const db = await requireDb();
  const scope = scopedBranchId(user);
  const since = new Date();
  since.setDate(since.getDate() - days);
  const rows = await db
    .select({
      receiptNo: reviews.receiptNo,
      installationRating: reviews.installationRating,
      groomingRating: reviews.groomingRating,
      serviceRating: reviews.serviceRating,
      comment: reviews.comment,
      status: reviews.status,
      createdAt: reviews.createdAt,
      storeName: branches.name,
      branchCode: branches.code,
    })
    .from(reviews)
    .leftJoin(branches, eq(reviews.branchId, branches.id))
    .where(and(
      scope === undefined ? undefined : eq(reviews.branchId, scope),
      ne(reviews.status, "archived"),
      gte(reviews.createdAt, since),
      or(
        // branchId NULL (QR universal, belum ter-assign) tetap ikut
        isNull(reviews.branchId),
        and(ne(branches.status, "inactive"), notInArray(branches.code, ANALYTICS_EXCLUDED_BRANCH_CODES)),
      ),
    ))
    .orderBy(desc(reviews.createdAt))
    .limit(200);
  return rows.map((r) => ({
    ...r,
    storeCode: resolveStoreFromTicket(r.receiptNo).code,
    // Rekap = per-STORE (lookup prefiks tiket -> store.json), BUKAN per-pool/branch.
    // Dulu branch menang -> grup "POOL SINGKAWANG"/"PONTIANAK" campur aduk sama nama store.
    // Fallback branch cuma kalau tiket gak bisa di-parse jadi kode store sama sekali.
    storeName: storeLabel(r.receiptNo) ?? r.storeName,
  }));
}

export async function resolveAlert(user: ScopeUser, id: number, userId?: number, note?: string) {
  const db = await requireDb();
  const alertList = await db.select().from(reviewAlerts).where(eq(reviewAlerts.id, id)).limit(1);
  const targetAlert = alertList[0];
  await db.update(reviewAlerts).set({ status: "resolved", resolvedBy: userId, resolvedAt: new Date(), note: note?.trim() ?? null }).where(eq(reviewAlerts.id, id));
  if (targetAlert?.reviewId) {
    // V2: hanya majukan review yang masih dalam flow (new/open). Review yang sudah
    // resolved/archived/reviewed tidak disentuh — resolve alert tak boleh membuka arsip.
    const target = await db.select({ status: reviews.status }).from(reviews).where(eq(reviews.id, targetAlert.reviewId)).limit(1);
    const current = target[0]?.status;
    if (current === "new" || current === "open") {
      await db.update(reviews).set({ status: "resolved" }).where(eq(reviews.id, targetAlert.reviewId));
    }
  }
  await createAuditLog({ userId, action: "Resolved review alert & updated review status", targetType: "review_alert", targetId: id });
  return { success: true };
}

export async function dashboardData(user: ScopeUser, input: { branchId?: number; qrCodeId?: number; teamId?: number; startDate?: string; endDate?: string } = {}) {
  // Archived reviews are excluded from analytics/KPI (V2 spec)
  const rows = filterRows(await getJoinedReviews(user), input).filter(({ review }) => review.status !== "archived");
  // ambil threshold dari settings (default 3.5)
  const settings = await getSettings();
  const threshold = Number(settings.negativeThreshold);
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

  // Store analytics: rank by review count per store (from receiptNo)
  const storeMap = new Map<string, { name: string; count: number; totalRating: number }>();
  for (const { review } of rows) {
    const { code, name } = resolveStoreFromTicket(review.receiptNo);
    if (!code) continue;
    const entry = storeMap.get(code) ?? { name: name ?? code, count: 0, totalRating: 0 };
    entry.count += 1;
    entry.totalRating += overallRating(review);
    storeMap.set(code, entry);
  }
  const storeAnalytics = Array.from(storeMap.entries())
    .map(([code, v]) => ({ code, name: v.name, reviews: v.count, average: v.count ? Math.round((v.totalRating / v.count) * 100) / 100 : 0 }))
    .sort((a, b) => b.reviews - a.reviews);
  const openCount = rows.filter(({ review }) => review.status === "new" || review.status === "open").length;
  return {
    kpis: { total, average, today: rows.filter(({ review }) => review.createdAt.toISOString().slice(0, 10) === todayKey).length, month: rows.filter(({ review }) => review.createdAt.toISOString().slice(0, 7) === monthKey).length, positive: rows.filter(({ review }) => overallRating(review) >= threshold).length, negative: rows.filter(({ review }) => overallRating(review) < threshold).length, open: openCount },
    threshold,
    dimensions: { installation: dimension("installationRating"), grooming: dimension("groomingRating"), service: dimension("serviceRating"), overall: average },
    ratingDistribution,
    trend,
    branchAnalytics: branchesForUser.map((item) => ({ ...aggregate([item])[0], code: item.code })),
    teamAnalytics: teamsForUser.map((item) => ({ ...aggregate([item])[0], branchId: item.branchId })),
    storeAnalytics,
    recentReviews: rows.slice(0, 7).map(({ review, branch, qr }) => ({ ...review, qrName: qr?.name ?? "Direct", overall: overallRating(review), storeCode: resolveStoreFromTicket(review.receiptNo).code, storeName: storeLabel(review.receiptNo) })),
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
