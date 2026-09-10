import { describe, expect, it } from "vitest";
import { resolveStoreFromTicket, storeLabel } from "./store";

describe("resolveStoreFromTicket", () => {
  it("parses No Receipt format U{code}.{unit}.{date}.{seq}", () => {
    expect(resolveStoreFromTicket("U5A.3.20260909.1")).toEqual({ code: "5A", name: "HCIR SELMA SINGKAWANG G M" });
    expect(resolveStoreFromTicket("UD7.3.20260909.1")).toEqual({ code: "D7", name: "HCIR INFORMA PONTIANAK" });
    expect(resolveStoreFromTicket("U00.3.20260901")).toEqual({ code: "00", name: "Head Office Home Center Indonesia" });
  });

  it("parses No DO format {code}.{serial}", () => {
    expect(resolveStoreFromTicket("5A.XA.000172")).toEqual({ code: "5A", name: "HCIR SELMA SINGKAWANG G M" });
  });

  it("parses supported receipt prefixes before the store code", () => {
    expect(resolveStoreFromTicket("MC.5A.20260901.3")).toEqual({ code: "5A", name: "HCIR SELMA SINGKAWANG G M" });
    expect(resolveStoreFromTicket("MD.D7.20260901.3")).toEqual({ code: "D7", name: "HCIR INFORMA PONTIANAK" });
    expect(resolveStoreFromTicket("MO.00.20260901.3")).toEqual({ code: "00", name: "Head Office Home Center Indonesia" });
    expect(resolveStoreFromTicket("MB.5A.20260901.3")).toEqual({ code: "5A", name: "HCIR SELMA SINGKAWANG G M" });
    expect(resolveStoreFromTicket("MS.5A.20260901.3")).toEqual({ code: "5A", name: "HCIR SELMA SINGKAWANG G M" });
  });

  it("handles empty / null input", () => {
    expect(resolveStoreFromTicket(null)).toEqual({ code: null, name: null });
    expect(resolveStoreFromTicket("")).toEqual({ code: null, name: null });
    expect(resolveStoreFromTicket(undefined)).toEqual({ code: null, name: null });
  });

  it("lowercase code resolves (case-insensitive)", () => {
    expect(resolveStoreFromTicket("u5a.3.20260909.1")).toEqual({ code: "5A", name: expect.any(String) });
  });

  it("unknown code shows Unknown label", () => {
    expect(storeLabel("U9Z.3.20260909.1")).toBe("Unknown");
  });
});
