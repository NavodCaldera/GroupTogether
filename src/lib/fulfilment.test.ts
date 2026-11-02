import { describe, expect, it } from "vitest";
import { factoryConflict } from "./fulfilment";

describe("factoryConflict", () => {
  it("lets a cart take items from its one factory", () => {
    expect(factoryConflict([], "f1")).toBeNull();
    expect(factoryConflict(["f1", "f1"], "f1")).toBeNull();
    expect(factoryConflict([null], null)).toBeNull();
  });
  it("blocks a second factory or mixing with our own listings", () => {
    expect(factoryConflict(["f1"], "f2")).toMatch(/another factory/);
    expect(factoryConflict([null], "f1")).toMatch(/another factory/);
    expect(factoryConflict(["f1"], null)).toMatch(/another factory/);
  });
});
