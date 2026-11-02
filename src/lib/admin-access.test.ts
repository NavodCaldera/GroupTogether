import { describe, expect, it } from "vitest";
import { ADMIN_AREAS, adminAreaOf, adminHome, canAdminArea, userAdminArea } from "./admin-access";
describe("admin operational boundaries", () => {
  it("denies missing, locked, unscoped and non-admin principals", () => {
    expect(canAdminArea(null, "PREMIUM")).toBe(false);
    expect(canAdminArea({ role: "SELLER", adminArea: "PREMIUM" }, "PREMIUM")).toBe(false);
    expect(canAdminArea({ role: "ADMIN", adminArea: "FACTORY", locked: true }, "FACTORY")).toBe(
      false,
    );
    expect(canAdminArea({ role: "ADMIN" }, "FACTORY")).toBe(false);
    expect(adminAreaOf({ role: "ADMIN", adminArea: "ALL" })).toBeNull();
    for (const area of ADMIN_AREAS)
      expect(canAdminArea({ role: "ADMIN", adminArea: "ALL" }, area)).toBe(false);
  });
  it("isolates all three workspaces", () => {
    for (const area of ADMIN_AREAS) {
      const user = { role: "ADMIN", adminArea: area };
      expect(adminAreaOf(user)).toBe(area);
      for (const other of ADMIN_AREAS) expect(canAdminArea(user, other)).toBe(area === other);
      expect(adminHome(area)).not.toBe("/admin");
    }
    expect(adminHome(null)).toBe("/");
  });
  it("assigns every account to the area that manages it", () => {
    expect(userAdminArea({ role: "SELLER", isBrand: true })).toBe("PREMIUM");
    expect(userAdminArea({ role: "SELLER", isBrand: false })).toBe("FACTORY");
    expect(userAdminArea({ role: "CUSTOMER" })).toBe("WAREHOUSE");
    expect(userAdminArea({ role: "PACKER" })).toBe("WAREHOUSE");
    expect(userAdminArea({ role: "ADMIN", adminArea: "FACTORY" })).toBe("FACTORY");
  });
});
