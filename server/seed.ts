import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getDb } from "./db";
import { branches, qrCodes, reviewAlerts, reviews, settings, users } from "../drizzle/schema";

const SEED_REVIEW_COUNT = 120;

const comments = [
  "Tim sangat ramah dan hasil pemasangan rapi.",
  "Prosesnya cepat, informasinya jelas.",
  "Teknisi datang tepat waktu dan bekerja dengan bersih.",
  "Pelayanan baik, semoga kualitasnya konsisten.",
  "Pemasangan sudah sesuai harapan kami.",
  "Mohon tingkatkan komunikasi sebelum kunjungan teknisi.",
  "Hasil instalasi kurang rapi di bagian kabel.",
  "Tim sangat membantu menjelaskan cara penggunaan.",
  "Kabel berantakan dan tidak dibereskan sama sekali.",
  "Pelayanan lambat, teknisi datang terlambat 2 jam.",
  "Pemasangan rapi, sesuai standar perusahaan.",
  "Teknisi kurang ramah dan terburu-buru menyelesaikan.",
  "Saya puas dengan hasilnya, terima kasih.",
  "Grooming tim perlu ditingkatkan, seragam kotor.",
  "Proses cepat dan hasil memuaskan, recommended!",
  "Komunikasi sebelum datang sangat kurang.",
  "Alat yang dibawa tidak lengkap, jadi bolak-balik.",
  "Pelayanan ramah dan profesional, sangat puas.",
  "Mohon perhatikan kembali kebersihan area kerja.",
  "Overall baik, hanya perlu dipercepat responnya.",
];

const RECEIPT_PREFIXES = ["MC", "MD", "MO", "MB", "MS", "U"];
/** Store code dari server/store.json (5A=Selma Singkawang, 3M=Selma Pontianak, dst).
 *  JANGAN pakai angka 1-9 — katalog pakai alfanumerik, kode tak dikenal tampil "Unknown". */
const STORE_CODES = ["5A", "3M", "3N", "D7", "PP", "1U", "00"];

/** V2 status distribution: new(30%), open(30%), resolved(35%), archived(5%) */
function statusFor(index: number): "new" | "open" | "resolved" | "archived" {
  const r = index % 20;
  if (r < 6) return "new";
  if (r < 12) return "open";
  if (r < 19) return "resolved";
  return "archived";
}

async function seed() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is not configured");

  // Guard: semua STORE_CODES harus ada di katalog, kalau tidak receipt tampil "Unknown"
  const storeJsonPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "store.json");
  const catalog = new Set((JSON.parse(readFileSync(storeJsonPath, "utf8")) as { value: string }[]).map((e) => e.value.toUpperCase()));
  const missing = STORE_CODES.filter((c) => !catalog.has(c.toUpperCase()));
  if (missing.length) throw new Error(`STORE_CODES tidak ada di store.json: ${missing.join(", ")}`);

  // Users demo (admin, super_admin, branch_admin, viewer) — upsert, idempotent
  await db.insert(users).values([
    { openId: "demo-admin@example.com", name: "Workspace Admin", email: "admin@example.com", role: "admin", status: "active", loginMethod: "local" },
    { openId: "demo-superadmin@example.com", name: "Super Admin", email: "superadmin@example.com", role: "super_admin", status: "active", loginMethod: "local" },
    { openId: "demo-singkawang@example.com", name: "Singkawang Branch Admin", email: "singkawang@example.com", role: "branch_admin", status: "active", loginMethod: "demo" },
    { openId: "demo-viewer@example.com", name: "Read Only Viewer", email: "viewer@example.com", role: "viewer", status: "active", loginMethod: "demo" },
  ]).onDuplicateKeyUpdate({ set: { status: "active" } });

  // Pakai branch yang sudah ada (jangan hardcode — data real: POOLSKW/TEST/PNK).
  let branchRows = await db.select().from(branches);
  if (!branchRows.length) {
    await db.insert(settings).values({ companyName: "Service Solution" }).onDuplicateKeyUpdate({ set: { companyName: "Service Solution" } });
    await db.insert(branches).values([
      { code: "POOLSKW", name: "POOL SINGKAWANG", status: "active" },
      { code: "PNK", name: "PONTIANAK", status: "active" },
    ]);
    branchRows = await db.select().from(branches);
  }

  // QR universal (branchId NULL) + QR per branch bila belum ada
  let qrRows = await db.select().from(qrCodes);
  if (!qrRows.some((qr) => qr.branchId === null)) {
    await db.insert(qrCodes).values({ branchId: null, name: "QR Universal", code: "UNIVERSAL", url: "/r/UNIVERSAL", status: "active" }).onDuplicateKeyUpdate({ set: { status: "active" } });
    qrRows = await db.select().from(qrCodes);
  }

  const existingReviews = await db.select({ id: reviews.id }).from(reviews);
  const reviewTarget = SEED_REVIEW_COUNT - existingReviews.length;
  if (reviewTarget <= 0) {
    console.log(`Seed skipped: ${existingReviews.length} reviews already present (${branchRows.length} branches)`);
    return;
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const values = Array.from({ length: reviewTarget }, (_, offset) => {
    const index = existingReviews.length + offset;
    const branch = branchRows[index % branchRows.length];
    const low = index % 7 === 0 || index % 13 === 0 || index % 29 === 0;
    const base = low ? 2 : 4;
    const clamp = (n: number) => Math.min(5, Math.max(1, n));
    // Prefix U = format "U{store}.{unit}.{date}.{seq}", sisanya "{prefix}.{store}.{date}.{seq}"
    const prefix = RECEIPT_PREFIXES[index % RECEIPT_PREFIXES.length];
    const store = STORE_CODES[index % STORE_CODES.length];
    const receiptNo = prefix === "U" ? `U${store}.${(index % 10) + 1}.${dateStr}.${index + 1}` : `${prefix}.${store}.${dateStr}.${index + 1}`;

    const createdAt = new Date(now);
    // Sebar hanya 6 hari terakhir — auto-lifecycle (new→open 24j, open→resolved 7h) akan
    // menelan review lama; 6 hari bikin distribusi status seed tetap terlihat.
    createdAt.setDate(now.getDate() - (index % 6));
    createdAt.setHours(8 + (index % 12), (index * 17) % 60, 0, 0);

    return {
      branchId: branch.id,
      qrCodeId: qrRows.find((qr) => qr.branchId === branch.id || qr.branchId === null)?.id ?? null,
      receiptNo,
      installationRating: clamp(base + ((index * 3) % 2)),
      groomingRating: clamp(base + ((index + 1) % 2)),
      serviceRating: clamp(base + ((index + 2) % 2)),
      comment: comments[index % comments.length],
      status: statusFor(index),
      createdAt,
      updatedAt: createdAt,
    };
  });

  await db.insert(reviews).values(values);

  // Alert untuk review negative yang baru masuk (hindari duplikat saat seed di-ulang)
  const seededReceipts = new Set(values.map((v) => v.receiptNo));
  const reviewRows = await db.select().from(reviews);
  const lowReviews = reviewRows.filter((r) => seededReceipts.has(r.receiptNo) && Math.min(r.installationRating, r.groomingRating, r.serviceRating) <= 2);
  const existingAlerts = await db.select({ id: reviewAlerts.id }).from(reviewAlerts).limit(1);
  if (lowReviews.length && !existingAlerts.length) {
    await db.insert(reviewAlerts).values(lowReviews.map((r) => ({ reviewId: r.id, type: "negative_review", severity: "critical" as const, message: "Low customer rating requires attention", status: "open" as const })));
  }

  console.log(`Seeded ${values.length} new reviews (${reviewRows.length} total across ${branchRows.length} branches), ${lowReviews.length} alerts.`);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
