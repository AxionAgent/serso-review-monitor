import { describe, expect, it } from "vitest";
import { buildSummaryPrompt, formatReviewDate, overallRating, summarizeStats, type SummaryReview } from "./analytics";

const mk = (over: Partial<SummaryReview> & { storeName: string; ratings: [number, number, number] }): SummaryReview => ({
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

  it("mengurutkan store dari yang paling banyak review buruk", () => {
    const reviews = [
      mk({ storeName: "Bersih", ratings: [5, 5, 5] }),
      mk({ storeName: "Parah", ratings: [1, 1, 1] }),
      mk({ storeName: "Parah", ratings: [2, 2, 2] }),
      mk({ storeName: "Sedang", ratings: [5, 5, 5] }),
    ];
    const s = summarizeStats(reviews);
    expect(s.stores.map((x) => x.name)).toEqual(["Parah", "Bersih", "Sedang"]);
    expect(s.stores[0].bad).toBe(2);
    expect(s.stores[0].n).toBe(2);
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
    mk({ storeName: "POOL SINGKAWANG", ratings: [2, 2, 2], comment: "kebersihan kurang" }),
    mk({ storeName: "PONTIANAK", ratings: [5, 5, 5], comment: "mantap" }),
  ];

  it("menyisipkan angka yang sudah dihitung agar LLM tidak mengarang", () => {
    const p = buildSummaryPrompt(reviews);
    expect(p).toContain("Total review: 2");
    expect(p).toContain("1 bagus (>=4.0)");
    expect(p).toContain("1 buruk (<3.0)");
    expect(p).toContain("POOL SINGKAWANG");
  });

  it("memuat instruksi bagian bagus + improve + larangan mengarang angka", () => {
    const p = buildSummaryPrompt(reviews);
    expect(p).toContain("YANG SUDAH BAGUS");
    expect(p).toContain("YANG PERLU IMPROVE");
    expect(p).toContain("JANGAN menyebut angka yang tidak ada di blok STATISTIK");
  });

  it("memuat tanggal tiap baris data mentah", () => {
    const p = buildSummaryPrompt(reviews);
    expect(p).toContain(formatReviewDate(reviews[0].createdAt));
  });

  it("melempar kalau tidak ada review", () => {
    expect(() => buildSummaryPrompt([])).toThrow();
  });
});

describe("formatReviewDate", () => {
  it("memakai zona WIB, bukan UTC", () => {
    // 2026-09-10T18:00:00Z = 11 Sep 01:00 WIB -> harus tampil 11, bukan 10
    expect(formatReviewDate(new Date("2026-09-10T18:00:00Z"))).toContain("11");
  });
});
