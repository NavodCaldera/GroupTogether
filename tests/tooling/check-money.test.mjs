import assert from "node:assert/strict";
import { test } from "node:test";
import ts from "typescript";
import { checkSchemaMoney, checkSourceMoney } from "../../scripts/check-money.mjs";

test("schema guard rejects missing or incorrect precision while allowing coordinates", () => {
  assert.equal(checkSchemaMoney("amount Decimal @db.Decimal(14, 2)\nlat Float?").length, 0);
  assert.equal(checkSchemaMoney("agentFeeRate Decimal @default(0.05) @db.Decimal(6, 4)").length, 0);
  assert.equal(checkSchemaMoney("otherRate Decimal @db.Decimal(6, 4)").length, 1);
  assert.equal(checkSchemaMoney("amount Decimal?\nprice Decimal @db.Decimal(10, 2)").length, 2);
});

test("type-aware guard catches arithmetic and numeric conversions but permits Decimal methods", () => {
  const name = "/money-fixture.ts";
  const source = ts.createSourceFile(
    name,
    `declare const amount: { toDecimalPlaces(): unknown; toFixed(): string; plus(n: number): unknown; times(n: number): unknown };
     amount * 2; Number(amount); parseFloat(amount.toFixed()); amount.times(2); const count = Number('2');`,
    ts.ScriptTarget.Latest,
    true,
  );
  const host = ts.createCompilerHost({ noLib: true });
  host.getSourceFile = (file) => (file === name ? source : undefined);
  const program = ts.createProgram([name], { noLib: true }, host);
  assert.equal(checkSourceMoney(program, [source]).length, 3);
});
