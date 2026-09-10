import { describe, expect, it } from "vitest";
import { hiddenStatusesFor } from "./db";

/** V2 privilege rule: hanya super_admin yang boleh melihat `archived` + `reviewed`. */
describe("hiddenStatusesFor", () => {
  it("super_admin melihat semua status", () => {
    expect([...hiddenStatusesFor({ role: "super_admin", branchId: null })]).toEqual([]);
  });

  it("admin tidak melihat archived", () => {
    const hidden = hiddenStatusesFor({ role: "admin", branchId: null });
    expect(hidden.has("archived")).toBe(true);
    expect(hidden.has("new")).toBe(false);
    expect(hidden.has("open")).toBe(false);
    expect(hidden.has("resolved")).toBe(false);
  });

  it("branch_admin, viewer, dan user anonim tetap kena hide", () => {
    for (const user of [
      { role: "branch_admin" as const, branchId: 7 },
      { role: "viewer" as const, branchId: null },
      { role: "user" as const, branchId: null },
      null,
      undefined,
    ]) {
      expect(hiddenStatusesFor(user).has("archived")).toBe(true);
    }
  });
});
