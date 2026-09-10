/** Perakitan prompt + statistik untuk AI Summarize (dipisah supaya bisa diuji tanpa DB). */

export type SummaryReview = {
  storeName: string | null;
  storeCode: string | null;
  installationRating: number;
  groomingRating: number;
  serviceRating: number;
  status: string;
  comment: string | null;
  createdAt: Date;
};

export type SummaryStats = {
  total: number;
  good: number;
  mid: number;
  bad: number;
  average: number;
  dimensions: { "Pemasangan": number; Grooming: number; Pelayanan: number };
  stores: { name: string; n: number; average: number; bad: number; dimensions: { "Pemasangan": number; Grooming: number; Pelayanan: number } }[];
};

const DIMS = ["Pemasangan", "Grooming", "Pelayanan"] as const;
const mean = (ns: number[]) => (ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0);

export const overallRating = (r: Pick<SummaryReview, "installationRating" | "groomingRating" | "serviceRating">) =>
  (r.installationRating + r.groomingRating + r.serviceRating) / 3;

/** Format tanggal WIB, mis. "10 Sep". */
export const formatReviewDate = (d: Date) =>
  new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", timeZone: "Asia/Jakarta" }).format(new Date(d));

/**
 * Hitung statistik di server. LLM terbukti salah hitung saat diberi data mentah
 * (klaim 88 ulasan padahal 78 dikirim), jadi angka dihitung di sini dan dikirim
 * sebagai fakta yang tidak boleh diubah.
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
  return {
    total: reviews.length,
    good,
    bad,
    mid: reviews.length - good - bad,
    average: mean(reviews.map(overallRating)),
    dimensions: {
      "Pemasangan": mean(reviews.map((r) => r.installationRating)),
      "Grooming": mean(reviews.map((r) => r.groomingRating)),
      "Pelayanan": mean(reviews.map((r) => r.serviceRating)),
    },
    stores: Array.from(byStore.entries())
      .map(([name, list]) => ({
        name,
        n: list.length,
        average: mean(list.map(overallRating)),
        bad: list.filter((r) => overallRating(r) < 3).length,
        dimensions: {
          "Pemasangan": mean(list.map((r) => r.installationRating)),
          "Grooming": mean(list.map((r) => r.groomingRating)),
          "Pelayanan": mean(list.map((r) => r.serviceRating)),
        },
      }))
      .sort((a, b) => b.bad - a.bad || b.n - a.n),
  };
}

export function buildSummaryPrompt(reviews: SummaryReview[]): string {
  if (!reviews.length) throw new Error("buildSummaryPrompt: tidak ada review");
  const s = summarizeStats(reviews);
  const period = `${formatReviewDate(reviews[reviews.length - 1].createdAt)} - ${formatReviewDate(reviews[0].createdAt)}`;
  return [
    `Analisis ${s.total} ulasan pelanggan dari ${s.stores.length} store (7 hari terakhir).`,
    "",
    "== STATISTIK (sudah dihitung sistem — jangan hitung ulang, jangan ubah angkanya) ==",
    `Total review: ${s.total} (periode ${period})`,
    `Rata-rata keseluruhan: ${s.average.toFixed(2)} / 5.00`,
    `Sebaran: ${s.good} bagus (>=4.0) | ${s.mid} sedang (3.0-3.99) | ${s.bad} buruk (<3.0)`,
    `Rata-rata per aspek: ${DIMS.map((d) => `${d} ${s.dimensions[d].toFixed(2)}`).join(" | ")}`,
    "",
    "Per store (angka ini PASTI BENAR, pakai apa adanya):",
    ...s.stores.map((st) => `  - ${st.name}: ${st.n} review, rata-rata ${st.average.toFixed(2)}, ${st.bad} review buruk | ${DIMS.map((d) => `${d} ${st.dimensions[d].toFixed(2)}`).join(", ")}`),
    "",
    "== DATA MENTAH ==",
    "Format: [tanggal] [store] rating pemasangan/grooming/pelayanan (rata-rata X.X) status: komentar.",
    ...reviews.map((r, i) => `${i + 1}. [${formatReviewDate(r.createdAt)}] [${r.storeName ?? r.storeCode ?? "?"}] rating ${r.installationRating}/${r.groomingRating}/${r.serviceRating} (rata-rata ${overallRating(r).toFixed(2)}) status ${r.status}: ${r.comment ?? "-"}`),
    "",
    "== YANG HARUS KAMU TULIS (bahasa Indonesia) ==",
    "1. Ringkasan kondisi — pakai angka dari blok STATISTIK di atas, jangan mengarang.",
    "2. YANG SUDAH BAGUS: aspek/store yang konsisten dipuji, sebut store + aspeknya.",
    "3. YANG PERLU IMPROVE: aspek/store bermasalah, urut dari paling parah, sebutkan aspek & store.",
    "4. Rekomendasi aksi konkret per store bermasalah (maks 5 poin), spesifik dan bisa dikerjakan tim lapangan.",
    "",
    "Aturan: dasarkan HANYA pada data di atas. JANGAN menyebut angka yang tidak ada di blok STATISTIK.",
    "Kalau store tidak bermasalah, jangan dipaksa masuk daftar improve.",
  ].join("\n");
}
