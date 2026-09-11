import { describe, expect, it } from "vitest";
import { formatReviewDate, overallRating, renderSummary, summarizeStats, type SummaryReview } from "./analytics";

let receiptSeq = 0;
const mk = (over: Partial<SummaryReview> & { storeName: string | null; ratings: [number, number, number] }): SummaryReview => ({
  receiptNo: over.receiptNo ?? `R${++receiptSeq}`,
  storeName: over.storeName,
  storeCode: null,
  installationRating: over.ratings[0],
  groomingRating: over.ratings[1],
  serviceRating: over.ratings[2],
  status: over.status ?? "new",
  // "comment" explicit (termasuk null) harus dihormati; ?? bakal fallback-in null ke "ok"
  comment: "comment" in over ? (over.comment ?? null) : "ok",
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

describe("renderSummary", () => {
  const reviews = [
    mk({ storeName: "PONTIANAK", ratings: [5, 5, 5], comment: "mantap", status: "resolved" }),
    mk({ storeName: "POOL SINGKAWANG", ratings: [2, 2, 2], comment: "kebersihan kurang", receiptNo: "TIKET-9", status: "new" }),
  ];

  it("ringkas: tertinggi, terendah, rata-rata + 1 baris per store", () => {
    const out = renderSummary(reviews);
    const lines = out.trim().split("\n").filter(Boolean);
    expect(out).toContain("2 review");
    expect(out).toContain("Tertinggi: 5.00/5 — PONTIANAK");
    expect(out).toContain("Terendah: 2.00/5 — POOL SINGKAWANG, TIKET-9");
    expect(out).toContain("Rata-rata: 3.50/5 · Belum di-resolve: 1");
    expect(out).toContain("PONTIANAK — 1 review, rata-rata 5.00/5");
    expect(out).toContain("POOL SINGKAWANG — 1 review, rata-rata 2.00/5");
    // sederhananya: komentar & dimensi tidak ikut nempel lagi
    expect(out).not.toContain("mantap");
    expect(out).not.toContain("Pemasangan");
    expect(lines.length).toBeLessThanOrEqual(6);
  });

  it("seri tertinggi -> review terbaru yang disebut (input newest-first)", () => {
    const older = mk({ storeName: "A", ratings: [5, 5, 5], receiptNo: "LAMA", createdAt: new Date("2026-09-08T10:00:00+07:00") });
    const newer = mk({ storeName: "B", ratings: [5, 5, 5], receiptNo: "BARU", createdAt: new Date("2026-09-10T10:00:00+07:00") });
    expect(renderSummary([newer, older])).toContain("Tertinggi: 5.00/5 — B, BARU");
  });

  it("melempar kalau tidak ada review", () => {
    expect(() => renderSummary([])).toThrow();
  });
});

describe("formatReviewDate", () => {
  it("memakai zona WIB, bukan UTC", () => {
    // 2026-09-10T18:00:00Z = 11 Sep 01:00 WIB -> harus tampil 11, bukan 10
    expect(formatReviewDate(new Date("2026-09-10T18:00:00Z"))).toContain("11");
  });
});
