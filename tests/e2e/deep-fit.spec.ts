import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { assertTestDatabase } from "../../scripts/test-database.mjs";
import { DEMO_BUYERS, DEMO_PASSWORD } from "../../src/lib/demo-accounts";
import { skinnedGlb } from "./fixtures/glb.mjs";
import { seedBrowserFixtures } from "./seed-fixtures";

// Deep Fit Test (DEC-021): Dilan, with a confirmed own body, asks for the tee to be simulated on
// it; a fake simulator stands in for Blender. Reduced motion: the software-drawn test browser
// animates a body too slowly (see fit.spec.ts).
test.use({ viewport: { width: 360, height: 740 }, contextOptions: { reducedMotion: "reduce" } });
test.describe.configure({ mode: "serial" });

const STORAGE = ".data/test-uploads";
const url = () => assertTestDatabase(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL);
let tee = "";

test.beforeAll(async () => {
  seedBrowserFixtures();
  const db = new Pool({ connectionString: url() });
  try {
    tee = (
      await db.query(
        `SELECT id FROM "Product" WHERE title = 'Crew-neck cotton tee (3-pack)' LIMIT 1`,
      )
    ).rows[0].id;
    const userId = (await db.query(`SELECT id FROM "User" WHERE email = $1`, [DEMO_BUYERS.dilan]))
      .rows[0].id as string;
    // A confirmed body with a skeleton: chest, waist and hip parts on the trunk.
    const key = `bodies/${userId}/e2e-body.glb`;
    mkdirSync(join(STORAGE, "bodies", userId), { recursive: true });
    writeFileSync(
      join(STORAGE, key),
      skinnedGlb({
        attribute: "_BODY_PART",
        bottom: 0,
        top: 1.7,
        radius: 0.15,
        value: (y: number) => (y > 1.55 ? 8 : y > 1.25 ? 0 : y > 1.05 ? 1 : y > 0.9 ? 2 : 7),
      }),
    );
    await db.query(
      `UPDATE "BodyProfile" SET "bodyStatus" = 'CONFIRMED', "bodyFileKey" = $2,
         "bodyFit" = '{"bodyVersion": 2}', "bodyFitAt" = now() WHERE "userId" = $1`,
      [userId, key],
    );
  } finally {
    await db.end();
  }
});

async function signIn(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

/** One queued test through the sim worker, with a fake simulator in place of Blender. */
function runSimWorker() {
  execFileSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "scripts/sim-worker.ts", "--once"],
    {
      env: {
        ...process.env,
        DATABASE_URL: url(),
        STORAGE_DIR: STORAGE,
        SIM_PYTHON: process.execPath,
        SIM_SCRIPT: "tests/e2e/fixtures/fake-sim.mjs",
        BLENDER_BIN: "x",
      },
      stdio: "pipe",
      timeout: 60_000,
    },
  );
}

test("a buyer runs a Deep Fit Test and sees the garment simulated on their body", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const garments: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname === "/api/fit-garment") garments.push(u.searchParams.get("size") ?? "");
  });
  await signIn(page, DEMO_BUYERS.dilan);
  await page.goto(`/products/${tee}`);
  const fit = page.getByRole("region", { name: "Fit" });
  await fit.scrollIntoViewIfNeeded();
  await expect(fit.getByText("Simulated on your body")).toBeHidden();
  await fit.getByRole("button", { name: "Deep Fit Test" }).click();
  await expect(fit.getByText("Testing…")).toBeVisible();
  await expect(fit.getByRole("button", { name: "Deep Fit Test" })).toBeHidden();

  runSimWorker();
  await page.reload();
  // The section is taller than the screen: scroll to the viewer, which loads when in view.
  await fit.getByRole("group", { name: "Motion" }).scrollIntoViewIfNeeded();
  await expect(fit.getByText("Simulated on your body")).toBeVisible();
  await expect(fit.getByText("Testing…")).toBeHidden();
  await expect(fit.locator("canvas")).toBeVisible({ timeout: 30_000 });

  const recommended = (await page.getByTestId("fit-recommended").innerText()).trim();
  await expect.poll(() => garments).toContain(recommended);
  const other = ["S", "M", "L", "XL"].find((s) => s !== recommended)!;
  await fit.getByRole("button", { name: other, exact: true }).click();
  await expect.poll(() => garments).toContain(other);
  await fit.getByRole("button", { name: "Sit" }).click();
  await expect(fit.locator("canvas")).toBeVisible();
  expect(errors).toEqual([]);
});
