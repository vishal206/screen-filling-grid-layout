import { describe, expect, it } from "vitest";

import { computeLayout, type GridItem } from "./index.js";

describe("public API", () => {
  const items: GridItem[] = [
    { key: "a", ratio: 16 / 9, weight: 2, render: () => null },
    { key: "b", ratio: 1, render: () => null },
    { key: "c", ratio: 3 / 4, render: () => null },
  ];

  it("lays items out inside the container through the package entry point", () => {
    const rects = computeLayout(items, { width: 1920, height: 1080 });

    expect(rects).toHaveLength(items.length);
    expect(rects.map((r) => r.key)).toEqual(["a", "b", "c"]);

    for (const rect of rects) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(1920 + 1e-9);
      expect(rect.y + rect.height).toBeLessThanOrEqual(1080 + 1e-9);
    }
  });

  it("accepts the layout-affecting options from GridProps", () => {
    const rects = computeLayout(items, { width: 1920, height: 1080 }, {
      gap: 8,
      strictRatio: true,
      minCellWidth: 200,
    });

    for (const rect of rects) {
      const declared = items.find((i) => i.key === rect.key)?.ratio ?? 0;
      expect(rect.width / rect.height).toBeCloseTo(declared, 10);
    }
  });
});
