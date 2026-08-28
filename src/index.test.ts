import { describe, expect, it } from "vitest";

import { computeLayout } from "./index.js";

describe("computeLayout", () => {
  it("is exported and not yet implemented", () => {
    expect(() =>
      computeLayout([], { width: 1920, height: 1080 }),
    ).toThrowError("not implemented");
  });
});
