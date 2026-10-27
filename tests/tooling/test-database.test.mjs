import assert from "node:assert/strict";
import { test } from "node:test";
import { assertTestDatabase } from "../../scripts/test-database.mjs";

test("accepts the isolated local test database and disposable CI port", () => {
  for (const port of [5547, 5432]) {
    const url = `postgresql://runner@localhost:${port}/groupbasket_test`;
    assert.equal(assertTestDatabase(url, "postgres://postgres@localhost:5546/groupbasket"), url);
  }
});

test("rejects development, remote, missing and invalid targets without exposing credentials", () => {
  for (const url of [
    undefined,
    "invalid-secret",
    "mysql://reader@localhost/groupbasket_test",
    "postgres://reader:secret@localhost:5546/groupbasket",
    "postgres://reader@remote.example/groupbasket_test",
  ]) {
    assert.throws(
      () => assertTestDatabase(url),
      (error) => !error.message.includes("secret"),
    );
  }
});

test("cannot bypass isolation with credentials, URL spelling, options or loopback aliases", () => {
  assert.throws(() =>
    assertTestDatabase(
      "postgresql://test:one@127.0.0.1:5432/groupbasket_test?application_name=test",
      "postgres://dev:two@localhost/groupbasket_test",
    ),
  );
  for (const override of [
    "host=remote.example",
    "port=5546",
    "database=groupbasket",
    "options=anything",
    "schema=private",
  ])
    assert.throws(() =>
      assertTestDatabase(`postgres://reader@localhost:5547/groupbasket_test?${override}`),
    );
});
