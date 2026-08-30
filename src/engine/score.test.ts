import { describe, expect, it } from "vitest";

import type { Placement } from "./pack.js";
import { score, type Layout } from "./score.js";

const CONTAINER = { width: 1200, height: 800 };

const place = (index: number, cols: number, rows: number): Placement => ({
  index,
  col: 0,
  row: 0,
  cols,
  rows,
  shrunk: false,
  grown: false,
});

const layoutOf = (placements: Placement[], cols: number, rows: number): Layout => ({
  placements,
  grid: { cols, rows },
  container: CONTAINER,
});

describe("score", () => {
  it("is zero when every cell matches its declared ratio", () => {
    // 4x4 grid on 1200x800: each track is 300x200, so a 1x1 cell is 3:2.
    const layout = layoutOf([place(0, 1, 1), place(1, 2, 2)], 4, 4);
    const items = [{ ratio: 3 / 2 }, { ratio: 3 / 2 }];

    expect(score(layout, items)).toBe(0);
  });

  it("penalises stretching and squashing by the same amount", () => {
    const layout = layoutOf([place(0, 1, 1)], 4, 4);
    const cellRatio = 3 / 2;

    const stretched = score(layout, [{ ratio: cellRatio / 2 }]);
    const squashed = score(layout, [{ ratio: cellRatio * 2 }]);

    // The log makes a 2x stretch and a 2x squash equal and opposite.
    expect(stretched).toBeCloseTo(squashed, 12);
    expect(stretched).toBeCloseTo(Math.log(2) ** 2, 12);
  });

  it("does not let opposite errors cancel out", () => {
    const layout = layoutOf([place(0, 1, 1), place(1, 1, 1)], 4, 4);
    const cellRatio = 3 / 2;

    // One item stretched 2x, one squashed 2x. Without the square these sum to 0.
    const result = score(layout, [
      { ratio: cellRatio / 2 },
      { ratio: cellRatio * 2 },
    ]);

    expect(result).toBeCloseTo(2 * Math.log(2) ** 2, 12);
    expect(result).toBeGreaterThan(0);
  });

  it("punishes one bad cell more than several slightly-off ones", () => {
    const cellRatio = 3 / 2;
    const spread = layoutOf([0, 1, 2, 3].map((i) => place(i, 1, 1)), 4, 4);
    const concentrated = layoutOf([place(0, 1, 1)], 4, 4);

    // Four items off by e^0.1 each, versus one item off by e^0.4.
    const spreadScore = score(
      spread,
      Array.from({ length: 4 }, () => ({ ratio: cellRatio / Math.exp(0.1) })),
    );
    const concentratedScore = score(concentrated, [
      { ratio: cellRatio / Math.exp(0.4) },
    ]);

    expect(spreadScore).toBeCloseTo(0.04, 10);
    expect(concentratedScore).toBeCloseTo(0.16, 10);
    expect(concentratedScore).toBeGreaterThan(spreadScore);
  });

  it("is invariant to scaling the container without changing its aspect", () => {
    const placements = [place(0, 1, 2), place(1, 3, 1)];
    const items = [{ ratio: 1 }, { ratio: 2 }];

    const small = score(
      { placements, grid: { cols: 4, rows: 4 }, container: { width: 600, height: 400 } },
      items,
    );
    const large = score(
      { placements, grid: { cols: 4, rows: 4 }, container: { width: 2400, height: 1600 } },
      items,
    );

    expect(small).toBeCloseTo(large, 12);
  });

  it("scores an empty layout as zero", () => {
    expect(score(layoutOf([], 4, 4), [])).toBe(0);
  });

  it("rejects an invalid container, item, or ratio", () => {
    const layout = layoutOf([place(0, 1, 1)], 4, 4);
    expect(() => score(layout, [])).toThrow(RangeError);
    expect(() => score(layout, [{ ratio: 0 }])).toThrow(RangeError);
    expect(() => score(layout, [{ ratio: -1 }])).toThrow(RangeError);
    expect(() =>
      score({ ...layout, container: { width: 0, height: 800 } }, [{ ratio: 1 }]),
    ).toThrow(RangeError);
  });
});
