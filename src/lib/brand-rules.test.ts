import { describe, expect, it } from "vitest";
import { brandOfferTotal, discountPct, linkOnSite, siteName } from "./brand-rules";

describe("luxury brand offers", () => {
  it("works out the discount off the actual price", () => {
    expect(discountPct("18500", "9800")).toBe(47);
    expect(discountPct("1000", "999.99")).toBe(0);
    expect(discountPct("1000", "1000")).toBeNull();
    expect(discountPct("1000", "1200")).toBeNull();
    expect(discountPct("0", "0")).toBeNull();
  });

  it("totals the discount price over the pieces", () => {
    expect(brandOfferTotal("9800", 40).toString()).toBe("392000");
    expect(brandOfferTotal("1234.50", 3).toString()).toBe("3703.5");
  });

  it("accepts only secure links on the brand's own website", () => {
    const site = "https://www.serendib-atelier.example";
    expect(linkOnSite("https://serendib-atelier.example/p/kaftan", site)).toBe(true);
    expect(linkOnSite("https://www.serendib-atelier.example/p/kaftan", site)).toBe(true);
    expect(linkOnSite("https://shop.serendib-atelier.example/kaftan", site)).toBe(true);
    expect(linkOnSite("http://serendib-atelier.example/p/kaftan", site)).toBe(false);
    expect(linkOnSite("https://serendib-atelier.example.evil.lk/p", site)).toBe(false);
    expect(linkOnSite("https://notserendib-atelier.example/p", site)).toBe(false);
    expect(linkOnSite("not a link", site)).toBe(false);
    expect(linkOnSite("https://anything.lk/p", null)).toBe(true);
  });

  it("names the site for a link", () => {
    expect(siteName("https://www.serendib-atelier.example/p/kaftan")).toBe(
      "serendib-atelier.example",
    );
  });
});
