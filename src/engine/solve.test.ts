import { describe, expect, it } from "vitest";

import { score } from "./score.js";
import { solveLayout, type SolverItem } from "./solve.js";

const CONTAINER = { width: 1200, height: 800 };

describe("solveLayout", () => {
  it("never returns a worse layout than the caller's own ordering", () => {
    const items: SolverItem[] = [
      { ratio: 16 / 9, weight: 1 },
      { ratio: 1, weight: 4 },
      { ratio: 9 / 16, weight: 1 },
      { ratio: 4 / 3, weight: 2 },
      { ratio: 1, weight: 1 },
    ];
    const grid = { cols: 4, rows: 3 };

    const single = solveLayout(items, CONTAINER, grid, { maxCandidates: 1 });
    const best = solveLayout(items, CONTAINER, grid);

    expect(best.evaluated).toBeGreaterThan(1);
    expect(best.score).toBeLessThanOrEqual(single.score);
    expect(best.dropped.length).toBeLessThanOrEqual(single.dropped.length);
  });

  it("reports the score of the layout it actually returned", () => {
    const items: SolverItem[] = [
      { ratio: 16 / 9, weight: 3 },
      { ratio: 1, weight: 1 },
      { ratio: 3 / 4, weight: 1 },
    ];
    const result = solveLayout(items, CONTAINER, { cols: 3, rows: 2 });

    expect(result.score).toBeCloseTo(score(result.layout, items), 12);
  });

  it("returns placements addressing the caller's items, sorted by index", () => {
    const items: SolverItem[] = [
      { ratio: 1, weight: 5 },
      { ratio: 2, weight: 1 },
      { ratio: 0.5, weight: 1 },
      { ratio: 1, weight: 1 },
    ];
    const result = solveLayout(items, CONTAINER, { cols: 4, rows: 4 });

    const indices = result.layout.placements.map((p) => p.index);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    expect(new Set(indices).size).toBe(indices.length);
    for (const index of indices) expect(items[index]).toBeDefined();
  });

  it("keeps the caller's ordering when maxCandidates is 1", () => {
    const items: SolverItem[] = [
      { ratio: 1, weight: 1 },
      { ratio: 4, weight: 9 },
      { ratio: 1, weight: 1 },
    ];
    const result = solveLayout(items, CONTAINER, { cols: 3, rows: 3 }, { maxCandidates: 1 });

    expect(result.ordering).toBe(0);
    expect(result.evaluated).toBe(1);
  });

  it("breaks ties toward the caller's ordering", () => {
    // Identical items make every ordering equivalent, so candidate 0 must win.
    const items: SolverItem[] = Array.from({ length: 4 }, () => ({ ratio: 3 / 2 }));
    const result = solveLayout(items, CONTAINER, { cols: 2, rows: 2 });

    expect(result.ordering).toBe(0);
  });

  it("depends on the container only through its aspect ratio", () => {
    const items: SolverItem[] = [
      { ratio: 16 / 9, weight: 3 },
      { ratio: 1, weight: 1 },
      { ratio: 0.75, weight: 2 },
      { ratio: 2, weight: 1 },
    ];
    const grid = { cols: 4, rows: 3 };

    const small = solveLayout(items, { width: 600, height: 400 }, grid);
    const large = solveLayout(items, { width: 2400, height: 1600 }, grid);

    // Same spans and positions; only the pixel container differs.
    expect(large.layout.placements).toEqual(small.layout.placements);
    expect(large.score).toBeCloseTo(small.score, 12);
    expect(large.ordering).toBe(small.ordering);
  });

  it("is deterministic", () => {
    const items: SolverItem[] = [
      { ratio: 16 / 9, weight: 4 },
      { ratio: 0.5, weight: 1 },
      { ratio: 1, weight: 2 },
      { ratio: 3, weight: 1 },
      { ratio: 1.2, weight: 1 },
    ];
    const grid = { cols: 5, rows: 4 };

    expect(solveLayout(items, CONTAINER, grid)).toEqual(
      solveLayout(items, CONTAINER, grid),
    );
  });

  it("stays stable across a resize sweep", () => {
    // The layout is a step function of container aspect: it changes only when a
    // rounding boundary is crossed. This is what makes caching on the previous
    // result worthwhile, so it is worth pinning down.
    const items: SolverItem[] = [
      { ratio: 16 / 9, weight: 3 }, { ratio: 1, weight: 1 }, { ratio: 4 / 3, weight: 2 },
      { ratio: 0.75, weight: 1 }, { ratio: 2.35, weight: 1 }, { ratio: 1, weight: 1 },
      { ratio: 9 / 16, weight: 1 }, { ratio: 16 / 9, weight: 2 }, { ratio: 1, weight: 1 },
      { ratio: 4 / 3, weight: 1 }, { ratio: 1, weight: 1 }, { ratio: 16 / 9, weight: 1 },
    ];
    const grid = { cols: 5, rows: 4 };

    const signatures: string[] = [];
    for (let width = 800; width <= 1600; width++) {
      const { layout } = solveLayout(items, { width, height: 900 }, grid);
      signatures.push(
        JSON.stringify(layout.placements.map((p) => [p.index, p.col, p.row, p.cols, p.rows])),
      );
    }

    const changes = signatures.filter((sig, i) => i > 0 && sig !== signatures[i - 1]).length;

    expect(new Set(signatures).size).toBeLessThan(25);
    expect(changes / signatures.length).toBeLessThan(0.05);
  });

  it("handles an empty item list", () => {
    const result = solveLayout([], CONTAINER, { cols: 3, rows: 2 });

    expect(result).toMatchObject({
      score: 0,
      dropped: [],
      emptyCells: 6,
      evaluated: 0,
    });
    expect(result.layout.placements).toEqual([]);
  });

  it("rejects invalid options and items", () => {
    const items: SolverItem[] = [{ ratio: 1 }];
    expect(() => solveLayout(items, CONTAINER, { cols: 2, rows: 2 }, { maxCandidates: 0 })).toThrow(RangeError);
    expect(() => solveLayout(items, CONTAINER, { cols: 2, rows: 2 }, { maxCandidates: 1.5 })).toThrow(RangeError);
    expect(() => solveLayout([{ ratio: 1, weight: -1 }], CONTAINER, { cols: 2, rows: 2 })).toThrow(RangeError);
    expect(() => solveLayout([{ ratio: 1, weight: 0 }], CONTAINER, { cols: 2, rows: 2 })).toThrow(RangeError);
    expect(() => solveLayout([{ ratio: 0 }], CONTAINER, { cols: 2, rows: 2 })).toThrow(RangeError);
  });
});
