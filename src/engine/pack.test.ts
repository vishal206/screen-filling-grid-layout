import { describe, expect, it } from "vitest";

import { packTracks, type PackResult } from "./pack.js";
import type { TrackGrid, TrackSpan } from "./tracks.js";

/**
 * Rebuilds the board from the placements, throwing on any overlap. Returns one
 * row-string per grid row, "." for empty, so failures read as a picture.
 */
function render(result: PackResult, grid: TrackGrid): string[] {
  const board: string[][] = Array.from({ length: grid.rows }, () =>
    Array.from({ length: grid.cols }, () => "."),
  );

  for (const p of result.placements) {
    for (let row = p.row; row < p.row + p.rows; row++) {
      for (let col = p.col; col < p.col + p.cols; col++) {
        const line = board[row];
        if (line === undefined) throw new Error(`row ${row} off-board`);
        if (line[col] === undefined) throw new Error(`col ${col} off-board`);
        if (line[col] !== ".") {
          throw new Error(`overlap at ${col},${row} between ${line[col]} and ${p.index}`);
        }
        line[col] = String(p.index);
      }
    }
  }

  return board.map((line) => line.join(""));
}

const span = (cols: number, rows: number): TrackSpan => ({ cols, rows });

describe("packTracks", () => {
  it("tiles four 1x1 spans onto a 2x2 board", () => {
    const grid = { cols: 2, rows: 2 };
    const result = packTracks([span(1, 1), span(1, 1), span(1, 1), span(1, 1)], grid);

    expect(render(result, grid)).toEqual(["01", "23"]);
    expect(result.emptyCells).toBe(0);
    expect(result.dropped).toEqual([]);
    expect(result.placements.every((p) => !p.shrunk && !p.grown)).toBe(true);
  });

  it("places a hero span with its siblings filling around it", () => {
    const grid = { cols: 4, rows: 4 };
    const spans = [span(2, 2), span(2, 2), span(2, 2), span(2, 2)];
    const result = packTracks(spans, grid);

    expect(render(result, grid)).toEqual(["0011", "0011", "2233", "2233"]);
    expect(result.emptyCells).toBe(0);
  });

  it("never overlaps and fills the board for ragged spans", () => {
    const grid = { cols: 5, rows: 4 };
    // Naive first-fit strands (0,3)-(2,3) here: item 4 is anchored at (3,2) and
    // reaches into row 3 past cells no later item exists to claim. The
    // hole-absorption pass has to grow items 2 and 3 down to cover them.
    const spans = [span(3, 2), span(2, 2), span(1, 1), span(2, 1), span(2, 2)];
    const result = packTracks(spans, grid);

    expect(render(result, grid)).toEqual(["00011", "00011", "23344", "23344"]);
    expect(result.emptyCells).toBe(0);
  });

  it("grows placements to absorb cells left over at the tail", () => {
    const grid = { cols: 4, rows: 2 };
    const result = packTracks([span(1, 1), span(1, 1)], grid);

    // Two 1x1 items on an 8-cell board: both expand rather than leave holes.
    expect(result.emptyCells).toBe(0);
    expect(result.placements.every((p) => p.grown)).toBe(true);
    expect(render(result, grid).join("")).not.toContain(".");
  });

  it("shrinks a span that cannot fit where it is anchored", () => {
    const grid = { cols: 3, rows: 2 };
    // 2x2 lands at 0,0; the next 2x2 only has one column left, so it shrinks.
    const result = packTracks([span(2, 2), span(2, 2)], grid);

    const [first, second] = result.placements;
    expect(first).toMatchObject({ col: 0, row: 0, cols: 2, rows: 2, shrunk: false });
    expect(second).toMatchObject({ col: 2, row: 0, cols: 1, rows: 2, shrunk: true });
    expect(second?.grown).toBe(false);
    expect(result.emptyCells).toBe(0);
    expect(render(result, grid)).toEqual(["001", "001"]);
  });

  it("does not pack cleanly: oversized spans get cut down and the board still fills", () => {
    const grid = { cols: 3, rows: 3 };
    // Three 2x2 spans want 12 cells on a 9-cell board. None can be honoured
    // in full, so this is the messy case: everything places, most shrink.
    const result = packTracks([span(2, 2), span(2, 2), span(2, 2)], grid);

    const board = render(result, grid); // throws on overlap
    expect(result.dropped).toEqual([]);
    expect(result.placements).toHaveLength(3);
    // Nobody gets the 2x2 they asked for, but the board still comes out full.
    expect(result.placements.filter((p) => p.shrunk).length).toBeGreaterThan(0);
    expect(result.emptyCells).toBe(0);
    expect(board.join("")).not.toContain(".");
    expect(result.placements.reduce((n, p) => n + p.cols * p.rows, 0)).toBe(9);
  });

  it("drops items once the board is full", () => {
    const grid = { cols: 2, rows: 2 };
    const spans = [span(1, 1), span(1, 1), span(1, 1), span(1, 1), span(1, 1), span(1, 1)];
    const result = packTracks(spans, grid);

    expect(result.placements).toHaveLength(4);
    expect(result.dropped).toEqual([4, 5]);
    expect(result.emptyCells).toBe(0);
  });

  it("fills the board from a single item", () => {
    const grid = { cols: 3, rows: 2 };
    const result = packTracks([span(1, 1)], grid);

    expect(result.placements[0]).toMatchObject({ col: 0, row: 0, cols: 3, rows: 2 });
    expect(result.emptyCells).toBe(0);
  });

  it("clamps a span larger than the whole board", () => {
    const grid = { cols: 2, rows: 2 };
    const result = packTracks([span(9, 9)], grid);

    expect(result.placements[0]).toMatchObject({ cols: 2, rows: 2, shrunk: true, grown: false });
    expect(result.emptyCells).toBe(0);
  });

  it("is deterministic and preserves input order", () => {
    const grid = { cols: 5, rows: 4 };
    const spans = [span(3, 2), span(2, 2), span(1, 1), span(2, 1), span(2, 2)];

    const a = packTracks(spans, grid);
    const b = packTracks(spans, grid);

    expect(a).toEqual(b);
    expect(a.placements.map((p) => p.index)).toEqual(
      [...a.placements.map((p) => p.index)].sort((x, y) => x - y),
    );
  });

  it("handles an empty item list", () => {
    expect(packTracks([], { cols: 3, rows: 2 })).toEqual({
      placements: [],
      dropped: [],
      emptyCells: 6,
    });
  });

  it("rejects an invalid grid or span", () => {
    expect(() => packTracks([span(1, 1)], { cols: 0, rows: 2 })).toThrow(RangeError);
    expect(() => packTracks([span(1, 1)], { cols: 2.5, rows: 2 })).toThrow(RangeError);
    expect(() => packTracks([span(0, 1)], { cols: 2, rows: 2 })).toThrow(RangeError);
    expect(() => packTracks([span(1, 1.5)], { cols: 2, rows: 2 })).toThrow(RangeError);
  });
});
