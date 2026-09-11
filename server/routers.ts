import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router, superAdminProcedure } from "./_core/trpc";
import {
  assignReview,
  createQRCode,
  createReview,
  dashboardData,
  deleteAllReviews,
  deleteArchivedReviews,
  deleteQRCode,
  deleteReview,
  deleteReviewHistoryEntry,
  editReviewHistoryEntry,
  exportReviews,
  findActiveQR,
  findReviewsBySearch,
  getAllNonArchivedReviews,
  getBranchActiveTeams,
  getDb,
  getReviewDetail,
  getSettings,
  getUserByOpenId,
  latestReviewAt,
  listAlerts,
  listNotifications,
  listPublicRoutes,
  listQRCodes,
  listReviewHistory,
  listReviews,
  markReviewAsRead,
  resolveAlert,
  scopedBranchId,
  toggleQRCode,
  updateReviewNote,
  updateReviewStatus,
  upsertUser,
} from "./db";
import { renderSummary, summarizeStats } from "./analytics";
import { settings as settingsTable } from "../drizzle/schema";

const statusSchema = z.enum(["new", "open", "resolved", "archived"]);
const dateFilters = z.object({
  branchId: z.number().int().positive().optional(),
  qrCodeId: z.number().int().positive().optional(),
  teamId: z.number().int().positive().optional(),
  status: statusSchema.optional(),
  storeCode: z.string().max(16).optional(),
  search: z.string().max(120).optional(),
  rating: z.enum(["low", "high"]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
});

function forbidden(message = "Anda tidak memiliki akses ke data ini."): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}
function assertBranchScope(user: NonNullable<Parameters<typeof scopedBranchId>[0]>, branchId: number) {
  const scoped = scopedBranchId(user);
  if (scoped !== undefined && scoped !== branchId) forbidden();
}
function assertWritable(user: NonNullable<Parameters<typeof scopedBranchId>[0]>) {
  if (user.role === "viewer") forbidden("Akun viewer hanya memiliki akses baca.");
}

const submissionWindow = new Map<string, number>();

// Prune stale entries every 5 minutes to prevent unbounded growth
setInterval(() => {
  const cutoff = Date.now() - 60_000;
  submissionWindow.forEach((ts, key) => {
    if (ts < cutoff) submissionWindow.delete(key);
  });
}, 5 * 60 * 1000).unref();

/**
 * Auto lifecycle: review yang masih "new" setelah 24 jam → "open" (masih butuh tindakan).
 * Review yang masih "open" setelah 7 hari → "resolved" (otomatis selesaikan).
 * Di‑jalankan setiap 10 menit. Tidak mengubah review yang sudah resolved/archived.
 */
setInterval(async () => {
  try {
    const { autoTransitionReviewStatus } = await import("./db");
    await autoTransitionReviewStatus();
  } catch (error) {
    console.warn("[Lifecycle] Auto-status update failed:", error);
  }
}, 10 * 60 * 1000).unref();

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    login: publicProcedure.input(z.object({ username: z.string().min(1).max(80), password: z.string().min(1).max(120) })).mutation(async ({ input, ctx }) => {
      const adminUser = process.env.ADMIN_USERNAME ?? "admin";
      const adminPass = process.env.ADMIN_PASSWORD ?? "admin";
      const superPass = process.env.SUPERADMIN_PASSWORD ?? "super1234";
      const credentials = input.username === adminUser && input.password === adminPass
        ? { openId: "demo-admin@example.com", name: "Workspace Admin", email: "admin@example.com", role: "admin" as const }
        : input.username === "superadmin" && input.password === superPass
          ? { openId: "demo-superadmin@example.com", name: "Super Admin", email: "superadmin@example.com", role: "super_admin" as const }
          : null;
      if (!credentials) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid admin credentials." });
      const openId = credentials.openId;
      let user = await getUserByOpenId(openId);
      if (!user) {
        await upsertUser({ ...credentials, loginMethod: "local", status: "active" });
        user = await getUserByOpenId(openId);
      }
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Admin account unavailable." });
      const token = await sdk.createSessionToken(openId, { name: user.name || "Workspace Admin", expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return { success: true, user } as const;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  customer: router({
    activeRoutes: publicProcedure.query(() => listPublicRoutes()),
    context: publicProcedure.input(z.object({ code: z.string().min(1).max(32) })).query(async ({ input }) => {
      const match = await findActiveQR(input.code);
      const settings = await getSettings();
      if (!match || !match.qr) return { state: "invalid" as const, settings };
      // V2: QR universal — branch opsional (null). Customer tidak perlu pilih branch.
      if (match.qr.status !== "active") return { state: "disabled" as const, settings, branch: match.branch, qr: match.qr };
      if (match.branch && match.branch.status !== "active") return { state: "inactive_branch" as const, settings, branch: match.branch, qr: match.qr };
      const teams = match.branch ? await getBranchActiveTeams(match.branch.id) : [];
      return { state: "ready" as const, settings, branch: match.branch, qr: match.qr, teams };
    }),
    submit: publicProcedure
      .input(z.object({
        code: z.string().min(1).max(32),
        receiptNo: z.string().trim().min(1, "Nomor receipt wajib diisi.").max(80),
        installationRating: z.number().int().min(1).max(5),
        groomingRating: z.number().int().min(1).max(5),
        serviceRating: z.number().int().min(1).max(5),
        comment: z.string().trim().max(1000).optional(),
        teamId: z.number().int().positive().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const now = Date.now();
        const key = `${ctx.req.ip ?? ctx.req.socket.remoteAddress ?? "anonymous"}:${input.code}`;
        const previous = submissionWindow.get(key) ?? 0;
        if (now - previous < 15_000) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Mohon tunggu sebentar sebelum mengirim review berikutnya." });
        submissionWindow.set(key, now);
        const match = await findActiveQR(input.code);
        if (!match || !match.qr || match.qr.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "QR Code tidak aktif atau tidak ditemukan." });
        if (match.branch && match.branch.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "Branch tidak tersedia." });
        const settings = await getSettings();
        // V2: QR universal → review dibuat tanpa branch (unassigned), admin assign manual
        const result = await createReview({ branchId: match.branch?.id ?? null, qrCodeId: match.qr.id, receiptNo: input.receiptNo, installationRating: input.installationRating, groomingRating: input.groomingRating, serviceRating: input.serviceRating, comment: input.comment || null, teamId: input.teamId ?? null, status: "new" }, Number(settings.negativeThreshold));
        if (result.duplicate) return { duplicate: true as const };
        return { duplicate: false as const, reviewId: result.reviewId };
      }),
  }),
  dashboard: router({
    overview: publicProcedure.input(dateFilters.default({})).query(({ input, ctx }) => dashboardData(ctx.user, input)),
  }),
  admin: router({
    qrCodes: protectedProcedure.query(({ ctx }) => listQRCodes(ctx.user)),
    createQRCode: protectedProcedure.input(z.object({ branchId: z.number().int().positive(), name: z.string().trim().min(2).max(160) })).mutation(async ({ input, ctx }) => {
      assertWritable(ctx.user);
      assertBranchScope(ctx.user, input.branchId);
      const code = `${input.branchId}-${Date.now().toString(36).slice(-6)}`.toUpperCase();
      return createQRCode({ branchId: input.branchId, name: input.name, code, url: `/r/${code}`, status: "active", createdBy: ctx.user.id }, ctx.user.id);
    }),
    toggleQRCode: protectedProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["active", "inactive"]) })).mutation(async ({ input, ctx }) => {
      assertWritable(ctx.user);
      const codes = await listQRCodes(ctx.user);
      const match = codes.find((row) => row.qr.id === input.id);
      if (!match) forbidden();
      return toggleQRCode(input.id, input.status, ctx.user.id);
    }),
    deleteQRCode: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input, ctx }) => deleteQRCode(input.id, ctx.user.id)),
    reviews: protectedProcedure.input(dateFilters.default({})).query(({ input, ctx }) => listReviews(ctx.user, input)),
    review: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ input, ctx }) => getReviewDetail(ctx.user, input.id)),
    latestReviewAt: protectedProcedure.query(({ ctx }) => latestReviewAt(ctx.user)),
    notifications: protectedProcedure.query(({ ctx }) => listNotifications(ctx.user)),
    updateReviewStatus: protectedProcedure.input(z.object({ id: z.number().int().positive(), status: statusSchema, note: z.string().max(2000).nullable().optional() })).mutation(async ({ input, ctx }) => { assertWritable(ctx.user); return updateReviewStatus(ctx.user, input.id, input.status, ctx.user.id, input.note); }),
    updateReviewNote: protectedProcedure.input(z.object({ id: z.number().int().positive(), note: z.string().max(2000).nullable() })).mutation(async ({ input, ctx }) => { assertWritable(ctx.user); return updateReviewNote(ctx.user, input.id, input.note, ctx.user.id); }),
    markReviewRead: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input, ctx }) => markReviewAsRead(ctx.user, input.id)),
    reviewHistory: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(({ input, ctx }) => listReviewHistory(ctx.user, input.id)),
    // SUPER ADMIN ONLY — tidak boleh muncul/dipanggil role lain (owner request).
    editReviewHistory: superAdminProcedure.input(z.object({ id: z.number().int().positive(), action: z.string().trim().min(1).max(160) })).mutation(({ input, ctx }) => editReviewHistoryEntry(input.id, input.action, ctx.user.id)),
    deleteReviewHistory: superAdminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input, ctx }) => deleteReviewHistoryEntry(input.id, ctx.user.id)),
    assignReview: protectedProcedure.input(z.object({ id: z.number().int().positive(), branchId: z.number().int().positive(), teamId: z.number().int().positive().nullable().optional() })).mutation(async ({ input, ctx }) => {
      assertWritable(ctx.user);
      assertBranchScope(ctx.user, input.branchId);
      return assignReview(ctx.user, input.id, input.branchId, input.teamId ?? null, ctx.user.id);
    }),
    deleteReview: superAdminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input, ctx }) => deleteReview(ctx.user, input.id, ctx.user.id)),
    deleteAllReviews: superAdminProcedure.mutation(({ ctx }) => deleteAllReviews(ctx.user.id)),
  deleteArchivedReviews: superAdminProcedure.mutation(({ ctx }) => deleteArchivedReviews(ctx.user.id)),
  analyticsRecap: protectedProcedure.query(async ({ ctx }) => {
    // V2: window 7 hari terakhir + buang branch uji. Lihat db.ts::getAllNonArchivedReviews.
    const reviews = await getAllNonArchivedReviews(ctx.user, 7);
    if (!reviews.length) return { summary: "Tidak ada review dalam 7 hari terakhir untuk dianalisis.", generatedAt: new Date().toISOString() };
    // Deterministic: dulu mutation + LLM, hasilnya layout berantakan + risiko angka ngarang.
    // Semua fakta sudah dihitung server-side di analytics.ts — tinggal render, otomatis instan.
    // stats ikut dikirim supaya UI bisa menata tipografi (item 7), bukan pre-wrap teks mentah.
    return { summary: renderSummary(reviews), stats: summarizeStats(reviews), generatedAt: new Date().toISOString() };
  }),
  alerts: protectedProcedure.query(({ ctx }) => listAlerts(ctx.user)),
    resolveAlert: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), note: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        assertWritable(ctx.user);
        return resolveAlert(ctx.user, input.id, ctx.user.id, input.note);
      }),
    exportReviews: protectedProcedure.input(dateFilters.default({})).query(({ input, ctx }) => exportReviews(ctx.user, input)),
    search: protectedProcedure.input(z.object({ search: z.string().min(2).max(80) })).query(({ input, ctx }) => findReviewsBySearch(ctx.user, input.search)),
    settings: protectedProcedure.query(() => getSettings()),
    updateSettings: adminProcedure.input(z.object({ companyName: z.string().min(2).max(160), reviewPageTitle: z.string().min(2).max(160), thankYouMessage: z.string().min(2).max(500), negativeThreshold: z.number().min(1).max(5), timezone: z.string().min(2).max(64), primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/) })).mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const payload = { ...input, negativeThreshold: input.negativeThreshold.toFixed(1) };
      const rows = await db.select().from(settingsTable).limit(1);
      if (rows[0]) await db.update(settingsTable).set(payload).where(eq(settingsTable.id, rows[0].id));
      else await db.insert(settingsTable).values(payload);
      return getSettings();
    }),
  }),
});

export type AppRouter = typeof appRouter;
