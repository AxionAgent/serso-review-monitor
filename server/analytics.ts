/** Perakitan prompt + statistik untuk AI Summarize (dipisah supaya bisa diuji tanpa DB). */

export type SummaryReview = {
  receiptNo: string;
  storeName: string | null;
  storeCode: string | null;
  installationRating: number;
  groomingRating: number;
  serviceRating: number;
  status: string;
  comment: string | null;
  createdAt: Date;
};

export type Dimensions = { "Pemasangan": number; Grooming: number; Pelayanan: number };

export type LowestUnresolved = {
  receiptNo: string;
  overall: number;
  dims: Dimensions;
  comment: string | null;
  statusLabel: string;
  date: string;
};

export type StoreStats = {
  name: string;
  n: number;
  average: number;
  dimensions: Dimensions;
  pending: number;
  lowest: LowestUnresolved | null;
};

export type SummaryStats = {
  total: number;
  good: number;
  mid: number;
  bad: number;
  pending: number;
  average: number;
  dimensions: Dimensions;
  stores: StoreStats[];
};

const DIMS = ["Pemasangan", "Grooming", "Pelayanan"] as const;
const mean = (ns: number[]) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0);
// rata-rata pakai 2 desimal: dengan 1 desimal ketiga aspek bisa tampil "4.0" semua
// padahal aslinya 3,95 vs 4,02 — catatan "terendah" jadi kelihatan ngawur.
const f2 = (n: number) => n.toFixed(2);
const STATUS_LABEL: Record<string, string> = {
  new: "baru, belum ditangani",
  open: "dalam penanganan",
};

export const overallRating = (r: Pick<SummaryReview, "installationRating" | "groomingRating" | "serviceRating">) =>
  (r.installationRating + r.groomingRating + r.serviceRating) / 3;

/** Format tanggal WIB, mis. "10 Sep". */
export const formatReviewDate = (d: Date) =>
  new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", timeZone: "Asia/Jakarta" }).format(new Date(d));

const dimsOf = (list: SummaryReview[]): Dimensions => ({
  "Pemasangan": mean(list.map((r) => r.installationRating)),
  "Grooming": mean(list.map((r) => r.groomingRating)),
  "Pelayanan": mean(list.map((r) => r.serviceRating)),
});

const truncateComment = (c: string | null) => {
  if (!c) return null;
  const t = c.trim().replace(/\s+/g, " ");
  return t.length > 120 ? `${t.slice(0, 117)}...` : t;
};

/**
 * Hitung statistik di server. LLM terbukti salah hitung saat diberi data mentah
 * (klaim 88 ulasan padahal 78 dikirim), jadi angka dihitung di sini dan dikirim
 * sebagai fakta yang tidak boleh diubah. "Terendah" hanya dilihat dari review
 * yang belum beres (status bukan resolved) — yang sudah resolved bukan PR lagi.
 */
export function summarizeStats(reviews: SummaryReview[]): SummaryStats {
  const byStore = new Map<string, SummaryReview[]>();
  for (const r of reviews) {
    const key = r.storeName ?? r.storeCode ?? "?";
    const list = byStore.get(key);
    if (list) list.push(r);
    else byStore.set(key, [r]);
  }
  const good = reviews.filter((r) => overallRating(r) >= 4).length;
  const bad = reviews.filter((r) => overallRating(r) < 3).length;
  const pendingAll = reviews.filter((r) => r.status !== "resolved").length;
  const stores: StoreStats[] = Array.from(byStore.entries())
    .map(([name, list]) => {
      const pending = list.filter((r) => r.status !== "resolved");
      const low = pending.length
        ? pending.reduce((a, b) => (overallRating(b) < overallRating(a) ? b : a))
        : null;
      return {
        name,
        n: list.length,
        average: mean(list.map(overallRating)),
        dimensions: dimsOf(list),
        pending: pending.length,
        lowest: low
          ? {
              receiptNo: low.receiptNo,
              overall: overallRating(low),
              dims: { "Pemasangan": low.installationRating, Grooming: low.groomingRating, Pelayanan: low.serviceRating },
              comment: truncateComment(low.comment),
              statusLabel: STATUS_LABEL[low.status] ?? low.status,
              date: formatReviewDate(low.createdAt),
            }
          : null,
      };
    })
    .sort((a, b) => a.average - b.average || b.pending - a.pending);
  return {
    total: reviews.length,
    good,
    bad,
    pending: pendingAll,
    mid: reviews.length - good - bad,
    average: mean(reviews.map(overallRating)),
    dimensions: dimsOf(reviews),
    stores,
  };
}

const periodOf = (reviews: SummaryReview[]) =>
  `${formatReviewDate(reviews[reviews.length - 1].createdAt)} - ${formatReviewDate(reviews[0].createdAt)}`;

/**
 * Render ringkasan final. Deterministic by design (LLM dulu salah hitung angka).
 * Format sederhana per owner: total + tertinggi / terendah / rata-rata, lalu
 * satu baris ringkas per store. Detail receipt/komentar/dimensi sengaja dibuang.
 */
export function renderSummary(reviews: SummaryReview[]): string {
  if (!reviews.length) throw new Error("renderSummary: tidak ada review");
  const s = summarizeStats(reviews);
  const storeOf = (r: SummaryReview) => r.storeName ?? r.storeCode ?? "?";
  // Seri -> review terbaru menang (input tersortir newest-first, reduce ambil yang pertama).
  const best = reviews.reduce((a, b) => (overallRating(b) > overallRating(a) ? b : a));
  const worst = reviews.reduce((a, b) => (overallRating(b) < overallRating(a) ? b : a));
  const lines = [
    `Periode ${periodOf(reviews)} — ${s.total} review`,
    `Tertinggi: ${f2(overallRating(best))}/5 — ${storeOf(best)}, ${best.receiptNo}`,
    `Terendah: ${f2(overallRating(worst))}/5 — ${storeOf(worst)}, ${worst.receiptNo}`,
    `Rata-rata: ${f2(s.average)}/5 · Belum di-resolve: ${s.pending}`,
    "",
    ...s.stores.map((st) => `${st.name} — ${st.n} review, rata-rata ${f2(st.average)}/5`),
  ];
  return lines.join("\n");
}
