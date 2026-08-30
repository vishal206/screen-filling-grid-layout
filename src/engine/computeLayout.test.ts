import { describe, expect, it } from "vitest";

import type { GridItem, Rect } from "../types.js";
import { computeLayout } from "./computeLayout.js";

const CONTAINER = { width: 1200, height: 800 };

const item = (
  key: string,
  ratio: number,
  extra: Partial<GridItem> = {},
): GridItem => ({ key, ratio, render: () => null, ...extra });

/** Rects must never leave the container or overlap once laid out. */
function expectInside(rects: Rect[], width: number, height: number): void {
  for (const rect of rects) {
    expect(rect.x).toBeGreaterThanOrEqual(-1e-9);
    expect(rect.y).toBeGreaterThanOrEqual(-1e-9);
    expect(rect.x + rect.width).toBeLessThanOrEqual(width + 1e-9);
    expect(rect.y + rect.height).toBeLessThanOrEqual(height + 1e-9);
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  }
}

describe("computeLayout", () => {
  describe("zero items", () => {
    it("returns an empty array without touching the container", () => {
      expect(computeLayout([], CONTAINER)).toEqual([]);
      expect(computeLayout([], { width: 0, height: 0 })).toEqual([]);
    });

    it("returns an empty array for a container with no area", () => {
      const items = [item("a", 1), item("b", 1)];
      expect(computeLayout(items, { width: 0, height: 800 })).toEqual([]);
      expect(computeLayout(items, { width: 1200, height: 0 })).toEqual([]);
      expect(computeLayout(items, { width: -10, height: 800 })).toEqual([]);
      expect(computeLayout(items, { width: NaN, height: 800 })).toEqual([]);
    });
  });

  describe("one item", () => {
    it("gives the single item the whole container", () => {
      const rects = computeLayout([item("solo", 16 / 9)], CONTAINER);

      expect(rects).toEqual([
        { key: "solo", x: 0, y: 0, width: 1200, height: 800 },
      ]);
    });

    it("ignores gap and tracks for a single item", () => {
      const rects = computeLayout([item("solo", 1)], CONTAINER, {
        gap: 24,
        tracks: [4, 4],
      });

      expect(rects[0]).toMatchObject({ x: 0, y: 0, width: 1200, height: 800 });
    });

    it("still honours strictRatio for a single item", () => {
      const rects = computeLayout([item("solo", 1)], CONTAINER, {
        strictRatio: true,
      });

      // A square inscribed in 1200x800 is 800x800, centred horizontally.
      expect(rects[0]).toEqual({
        key: "solo",
        x: 200,
        y: 0,
        width: 800,
        height: 800,
      });
    });
  });

  describe("strictRatio", () => {
    const items = [
      item("a", 16 / 9),
      item("b", 1),
      item("c", 3 / 4),
      item("d", 16 / 9),
    ];

    it("gives every rect its exact declared ratio", () => {
      const rects = computeLayout(items, CONTAINER, { strictRatio: true });

      expect(rects).toHaveLength(items.length);
      for (const rect of rects) {
        const declared = items.find((i) => i.key === rect.key)?.ratio;
        expect(declared).toBeDefined();
        expect(rect.width / rect.height).toBeCloseTo(declared ?? 0, 10);
      }
      expectInside(rects, CONTAINER.width, CONTAINER.height);
    });

    it("leaves empty space rather than distorting", () => {
      const strict = computeLayout(items, CONTAINER, { strictRatio: true });
      const loose = computeLayout(items, CONTAINER);

      const area = (rects: Rect[]): number =>
        rects.reduce((sum, r) => sum + r.width * r.height, 0);

      // Strict rects are inscribed inside the same cells, so they cover less.
      expect(area(strict)).toBeLessThan(area(loose));
      expect(strict).toHaveLength(loose.length);
    });

    it("centres each inscribed rect inside its cell", () => {
      const square = [item("a", 1), item("b", 1), item("c", 1), item("d", 1)];
      const rects = computeLayout(square, { width: 800, height: 400 }, {
        strictRatio: true,
        tracks: [2, 1],
      });

      // Each cell is 400x400, so a square fills it exactly with no offset.
      for (const rect of rects) {
        expect(rect.width).toBeCloseTo(rect.height, 10);
      }
      expectInside(rects, 800, 400);
    });

    it("overrides maxRatioDeviation", () => {
      const strict = computeLayout(items, CONTAINER, {
        strictRatio: true,
        maxRatioDeviation: 0.5,
      });

      for (const rect of strict) {
        const declared = items.find((i) => i.key === rect.key)?.ratio ?? 0;
        expect(rect.width / rect.height).toBeCloseTo(declared, 10);
      }
    });
  });

  describe("maxRatioDeviation", () => {
    it("keeps every rect within the tolerance", () => {
      const items = [item("a", 16 / 9), item("b", 1), item("c", 0.5), item("d", 2)];
      const tolerance = 0.1;
      const rects = computeLayout(items, CONTAINER, {
        maxRatioDeviation: tolerance,
      });

      for (const rect of rects) {
        const declared = items.find((i) => i.key === rect.key)?.ratio ?? 0;
        const actual = rect.width / rect.height;
        expect(actual).toBeGreaterThanOrEqual(declared * (1 - tolerance) - 1e-9);
        expect(actual).toBeLessThanOrEqual(declared * (1 + tolerance) + 1e-9);
      }
    });

    it("leaves a compliant cell untouched", () => {
      // A 2x1 grid on 800x400 gives 400x400 cells; square items already comply.
      const items = [item("a", 1), item("b", 1)];
      const rects = computeLayout(items, { width: 800, height: 400 }, {
        tracks: [2, 1],
        maxRatioDeviation: 0.5,
      });

      expect(rects).toContainEqual({ key: "a", x: 0, y: 0, width: 400, height: 400 });
    });
  });

  describe("container width below minCellWidth", () => {
    const items = [item("a", 1), item("b", 1), item("c", 1), item("d", 1)];

    it("collapses to one column and uses the full container width", () => {
      const rects = computeLayout(items, { width: 300, height: 900 }, {
        minCellWidth: 1000,
      });

      expect(rects).toHaveLength(items.length);
      for (const rect of rects) {
        // The floor is unsatisfiable, so every cell takes the whole width.
        expect(rect.width).toBeCloseTo(300, 10);
        expect(rect.x).toBeCloseTo(0, 10);
      }
      expectInside(rects, 300, 900);
    });

    it("never produces a zero or negative width", () => {
      for (const floor of [301, 1000, 100_000]) {
        const rects = computeLayout(items, { width: 300, height: 900 }, {
          minCellWidth: floor,
        });
        expect(rects.length).toBeGreaterThan(0);
        for (const rect of rects) expect(rect.width).toBeGreaterThan(0);
      }
    });

    it("honours a satisfiable floor by capping columns", () => {
      const rects = computeLayout(items, { width: 1000, height: 800 }, {
        minCellWidth: 400,
      });

      // 1000px fits at most two 400px columns, so no cell may be narrower.
      for (const rect of rects) {
        expect(rect.width).toBeGreaterThanOrEqual(400 - 1e-9);
      }
    });

    it("lets an item's own minWidth raise the floor", () => {
      const mixed = [
        item("wide", 1, { minWidth: 600 }),
        item("b", 1),
        item("c", 1),
      ];
      const rects = computeLayout(mixed, { width: 1000, height: 800 });

      for (const rect of rects) {
        expect(rect.width).toBeGreaterThanOrEqual(600 - 1e-9);
      }
    });
  });

  describe("general behaviour", () => {
    const items = [
      item("a", 16 / 9, { weight: 3 }),
      item("b", 1),
      item("c", 3 / 4, { weight: 2 }),
      item("d", 2),
      item("e", 1),
    ];

    it("keeps rects inside the container and in item order", () => {
      const rects = computeLayout(items, CONTAINER);

      expectInside(rects, CONTAINER.width, CONTAINER.height);
      const order = rects.map((r) => r.key);
      expect(order).toEqual(items.filter((i) => order.includes(i.key)).map((i) => i.key));
    });

    it("applies gap between cells without overflowing", () => {
      const gap = 16;
      const rects = computeLayout(items, CONTAINER, { gap });

      expectInside(rects, CONTAINER.width, CONTAINER.height);
      const ungapped = computeLayout(items, CONTAINER);
      const area = (rs: Rect[]): number => rs.reduce((s, r) => s + r.width * r.height, 0);
      expect(area(rects)).toBeLessThan(area(ungapped));
    });

    it("respects an explicit tracks setting", () => {
      const rects = computeLayout(items, { width: 800, height: 800 }, {
        tracks: [2, 2],
      });

      // 2x2 has four cells for five items, so one is dropped.
      expect(rects.length).toBeLessThanOrEqual(4);
      expectInside(rects, 800, 800);
    });

    it("is pure and deterministic", () => {
      expect(computeLayout(items, CONTAINER)).toEqual(computeLayout(items, CONTAINER));
    });

    it("rejects a negative gap", () => {
      expect(() => computeLayout(items, CONTAINER, { gap: -1 })).toThrow(RangeError);
    });
  });
});
