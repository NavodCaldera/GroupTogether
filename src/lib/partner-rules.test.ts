import { describe, expect, it } from "vitest";
import { bankNameMatches, missingItems } from "./partner-rules";
const input = {
  businessName: "Lanka Shirts",
  brNumber: "BR123",
  ownerName: "Kamal Perera",
  ownerNic: "901234567V",
  phone: "0771234567",
  email: "kamal@example.lk",
  address: "1 Factory Road",
  city: "Colombo",
  bankName: "BOC",
  bankBranch: "Colombo",
  accountName: "Kamal Perera",
  accountNumber: "123",
};
describe("partner rules", () => {
  it("matches exact normalized business or owner names", () => {
    expect(
      bankNameMatches("LANKA SHIRTS (PVT) LTD", "Lanka Shirts (Pvt) Ltd", "Kamal Perera"),
    ).toBe(true);
    expect(bankNameMatches("K. Perera", "Lanka Shirts", "Kamal Perera")).toBe(false);
    expect(bankNameMatches(" kamal-perera ", "Lanka Shirts", "Kamal Perera")).toBe(true);
    expect(bankNameMatches("...", "", "")).toBe(false);
    // Sinhala vowel marks are part of the name, not punctuation.
    expect(bankNameMatches("\u0d9a\u0db8\u0dbd\u0dcf", "\u0d9a\u0db8\u0dbd", "Other")).toBe(false);
  });
  it("names every missing document and required field", () => {
    expect(missingItems(input, [])).toEqual(["BR certificate", "NIC photo", "Factory photo"]);
    expect(
      missingItems({ ...input, brNumber: " " }, ["BR_CERT", "NIC_PHOTO", "FACTORY_PHOTO"]),
    ).toContain("BR number");
    expect(missingItems(input, ["BR_CERT", "NIC_PHOTO", "FACTORY_PHOTO"])).toEqual([]);
  });
});
