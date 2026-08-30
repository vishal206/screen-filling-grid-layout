import type { IdealDimensions } from "./dimensions.js";

/** A track grid to place items into. */
export interface TrackGrid {
  /** Number of column tracks. Must be a positive integer. */
  cols: number;
  /** Number of row tracks. Must be a positive integer. */
  rows: number;
}

/** Whole-track extent assigned to one item. */
export interface TrackSpan {
  /** Column tracks the item spans. At least 1, at most {@link TrackGrid.cols}. */
  cols: number;
  /** Row tracks the item spans. At least 1, at most {@link TrackGrid.rows}. */
  rows: number;
}

/** Result of {@link assignTracks}. */
export interface TrackAssignment {
  /** One span per input item, in input order. */
  spans: TrackSpan[];
  /**
   * Cells left over (positive) or overcommitted (negative) after balancing:
   * `cols * rows - sum(span.cols * span.rows)`. Zero when the spans account
   * for the grid exactly. Non-zero when no single-track move could close the
   * gap — spans grow area in lumps of the opposite axis, so the residual is
   * not always reachable. The packer decides what to do with what is left.
   */
  residual: number;
}

/**
 * Converts each item's ideal pixel box into a whole number of column and row
 * tracks.
 *
 * Each ideal box is divided by the track size, rounded to the nearest whole
 * track, and clamped to `[1, cols]` / `[1, rows]`. Rounding does not conserve
 * area, so a balancing pass then repeatedly applies the single one-track move
 * that shrinks `|residual|` the most, breaking ties by the move that distorts
 * the item's aspect ratio least and then by lowest index. It stops when no move
 * strictly improves, and reports whatever residual remains.
 *
 * Pure and deterministic: the same input always yields the same spans, so a
 * re-render with unchanged items cannot make the grid flicker.
 *
 * @throws RangeError if the grid is not positive integers, or the container has
 * a non-finite or negative dimension.
 */
export function assignTracks(
  ideals: IdealDimensions[],
  container: { width: number; height: number },
  grid: TrackGrid,
): TrackAssignment {
  assertGrid(grid);
  assertContainer(container);

  const capacity = grid.cols * grid.rows;
  if (ideals.length === 0) {
    return { spans: [], residual: capacity };
  }

  const trackWidth = container.width / grid.cols;
  const trackHeight = container.height / grid.rows;

  // Ideal spans in fractional track units; the target the balancer stays near.
  const targets = ideals.map((ideal) => ({
    cols: trackWidth > 0 ? ideal.width / trackWidth : 1,
    rows: trackHeight > 0 ? ideal.height / trackHeight : 1,
  }));

  const spans: TrackSpan[] = targets.map((target) => ({
    cols: clamp(Math.round(target.cols), 1, grid.cols),
    rows: clamp(Math.round(target.rows), 1, grid.rows),
  }));

  let residual = capacity - totalArea(spans);

  // Balancing pass. Each iteration commits the single best one-track move.
  // Every move strictly reduces |residual|, which is a bounded non-negative
  // integer, so this terminates.
  for (;;) {
    const move = bestMove(spans, targets, grid, residual);
    if (move === undefined) break;

    const span = spans[move.index];
    if (span === undefined) break;
    if (move.axis === "cols") span.cols += move.delta;
    else span.rows += move.delta;

    residual -= move.areaDelta;
  }

  return { spans, residual };
}

interface Move {
  index: number;
  axis: "cols" | "rows";
  delta: 1 | -1;
  areaDelta: number;
}

/**
 * Finds the one-track change that best closes the residual, or `undefined`
 * when none strictly improves it.
 */
function bestMove(
  spans: TrackSpan[],
  targets: TrackSpan[],
  grid: TrackGrid,
  residual: number,
): Move | undefined {
  let best: Move | undefined;
  let bestResidual = Math.abs(residual);
  let bestCost = Infinity;

  for (const [index, span] of spans.entries()) {
    const target = targets[index];
    if (target === undefined) continue;

    const current = distortion(span, target);

    for (const axis of ["cols", "rows"] as const) {
      const limit = axis === "cols" ? grid.cols : grid.rows;

      for (const delta of [1, -1] as const) {
        const next = span[axis] + delta;
        if (next < 1 || next > limit) continue;

        const candidate: TrackSpan =
          axis === "cols"
            ? { cols: next, rows: span.rows }
            : { cols: span.cols, rows: next };

        const areaDelta = candidate.cols * candidate.rows - span.cols * span.rows;
        const nextResidual = Math.abs(residual - areaDelta);
        if (nextResidual >= bestResidual) continue;

        const cost = distortion(candidate, target) - current;
        if (nextResidual < bestResidual || cost < bestCost) {
          best = { index, axis, delta, areaDelta };
          bestResidual = nextResidual;
          bestCost = cost;
        }
      }
    }
  }

  return best;
}

/**
 * How far a whole-track span sits from its fractional target, as summed
 * squared log ratios. Log keeps the measure scale-symmetric, so halving an
 * item costs the same as doubling it.
 */
function distortion(span: TrackSpan, target: TrackSpan): number {
  const colError = target.cols > 0 ? Math.log(span.cols / target.cols) : 0;
  const rowError = target.rows > 0 ? Math.log(span.rows / target.rows) : 0;
  return colError * colError + rowError * rowError;
}

function totalArea(spans: TrackSpan[]): number {
  return spans.reduce((sum, span) => sum + span.cols * span.rows, 0);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function assertGrid(grid: TrackGrid): void {
  for (const axis of ["cols", "rows"] as const) {
    const value = grid[axis];
    if (!Number.isInteger(value) || value < 1) {
      throw new RangeError(`grid.${axis} must be a positive integer, got ${value}`);
    }
  }
}

function assertContainer(container: { width: number; height: number }): void {
  for (const axis of ["width", "height"] as const) {
    const value = container[axis];
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(
        `container.${axis} must be a finite number >= 0, got ${value}`,
      );
    }
  }
}
