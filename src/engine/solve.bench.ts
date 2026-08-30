import { bench, describe } from "vitest";

import { solveLayout, type SolverItem } from "./solve.js";

const CONTAINER = { width: 1920, height: 1080 };

/** Deterministic pseudo-random items so runs are comparable. */
function makeItems(count: number): SolverItem[] {
  let seed = 42;
  const next = (): number => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const ratios = [16 / 9, 4 / 3, 1, 3 / 4, 9 / 16, 2.35];
  return Array.from({ length: count }, () => ({
    ratio: ratios[Math.floor(next() * ratios.length)] ?? 1,
    weight: 1 + Math.floor(next() * 4),
  }));
}

/** A roughly square grid with enough cells for the items. */
function gridFor(count: number) {
  const cols = Math.ceil(Math.sqrt(count * 1.5));
  return { cols, rows: Math.ceil((count * 1.5) / cols) };
}

for (const count of [6, 12, 24, 50, 100]) {
  const items = makeItems(count);
  const grid = gridFor(count);

  describe(`${count} items on ${grid.cols}x${grid.rows}`, () => {
    for (const maxCandidates of [1, 3, 6, 12]) {
      bench(`${maxCandidates} candidate(s)`, () => {
        solveLayout(items, CONTAINER, grid, { maxCandidates });
      });
    }
  });
}
