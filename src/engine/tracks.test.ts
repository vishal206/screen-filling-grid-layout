import { describe, expect, it } from "vitest";

import { idealDimensions } from "./dimensions.js";
import { assignTracks } from "./tracks.js";

const CONTAINER = { width: 1200, height: 800 };

/** Ideal boxes for `weights`, all sharing one ratio — the real upstream call. */
function idealsFor(weights: number[], ratio: number) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  return weights.map((weight) =>
    idealDimensions(weight, total, CONTAINER.width, CONTAINER.height, ratio),
  );
}

function area(spans: { cols: number; rows: number }[]): number {
  return spans.reduce((sum, s) => sum + s.cols * s.rows, 0);
}

describe("assignTracks", () => {
  it("gives equal weights equal spans that tile the grid exactly", () => {
    const { spans, residual } = assignTracks(
      idealsFor([1, 1, 1, 1], CONTAINER.width / CONTAINER.height),
      CONTAINER,
      { cols: 2, rows: 2 },
    );

    expect(spans).toEqual([
      { cols: 1, rows: 1 },
      { cols: 1, rows: 1 },
      { cols: 1, rows: 1 },
      { cols: 1, rows: 1 },
    ]);
    expect(residual).toBe(0);
  });

  it("gives a dominant weight a larger span than its siblings", () => {
    const { spans } = assignTracks(
      idealsFor([9, 1, 1, 1], CONTAINER.width / CONTAINER.height),
      CONTAINER,
      { cols: 4, rows: 4 },
    );

    const [hero, ...rest] = spans;
    expect(hero).toBeDefined();
    if (hero === undefined) return;

    for (const span of rest) {
      expect(hero.cols * hero.rows).toBeGreaterThan(span.cols * span.rows);
    }
  });

  it("keeps every span inside the grid and at least one track", () => {
    const grid = { cols: 5, rows: 3 };
    const { spans } = assignTracks(
      idealsFor([50, 3, 2, 1, 1, 1], 16 / 9),
      CONTAINER,
      grid,
    );

    for (const span of spans) {
      expect(span.cols).toBeGreaterThanOrEqual(1);
      expect(span.rows).toBeGreaterThanOrEqual(1);
      expect(span.cols).toBeLessThanOrEqual(grid.cols);
      expect(span.rows).toBeLessThanOrEqual(grid.rows);
      expect(Number.isInteger(span.cols)).toBe(true);
      expect(Number.isInteger(span.rows)).toBe(true);
    }
  });

  it("reports residual consistently with the spans it returned", () => {
    const grid = { cols: 4, rows: 3 };
    const { spans, residual } = assignTracks(
      idealsFor([5, 3, 2, 1, 1], 4 / 3),
      CONTAINER,
      grid,
    );

    expect(residual).toBe(grid.cols * grid.rows - area(spans));
  });

  it("balances rounding error rather than leaving it in the residual", () => {
    const grid = { cols: 4, rows: 4 };
    const ideals = idealsFor([3, 1, 1, 1], CONTAINER.width / CONTAINER.height);

    const { residual } = assignTracks(ideals, CONTAINER, grid);

    // The balancing pass should close the gap entirely for this case.
    expect(residual).toBe(0);
  });

  it("reports overcommitment when there are more items than cells", () => {
    const grid = { cols: 2, rows: 2 };
    const { spans, residual } = assignTracks(
      idealsFor([1, 1, 1, 1, 1, 1], 1),
      CONTAINER,
      grid,
    );

    // Every item still gets a whole track, so the grid is oversubscribed.
    expect(spans).toHaveLength(6);
    expect(residual).toBe(grid.cols * grid.rows - 6);
    expect(residual).toBeLessThan(0);
  });

  it("is deterministic across identical calls", () => {
    const ideals = idealsFor([7, 5, 3, 2, 1], 16 / 9);
    const grid = { cols: 6, rows: 4 };

    expect(assignTracks(ideals, CONTAINER, grid)).toEqual(
      assignTracks(ideals, CONTAINER, grid),
    );
  });

  it("returns the whole grid as residual for no items", () => {
    expect(assignTracks([], CONTAINER, { cols: 3, rows: 2 })).toEqual({
      spans: [],
      residual: 6,
    });
  });

  it("rejects an invalid grid or container", () => {
    const ideals = idealsFor([1, 1], 1);
    expect(() => assignTracks(ideals, CONTAINER, { cols: 0, rows: 2 })).toThrow(RangeError);
    expect(() => assignTracks(ideals, CONTAINER, { cols: 2.5, rows: 2 })).toThrow(RangeError);
    expect(() => assignTracks(ideals, CONTAINER, { cols: 2, rows: -1 })).toThrow(RangeError);
    expect(() => assignTracks(ideals, { width: NaN, height: 800 }, { cols: 2, rows: 2 })).toThrow(RangeError);
    expect(() => assignTracks(ideals, { width: 1200, height: -1 }, { cols: 2, rows: 2 })).toThrow(RangeError);
  });
});
