import { describe, expect, it } from "vitest";
import { formatLKR } from "./format";

const plain = (s: string) => s.replace(/ /g, " ");

describe("formatLKR", () => {
  it("shows whole rupees without cents", () => {
    expect(plain(formatLKR("1600"))).toBe("LKR 1,600");
  });

  it("always shows two decimals when there are cents", () => {
    expect(plain(formatLKR("109.2"))).toBe("LKR 109.20");
    expect(plain(formatLKR("3309.20"))).toBe("LKR 3,309.20");
    expect(plain(formatLKR("34.13"))).toBe("LKR 34.13");
  });
});
