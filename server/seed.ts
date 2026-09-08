import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { branches, qrCodes, reviewAlerts, reviews, settings, teams, users } from "../drizzle/schema";

const comments = [
  "Tim sangat ramah dan hasil pemasangan rapi.",
  "Prosesnya cepat, informasinya jelas.",
  "Teknisi datang tepat waktu dan bekerja dengan bersih.",
  "Pelayanan baik, semoga kualitasnya konsisten.",
  "Pemasangan sudah sesuai harapan kami.",
  "Mohon tingkatkan komunikasi sebelum kunjungan teknisi.",
  "Hasil instalasi kurang rapi di bagian kabel.",
  "Tim sangat membantu menjelaskan cara penggunaan.",
];

async function seed() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is not configured");
  const existing = await db.select({ id: branches.id }).from(branches).limit(1);
  if (existing[0]) {
    await db.insert(users).values({ openId: "demo-superadmin@example.com", name: "Super Admin", email: "superadmin@example.com", role: "super_admin", status: "active", loginMethod: "local" }).onDuplicateKeyUpdate({ set: { role: "super_admin", status: "active" } });
    await db.update(settings).set({ companyName: "Service Solution" });
    console.log("Seed skipped: existing data updated with superadmin and branding");
    return;
  }

  await db.insert(settings).values({ companyName: "Service Solution" });
  await db.insert(branches).values([
    { code: "SGK", name: "Singkawang", address: "Jl. Diponegoro No. 18", status: "active" },
    { code: "PTK", name: "Pontianak", address: "Jl. Gajah Mada No. 42", status: "active" },
    { code: "KTP", name: "Ketapang", address: "Jl. Brigjen Katamso No. 7", status: "active" },
  ]);
  const branchRows = await db.select().from(branches);
  const byCode = Object.fromEntries(branchRows.map((branch) => [branch.code, branch]));

  await db.insert(teams).values([
    { branchId: byCode.SGK.id, name: "Installation Team A", status: "active" },
    { branchId: byCode.SGK.id, name: "Installation Team B", status: "active" },
    { branchId: byCode.SGK.id, name: "Installation Team C", status: "active" },
    { branchId: byCode.PTK.id, name: "Pontianak Field Team", status: "active" },
    { branchId: byCode.PTK.id, name: "Pontianak Care Team", status: "active" },
    { branchId: byCode.KTP.id, name: "Ketapang Installation", status: "active" },
  ]);
  const teamRows = await db.select().from(teams);

  await db.insert(qrCodes).values([
    { branchId: byCode.SGK.id, name: "Review Singkawang", code: "SGK", url: "/r/SGK", status: "active" },
    { branchId: byCode.SGK.id, name: "Singkawang Installation QR", code: "SGK-INSTALL", url: "/r/SGK-INSTALL", status: "active" },
    { branchId: byCode.PTK.id, name: "Review Pontianak", code: "PTK", url: "/r/PTK", status: "active" },
    { branchId: byCode.PTK.id, name: "Pontianak Front Desk", code: "PTK-FRONT", url: "/r/PTK-FRONT", status: "active" },
    { branchId: byCode.KTP.id, name: "Review Ketapang", code: "KTP", url: "/r/KTP", status: "active" },
  ]);
  const qrRows = await db.select().from(qrCodes);

  await db.insert(users).values([
    { openId: "demo-admin@example.com", name: "Workspace Admin", email: "admin@example.com", role: "admin", status: "active", loginMethod: "local" },
    { openId: "demo-superadmin@example.com", name: "Super Admin", email: "superadmin@example.com", role: "super_admin", status: "active", loginMethod: "local" },
    { openId: "demo-singkawang@example.com", name: "Singkawang Branch Admin", email: "singkawang@example.com", role: "branch_admin", branchId: byCode.SGK.id, status: "active", loginMethod: "demo" },
    { openId: "demo-viewer@example.com", name: "Read Only Viewer", email: "viewer@example.com", role: "viewer", status: "active", loginMethod: "demo" },
  ]);

  const now = new Date();
  const reviewValues = Array.from({ length: 120 }, (_, index) => {
    const branch = branchRows[index % branchRows.length];
    const branchQrs = qrRows.filter((qr) => qr.branchId === branch.id);
    const branchTeams = teamRows.filter((team) => team.branchId === branch.id);
    const low = index % 13 === 0 || index % 29 === 0;
    const base = low ? 2 : 4;
    const installationRating = Math.min(5, Math.max(1, base + ((index * 3) % 2)));
    const groomingRating = Math.min(5, Math.max(1, base + ((index + 1) % 2)));
    const serviceRating = Math.min(5, Math.max(1, base + ((index + 2) % 2)));
    const createdAt = new Date(now);
    createdAt.setDate(now.getDate() - (index % 90));
    createdAt.setHours(8 + (index % 10), (index * 7) % 60, 0, 0);
    return {
      branchId: branch.id,
      qrCodeId: branchQrs[index % branchQrs.length].id,
      teamId: branchTeams[index % branchTeams.length].id,
      receiptNo: `INV-${String(1000 + index).padStart(6, "0")}`,
      installationRating,
      groomingRating,
      serviceRating,
      comment: comments[index % comments.length],
      status: index % 9 === 0 ? "resolved" : index % 4 === 0 ? "reviewed" : "new",
      createdAt,
      updatedAt: createdAt,
    } as const;
  });
  await db.insert(reviews).values(reviewValues);
  const reviewRows = await db.select().from(reviews);
  const lowReviews = reviewRows.filter((review) => Math.min(review.installationRating, review.groomingRating, review.serviceRating) <= 2);
  if (lowReviews.length) {
    await db.insert(reviewAlerts).values(lowReviews.map((review) => ({ reviewId: review.id, type: "negative_review", severity: "critical" as const, message: "Low customer rating requires attention", status: "open" as const })));
  }
  console.log(`Seeded ${branchRows.length} branches, ${qrRows.length} QR codes, ${reviewRows.length} reviews.`);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
