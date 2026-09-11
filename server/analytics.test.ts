import { describe, expect, it } from "vitest";
import { buildSummaryPrompt, formatReviewDate, overallRating, summarizeStats, type SummaryReview } from "./analytics";

let receiptSeq = 0;
const mk = (over: Partial<SummaryReview> & { storeName: string | null; ratings: [number, number, number] }): SummaryReview => ({
  receiptNo: over.receiptNo ?? `R${++receiptSeq}`,
  storeName: over.storeName,
  storeCode: null,
  installationRating: over.ratings[0],
  groomingRating: over.ratings[1],
  serviceRating: over.ratings[2],
  status: over.status ?? "new",
  comment: over.comment ?? "ok",
  createdAt: over.createdAt ?? new Date("2026-09-10T10:00:00+07:00"),
});

describe("summarizeStats", () => {
  it("menghitung sebaran bagus/sedang/buruk dengan batas >=4 dan <3", () => {
    const reviews = [
      mk({ storeName: "A", ratings: [5, 5, 5] }), // avg 5.00 bagus
      mk({ storeName: "A", ratings: [4, 4, 4] }), // avg 4.00 bagus (batas bawah)
      mk({ storeName: "B", ratings: [3, 3, 4] }), // avg 3.33 sedang
      mk({ storeName: "B", ratings: [3, 3, 3] }), // avg 3.00 sedang (batas bawah)
      mk({ storeName: "C", ratings: [2, 3, 3] }), // avg 2.67 buruk
    ];
    const s = summarizeStats(reviews);
    expect(s.total).toBe(5);
    expect(s.good).toBe(2);
    expect(s.mid).toBe(2);
    expect(s.bad).toBe(1);
    // invariant: kategori saling menutup dan jumlahnya sama dengan total
    expect(s.good + s.mid + s.bad).toBe(s.total);
  });

  it("rata-rata 3 dimensi dihitung per aspek, bukan dari overall", () => {
    const reviews = [
      mk({ storeName: "A", ratings: [1, 2, 3] }),
      mk({ storeName: "A", ratings: [3, 4, 5] }),
    ];
    const s = summarizeStats(reviews);
    expect(s.dimensions["Pemasangan"]).toBe(2);
    expect(s.dimensions["Grooming"]).toBe(3);
    expect(s.dimensions["Pelayanan"]).toBe(4);
    expect(s.average).toBeCloseTo(3, 6);
  });

  it("mengurutkan store dari rata-rata terendah", () => {
    const reviews = [
      mk({ storeName: "Bersih", ratings: [5, 5, 5] }),
      mk({ storeName: "Parah", ratings: [1, 1, 1] }),
      mk({ storeName: "Parah", ratings: [2, 2, 2] }),
      mk({ storeName: "Sedang", ratings: [5, 5, 5] }),
    ];
    const s = summarizeStats(reviews);
    expect(s.stores.map((x) => x.name)).toEqual(["Parah", "Bersih", "Sedang"]);
    expect(s.stores[0].n).toBe(2);
    expect(s.stores[0].average).toBeCloseTo(1.5, 6);
  });

  it("lowest diambil hanya dari review belum resolved", () => {
    const reviews = [
      // overall 1.0 tapi SUDAH resolved -> tidak boleh jadi "terendah perlu perhatian"
      mk({ storeName: "A", ratings: [1, 1, 1], status: "resolved", receiptNo: "DONE-1" }),
      mk({ storeName: "A", ratings: [2, 2, 2], status: "new", receiptNo: "OPEN-2" }),
      mk({ storeName: "A", ratings: [5, 5, 5], status: "open", receiptNo: "OPEN-3" }),
    ];
    const s = summarizeStats(reviews);
    expect(s.pending).toBe(2);
    expect(s.stores[0].pending).toBe(2);
    expect(s.stores[0].lowest?.receiptNo).toBe("OPEN-2");
    expect(s.stores[0].lowest?.statusLabel).toBe("baru, belum ditangani");
  });

  it("store yang semuanya resolved punya lowest null", () => {
    const s = summarizeStats([mk({ storeName: "A", ratings: [5, 5, 5], status: "resolved" })]);
    expect(s.stores[0].lowest).toBeNull();
    expect(s.pending).toBe(0);
  });

  it("komentar lowest dipotong ke <=120 char", () => {
    const long = "x".repeat(300);
    const s = summarizeStats([mk({ storeName: "A", ratings: [1, 1, 1], comment: long })]);
    const c = s.stores[0].lowest?.comment ?? "";
    expect(c.length).toBeLessThanOrEqual(120);
    expect(c.endsWith("...")).toBe(true);
  });

  it("store tanpa nama jatuh ke storeCode lalu '?' (tidak crash)", () => {
    const r = { ...mk({ storeName: "", ratings: [4, 4, 4] }), storeName: null, storeCode: "PNK" };
    expect(summarizeStats([r]).stores[0].name).toBe("PNK");
    const r2 = { ...r, storeCode: null };
    expect(summarizeStats([r2]).stores[0].name).toBe("?");
  });

  it("daftar kosong tidak NaN", () => {
    const s = summarizeStats([]);
    expect(s.total).toBe(0);
    expect(s.average).toBe(0);
    expect(s.pending).toBe(0);
    expect(s.dimensions["Pemasangan"]).toBe(0);
    expect(s.stores).toEqual([]);
  });
});

describe("overallRating", () => {
  it("rata-rata tiga dimensi", () => {
    expect(overallRating({ installationRating: 1, groomingRating: 2, serviceRating: 3 })).toBe(2);
  });
});

describe("buildSummaryPrompt", () => {
  const reviews = [
    mk({ storeName: "POOL SINGKAWANG", ratings: [2, 2, 2], comment: "kebersihan kurang", receiptNo: "TIKET-9", status: "new" }),
    mk({ storeName: "PONTIANAK", ratings: [5, 5, 5], comment: "mantap", status: "resolved" }),
  ];

  it("menyisipkan angka fakta yang sudah dihitung agar LLM tidak mengarang", () => {
    const p = buildSummaryPrompt(reviews);
    expect(p).toContain("Total 2 review");
    expect(p).toContain("rata-rata keseluruhan 3.5/5");
    expect(p).toContain("Pemasangan 3.5, Grooming 3.5, Pelayanan 3.5");
    expect(p).toContain("Masih belum di-resolve: 1 review.");
  });

  it("fakta store memuat receipt terendah yang belum selesai + komentarnya", () => {
    const p = buildSummaryPrompt(reviews);
    expect(p).toContain("POOL SINGKAWANG");
    expect(p).toContain("no. receipt TIKET-9");
    expect(p).toContain("status baru, belum ditangani");
    expect(p).toContain('komentar: "kebersihan kurang"');
    // PONTIANAK sudah resolved semua -> tidak ada review belum selesai
    expect(p).toContain("PONTIANAK: 1 review, rata-rata 5.0/5");
    expect(p).toContain("tidak ada review yang belum di-resolve");
  });

  it("memuat format keluaran + larangan mengarang angka", () => {
    const p = buildSummaryPrompt(reviews);
    expect(p).toContain("Bahasa Indonesia santai-profesional");
    expect(p).toContain("dilarang menghitung atau mengarang angka baru");
    expect(p).toContain("Dilarang menyebut angka, store, atau receipt");
    expect(p).toContain("DATA MENTAH:");
  });

  it("memuat tanggal tiap baris data mentah", () => {
    const p = buildSummaryPrompt(reviews);
    expect(p).toContain(formatReviewDate(reviews[0].createdAt));
  });

  it("melempar kalau tidak ada review", () => {
    expect(() => buildSummaryPrompt([])).toThrow();
  });

  it("fakta aspek terendah: seri disebut setara, beda disebut nama aspeknya", () => {
    // kedua review di fixture punya dimensi sama -> "Ketiga aspek rata-ratanya sama"
    expect(buildSummaryPrompt(reviews)).toContain("Ketiga aspek rata-ratanya sama (3.5/5).");
    // fixture miring: Pemasangan sendiri yang terendah
    const pSkew = buildSummaryPrompt([mk({ storeName: "A", ratings: [1, 5, 5], status: "new" })]);
    expect(pSkew).toContain("Aspek terendah keseluruhan: Pemasangan (1.0/5).");
  });
});

describe("formatReviewDate", () => {
  it("memakai zona WIB, bukan UTC", () => {
    // 2026-09-10T18:00:00Z = 11 Sep 01:00 WIB -> harus tampil 11, bukan 10
    expect(formatReviewDate(new Date("2026-09-10T18:00:00Z"))).toContain("11");
  });
});
