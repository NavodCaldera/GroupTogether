import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createSeller, homeFor } from "@/server/auth/service";
import { db } from "@/server/db";
import { resetDb } from "./helpers";

let n = 0;
beforeEach(async () => {
  await resetDb();
});
afterAll(() => db.$disconnect());

async function seller() {
  n++;
  return createSeller({
    name: "Nuwan",
    company: `Mill ${n}`,
    email: `seller${n}-${Date.now()}@test.lk`,
    phone: `076${String(1000000 + n).slice(-7)}`,
    password: "password123",
  });
}

describe("factory seller accounts", () => {
  it("land on the seller workspace", async () => {
    const s = await seller();
    expect(homeFor(s.role)).toBe("/seller");
  });

  it("refuses a second account with the same email", async () => {
    const s = await seller();
    await expect(
      createSeller({
        name: "Another person",
        company: "Y Mills",
        email: s.email,
        phone: "0769999999",
        password: "password123",
      }),
    ).rejects.toThrow("already exists");
  });
});
