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
const f1 = (n: number) => n.toFixed(1);
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

const dimLine = (d: Dimensions) => `Pemasangan ${f1(d["Pemasangan"])}, Grooming ${f1(d.Grooming)}, Pelayanan ${f1(d.Pelayanan)}`;

export function buildSummaryPrompt(reviews: SummaryReview[]): string {
  if (!reviews.length) throw new Error("buildSummaryPrompt: tidak ada review");
  const s = summarizeStats(reviews);
  const period = `${formatReviewDate(reviews[reviews.length - 1].createdAt)} - ${formatReviewDate(reviews[0].createdAt)}`;
  const dimEntries = Object.entries(s.dimensions) as [keyof Dimensions, number][];
  const dimMin = Math.min(...dimEntries.map(([, v]) => v));
  const worstDims = dimEntries.filter(([, v]) => v === dimMin).map(([k]) => k);
  const worstFact =
    worstDims.length === 3
      ? `Ketiga aspek rata-ratanya sama (${f1(s.average)}/5).`
      : `Aspek terendah keseluruhan: ${worstDims.join(" dan ")} (${f1(dimMin)}/5).`;
  const storeFacts = s.stores.map((st) => {
    const head = `- ${st.name}: ${st.n} review, rata-rata ${f1(st.average)}/5 (${dimLine(st.dimensions)})`;
    if (!st.lowest) return `${head}; tidak ada review yang belum di-resolve`;
    const l = st.lowest;
    const comment = l.comment ? `, komentar: "${l.comment}"` : "";
    return (
      `${head}; review terendah yang belum selesai: no. receipt ${l.receiptNo} (${f1(l.overall)}/5, ${l.date}) — ` +
      `Pemasangan ${l.dims["Pemasangan"]}, Grooming ${l.dims.Grooming}, Pelayanan ${l.dims.Pelayanan}, ` +
      `status ${l.statusLabel}${comment}`
    );
  });
  return [
    "Kamu meringkas review kualitas layanan (rating 1-5: Pemasangan=Gym Equipment, Grooming=Room Facilities, Pelayanan=Employee Service).",
    "",
    `ANGKA FAKTA periode ${period} — gunakan PERSIS, dilarang menghitung atau mengarang angka baru:`,
    `- Total ${s.total} review, rata-rata keseluruhan ${f1(s.average)}/5. Per aspek: ${dimLine(s.dimensions)}.`,
    `- Masih belum di-resolve: ${s.pending} review.`,
    worstFact,
    ...storeFacts,
    "",
    "Tulis ringkasan HANYA dari fakta di atas, format persis seperti ini:",
    "1. Baris 1: \"Dalam periode {period}, {total} review masuk dengan rata-rata {average}/5 (Pemasangan x, Grooming y, Pelayanan z).\" — angka dari FAKTA.",
    "2. Baris 2: kalau ada yang belum di-resolve: \"{pending} review masih belum diselesaikan.\" kalau nol: \"Semua review periode ini sudah di-resolve.\"",
    "3. Lanjut satu baris per store, urut rata-rata terendah: \"{store} rata-rata {avg}/5\" — kalau ada review terendah belum selesai tambah \"; terendah di no. receipt {receiptNo} ({overall}/5, {date}): Pemasangan {i}, Grooming {g}, Pelayanan {s}, status {statusLabel}\" dan kutip komentarnya kalau ada.",
    "4. Kalimat penutup ≤1 baris: sebut aspek terendah sesuai baris FAKTA 'Aspek terendah keseluruhan' (kalau ketiganya sama, sebut rata-rata ketiganya setara) dan perlu perhatian.",
    "",
    "Aturan keras:",
    "- Bahasa Indonesia santai-profesional, maksimal 160 kata, TANPA tabel/heading markdown/bullet bersarang.",
    "- Dilarang menyebut angka, store, atau receipt yang tidak ada di FAKTA. Jangan menerawang penyebab/solusi.",
    "- Jangan gunakan data mentah di bawah ini untuk menghitung ulang — hanya untuk memilih kutipan komentar bila perlu.",
    "",
    "DATA MENTAH:",
    ...reviews.map((r) =>
      `${formatReviewDate(r.createdAt)} | ${r.storeName ?? "?"} | P:${r.installationRating} G:${r.groomingRating} S:${r.serviceRating} | ${r.status} | ${r.comment ?? ""}`),
  ].join("\n");
}
