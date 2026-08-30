import type { TrackGrid, TrackSpan } from "./tracks.js";

/** Where one item ended up on the board, in whole track coordinates. */
export interface Placement {
  /** Index of the item in the input `spans` array. */
  index: number;
  /** 0-based column track of the placement's left edge. */
  col: number;
  /** 0-based row track of the placement's top edge. */
  row: number;
  /** Column tracks actually occupied, after any shrink-to-fit. */
  cols: number;
  /** Row tracks actually occupied, after any shrink-to-fit. */
  rows: number;
  /** True when the item got less than it requested to make it fit. */
  shrunk: boolean;
  /** True when the item was expanded past its request to absorb empty cells. */
  grown: boolean;
}

/** Result of {@link packTracks}. */
export interface PackResult {
  /** One placement per placed item, in input order. Never overlapping. */
  placements: Placement[];
  /**
   * Indices of items that found no room because the board filled up. Empty
   * unless the grid was oversubscribed.
   */
  dropped: number[];
  /**
   * Cells still empty once every item was placed and the hole-absorption pass
   * ran. Non-zero only when leftover space could not be reached by growing any
   * placement along a whole edge — for example a lone hole wedged between two
   * placements that would each become non-rectangular by taking it.
   */
  emptyCells: number;
}

/** Marks a board cell that no placement covers. */
const EMPTY = -1;

/**
 * Places track-span rectangles onto a `cols x rows` board with no overlaps and
 * no interior gaps.
 *
 * Walks the board for the topmost-leftmost empty cell and anchors the next
 * item's top-left corner there, shrinking its span — largest area first,
 * preferring spans near the requested aspect ratio, down to `1x1` — until it
 * fits. Because a `1x1` always fits an empty cell, every anchor gets filled.
 *
 * That alone does not make the board gapless: a tall span reaches downward past
 * cells that come earlier in row-major order, and if the items run out nothing
 * claims them. So a second pass grows placements by one whole edge row or
 * column at a time into adjacent empty space — whole edges only, so every
 * placement stays rectangular — until no placement can grow. Anything still
 * empty after that is genuinely unreachable and reported in
 * {@link PackResult.emptyCells}.
 *
 * Input order is preserved: items are placed in the order given, so the caller's
 * visual ordering survives even when a different order would pack tighter.
 *
 * Pure and deterministic. Runs in `O(items * cols * rows)`.
 *
 * @throws RangeError if the grid is not positive integers, or a span is not a
 * positive integer.
 */
export function packTracks(spans: TrackSpan[], grid: TrackGrid): PackResult {
  assertGrid(grid);
  spans.forEach(assertSpan);

  const board = new Int32Array(grid.cols * grid.rows).fill(EMPTY);
  const placements: Placement[] = [];
  const dropped: number[] = [];

  for (const [index, want] of spans.entries()) {
    const anchor = firstEmptyCell(board, grid);
    if (anchor === undefined) {
      dropped.push(index);
      continue;
    }

    const span = largestFittingSpan(board, grid, anchor, want);
    // A 1x1 always fits an empty anchor, so this is defensive only.
    if (span === undefined) {
      dropped.push(index);
      continue;
    }

    occupy(board, grid, anchor, span, index);
    placements.push({
      index,
      col: anchor.col,
      row: anchor.row,
      cols: span.cols,
      rows: span.rows,
      shrunk: span.cols !== want.cols || span.rows !== want.rows,
      grown: false,
    });
  }

  absorbHoles(board, grid, placements);

  return { placements, dropped, emptyCells: countEmpty(board) };
}

/**
 * Grows placements into leftover empty cells until none can grow. Each growth
 * adds a full edge row or column, so placements stay rectangular, and fills at
 * least one empty cell, so the loop terminates.
 */
function absorbHoles(
  board: Int32Array,
  grid: TrackGrid,
  placements: Placement[],
): void {
  if (countEmpty(board) === 0) return;

  for (let changed = true; changed; ) {
    changed = false;
    for (const placement of placements) {
      for (const edge of ["down", "right", "up", "left"] as const) {
        while (tryGrow(board, grid, placement, edge)) {
          placement.grown = true;
          changed = true;
        }
      }
    }
  }
}

type Edge = "down" | "right" | "up" | "left";

/** Extends `placement` by one edge row/column if every cell there is empty. */
function tryGrow(
  board: Int32Array,
  grid: TrackGrid,
  placement: Placement,
  edge: Edge,
): boolean {
  const vertical = edge === "down" || edge === "up";
  const line = edge === "down"
    ? placement.row + placement.rows
    : edge === "up"
      ? placement.row - 1
      : edge === "right"
        ? placement.col + placement.cols
        : placement.col - 1;

  const limit = vertical ? grid.rows : grid.cols;
  if (line < 0 || line >= limit) return false;

  const start = vertical ? placement.col : placement.row;
  const length = vertical ? placement.cols : placement.rows;

  for (let offset = start; offset < start + length; offset++) {
    const col = vertical ? offset : line;
    const row = vertical ? line : offset;
    if (board[row * grid.cols + col] !== EMPTY) return false;
  }

  for (let offset = start; offset < start + length; offset++) {
    const col = vertical ? offset : line;
    const row = vertical ? line : offset;
    board[row * grid.cols + col] = placement.index;
  }

  if (edge === "down") placement.rows++;
  else if (edge === "right") placement.cols++;
  else if (edge === "up") {
    placement.row--;
    placement.rows++;
  } else {
    placement.col--;
    placement.cols++;
  }

  return true;
}

interface Cell {
  col: number;
  row: number;
}

/** Scans row-major for the topmost-leftmost empty cell. */
function firstEmptyCell(board: Int32Array, grid: TrackGrid): Cell | undefined {
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (board[row * grid.cols + col] === EMPTY) return { col, row };
    }
  }
  return undefined;
}

/**
 * Picks the biggest span that fits at `anchor` without exceeding `want`,
 * breaking ties toward the requested aspect ratio.
 */
function largestFittingSpan(
  board: Int32Array,
  grid: TrackGrid,
  anchor: Cell,
  want: TrackSpan,
): TrackSpan | undefined {
  const maxCols = Math.min(want.cols, grid.cols - anchor.col);
  const maxRows = Math.min(want.rows, grid.rows - anchor.row);
  const wantRatio = Math.log(want.cols / want.rows);

  let best: TrackSpan | undefined;
  let bestArea = 0;
  let bestRatioError = Infinity;

  for (let cols = 1; cols <= maxCols; cols++) {
    for (let rows = 1; rows <= maxRows; rows++) {
      if (!fits(board, grid, anchor, { cols, rows })) continue;

      const area = cols * rows;
      const ratioError = Math.abs(Math.log(cols / rows) - wantRatio);
      if (area > bestArea || (area === bestArea && ratioError < bestRatioError)) {
        best = { cols, rows };
        bestArea = area;
        bestRatioError = ratioError;
      }
    }
  }

  return best;
}

/** True when every cell the span would cover is on-board and empty. */
function fits(
  board: Int32Array,
  grid: TrackGrid,
  anchor: Cell,
  span: TrackSpan,
): boolean {
  if (anchor.col + span.cols > grid.cols) return false;
  if (anchor.row + span.rows > grid.rows) return false;

  for (let row = anchor.row; row < anchor.row + span.rows; row++) {
    for (let col = anchor.col; col < anchor.col + span.cols; col++) {
      if (board[row * grid.cols + col] !== EMPTY) return false;
    }
  }
  return true;
}

function occupy(
  board: Int32Array,
  grid: TrackGrid,
  anchor: Cell,
  span: TrackSpan,
  index: number,
): void {
  for (let row = anchor.row; row < anchor.row + span.rows; row++) {
    for (let col = anchor.col; col < anchor.col + span.cols; col++) {
      board[row * grid.cols + col] = index;
    }
  }
}

function countEmpty(board: Int32Array): number {
  let empty = 0;
  for (const cell of board) if (cell === EMPTY) empty++;
  return empty;
}

function assertGrid(grid: TrackGrid): void {
  for (const axis of ["cols", "rows"] as const) {
    const value = grid[axis];
    if (!Number.isInteger(value) || value < 1) {
      throw new RangeError(`grid.${axis} must be a positive integer, got ${value}`);
    }
  }
}

function assertSpan(span: TrackSpan, index: number): void {
  for (const axis of ["cols", "rows"] as const) {
    const value = span[axis];
    if (!Number.isInteger(value) || value < 1) {
      throw new RangeError(
        `spans[${index}].${axis} must be a positive integer, got ${value}`,
      );
    }
  }
}
