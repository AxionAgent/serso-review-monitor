import "dotenv/config";
import express from "express";
import mysql from "mysql2/promise";
import QRCode from "qrcode";
import path from "path";

// =============================================================================
// Serso Review Monitor — v2 (isolated app + DB)
// Poin 1 user: QR all-in-one (SATU QR universal, langsung ke form,
// TANPA klasifikasi per branch). Review unassigned → admin assign manual.
// DB: serso_v2 (DATABASE_URL_V2). Port: PORT_V2 (default 9312).
// Path prefix: /v2/* (Caddy reverse_proxy path tanpa rewrite).
// =============================================================================

const PORT = parseInt(process.env.PORT_V2 || "9312", 10);
const DATABASE_URL = process.env.DATABASE_URL_V2 || "";
// Base URL yang dipakai untuk konten QR — di-build ke /v2/feedback di domain publik
const PUBLIC_BASE_URL = process.env.V2_PUBLIC_BASE_URL || "https://reviewv2.kemscloud.web.id";

if (!DATABASE_URL) {
  console.error("[v2] DATABASE_URL_V2 is required");
  process.exit(1);
}

async function ensureDatabase() {
  const url = new URL(DATABASE_URL);
  const dbName = url.pathname.replace(/^\//, "");
  const adminUrl = new URL(DATABASE_URL);
  adminUrl.pathname = "/";
  const conn = await mysql.createConnection(adminUrl.toString());
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();
}

async function ensureTables(conn: mysql.Connection) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS branches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(16) NOT NULL UNIQUE,
      name VARCHAR(160) NOT NULL,
      address VARCHAR(255),
      status ENUM('active','inactive') NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INT AUTO_INCREMENT PRIMARY KEY,
      branch_id INT NULL,
      receipt_no VARCHAR(80) NOT NULL,
      installation_rating INT NOT NULL,
      grooming_rating INT NOT NULL,
      service_rating INT NOT NULL,
      comment TEXT,
      status ENUM('new','reviewed','resolved','archived') NOT NULL DEFAULT 'new',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX (branch_id),
      INDEX (receipt_no),
      INDEX (status),
      INDEX (created_at)
    ) ENGINE=InnoDB
  `);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_name VARCHAR(160) NOT NULL DEFAULT 'Service Solution',
      review_page_title VARCHAR(160) NOT NULL DEFAULT 'Bagikan pengalaman Anda',
      thank_you_message VARCHAR(500) NOT NULL DEFAULT 'Masukan Anda membantu kami meningkatkan kualitas layanan.',
      negative_threshold INT NOT NULL DEFAULT 2,
      timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta',
      primary_color VARCHAR(32) NOT NULL DEFAULT '#1d6f63',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);
  // pastikan ada 1 baris settings
  await conn.execute("INSERT IGNORE INTO settings (id) VALUES (1)");
}

async function main() {
  await ensureDatabase();
  const conn = await mysql.createConnection(DATABASE_URL);
  await ensureTables(conn);

  // Seed minimal branch table supaya admin v2 bisa assign (copy branch dari v1)
  try {
    const v1Url = process.env.DATABASE_URL_V1;
    if (v1Url) {
      const v1Conn = await mysql.createConnection(v1Url);
      const [branches] = (await v1Conn.execute("SELECT code, name, address, status FROM branches WHERE status='active'")) as any;
      for (const b of branches as Array<{ code: string; name: string; address: string | null; status: string }>) {
        await conn.execute(
          "INSERT INTO branches (code, name, address, status) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)",
          [b.code, b.name, b.address, b.status]
        );
      }
      await v1Conn.end();
    }
  } catch (err) {
    console.warn("[v2] Branch seed from v1 skipped:", (err as Error).message);
  }

  const app = express();
  app.use(express.json({ limit: "512kb" }));
  app.use(express.urlencoded({ extended: true, limit: "512kb" }));

  app.get("/healthz", (_req, res) => res.status(200).send("ok"));

  // API: submit review
  app.post("/api/reviews", async (req, res) => {
    const { receiptNo, installationRating, groomingRating, serviceRating, comment } = req.body || {};
    if (
      typeof receiptNo !== "string" || !receiptNo.trim() ||
      ![installationRating, groomingRating, serviceRating].every((v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 5)
    ) {
      return res.status(400).json({ ok: false, error: "Data tidak valid" });
    }
    await conn.execute(
      "INSERT INTO reviews (branch_id, receipt_no, installation_rating, grooming_rating, service_rating, comment) VALUES (NULL, ?, ?, ?, ?, ?)",
      [receiptNo.trim(), installationRating, groomingRating, serviceRating, comment ? String(comment).trim() : null]
    );
    return res.json({ ok: true });
  });

  // API: QR SVG universal
  app.get("/api/qr.svg", async (_req, res) => {
    const svg = await QRCode.toString(`${PUBLIC_BASE_URL}/feedback`, { type: "svg", margin: 1, width: 280 });
    res.setHeader("Content-Type", "image/svg+xml");
    res.send(svg);
  });

  // API: list reviews (admin simple)
  app.get("/api/reviews", async (_req, res) => {
    const [rows] = await conn.execute(
      "SELECT r.id, r.branch_id, r.receipt_no, r.installation_rating, r.grooming_rating, r.service_rating, r.comment, r.status, r.created_at, b.name AS branch_name FROM reviews r LEFT JOIN branches b ON b.id = r.branch_id ORDER BY r.created_at DESC LIMIT 100"
    );
    res.json(rows);
  });

  // API: list branches
  app.get("/api/branches", async (_req, res) => {
    const [rows] = await conn.execute("SELECT id, code, name FROM branches WHERE status='active' ORDER BY name");
    res.json(rows);
  });

  // API: settings publik (title, company, thankYou)
  app.get("/api/settings", async (_req, res) => {
    const [rows] = (await conn.execute("SELECT review_page_title, company_name, thank_you_message FROM settings LIMIT 1")) as any;
    if (rows.length === 0) return res.json({});
    const r = rows[0];
    res.json({
      reviewPageTitle: r.review_page_title,
      companyName: r.company_name,
      thankYouMessage: r.thank_you_message,
    });
  });

  // API: assign branch ke review (admin manual)
  app.post("/api/reviews/:id/assign", async (req, res) => {
    const id = Number(req.params.id);
    const branchId = Number(req.body?.branchId);
    if (!Number.isInteger(id) || !Number.isInteger(branchId)) {
      return res.status(400).json({ ok: false, error: "Parameter tidak valid" });
    }
    await conn.execute("UPDATE reviews SET branch_id=? WHERE id=?", [branchId, id]);
    return res.json({ ok: true });
  });

  // Serve static v2 UI. NOTE: Caddy strips /v2 prefix → backend sees root paths.
  // Path static: cari di (1) dist/v2/public (runtime bundle) atau (2) server/v2/public (dev).
  let staticDir = path.resolve(import.meta.dirname, "public"); // dist/v2/public saat dibuild
  const fs = await import("fs");
  if (!fs.existsSync(staticDir)) {
    const dev = path.resolve(process.cwd(), "server", "v2", "public");
    if (fs.existsSync(dev)) staticDir = dev;
  }
  console.log(`[v2] staticDir = ${staticDir}`);
  app.get("/", (_req, res) => res.sendFile(path.join(staticDir, "index.html")));
  app.get("/feedback", (_req, res) => res.sendFile(path.join(staticDir, "feedback.html")));
  app.get("/admin", (_req, res) => res.sendFile(path.join(staticDir, "admin.html")));
  app.use(express.static(staticDir));

  app.listen(PORT, () => console.log(`[v2] Server running on http://localhost:${PORT}/`));
}

main().catch((err) => {
  console.error("[v2] Failed to start:", err);
  process.exit(1);
});
