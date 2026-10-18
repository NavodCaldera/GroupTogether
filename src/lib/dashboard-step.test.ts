import { describe, expect, it } from "vitest";
import { type NextStepInput, journeyStep, nextStep } from "./cart-rules";

const base: NextStepInput = {
  status: "OPEN",
  mine: true,
  code: "ABC123",
  total: "38000",
  minOrderValue: "50000",
  share: "12000",
  ownerName: "Nimali",
};

describe("nextStep", () => {
  it("sends an open cart to the cart page, with what's left and the share option", () => {
    const s = nextStep(base);
    expect(s.text).toBeUndefined(); // the progress bar shows what is left
    expect(s.action).toEqual({ label: "View cart", href: "/c/ABC123" });
    expect(s).toMatchObject({ deadline: "expires", share: true });
  });

  it("gives the owner accept, and a member just a link to the cart, when ready", () => {
    expect(nextStep({ ...base, status: "READY" }).action?.label).toBe("Accept & pay");
    const member = nextStep({ ...base, status: "READY", mine: false });
    expect(member.text).toBeUndefined();
    expect(member.action?.label).toBe("View cart");
  });

  it("sends the owner to upload the slip, mentioning a rejected one", () => {
    const s = nextStep({
      ...base,
      status: "AWAITING_SLIP",
      total: "66600",
      rejectedNote: "Blurry",
    });
    expect(s.text).toMatch(/Pay LKR\s?66,600/);
    expect(s.text).toMatch(/Blurry/);
    expect(s).toMatchObject({ deadline: "slip", action: { href: "/c/ABC123/pay" } });
  });

  it("reminds members to settle their share with the owner", () => {
    const s = nextStep({ ...base, status: "AWAITING_SLIP", mine: false });
    expect(s.note).toMatch(/Settle your LKR\s?12,000 with Nimali/);
    expect(nextStep({ ...base, status: "SLIP_REVIEW", mine: true }).note).toBeUndefined();
  });

  it("offers tracking only when there is a link", () => {
    expect(nextStep({ ...base, status: "DISPATCHED" }).action).toBeUndefined();
    expect(nextStep({ ...base, status: "DISPATCHED" }).received).toBe(true);
    expect(nextStep({ ...base, status: "DISPATCHED", mine: false }).received).toBeUndefined();
    expect(
      nextStep({ ...base, status: "DISPATCHED", trackingUrl: "https://t.example" }).action,
    ).toMatchObject({ label: "Track delivery", external: true });
  });
});

describe("journeyStep", () => {
  it("maps statuses onto Open, Ready, Paid, Delivered", () => {
    expect(
      ["OPEN", "READY", "AWAITING_SLIP", "CONFIRMED", "DELIVERED"].map((s) =>
        journeyStep(s as "OPEN"),
      ),
    ).toEqual([0, 1, 1, 2, 3]);
    expect(journeyStep("EXPIRED")).toBe(-1);
  });
});
