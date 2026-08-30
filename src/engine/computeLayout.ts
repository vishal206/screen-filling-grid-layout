import type { GridItem, GridProps, Rect } from "../types.js";
import { solveLayout, type SolverItem } from "./solve.js";
import type { TrackGrid } from "./tracks.js";

/** Options accepted by {@link computeLayout}, mirroring the layout-affecting props. */
export type ComputeLayoutOptions = Pick<
  GridProps,
  "gap" | "tracks" | "strictRatio" | "maxRatioDeviation" | "minCellWidth"
>;

/** Orderings to try per grid, scaled down so large item counts stay in budget. */
function orderingBudget(count: number): number {
  if (count > 80) return 2;
  if (count > 40) return 3;
  return 6;
}

/**
 * Solves cell rects for `items` inside a container of `width` x `height` px.
 *
 * Composes the engine: ideal box per item from its weight share and ratio,
 * whole-track spans, greedy packing with hole absorption, and log-ratio scoring
 * to pick between candidate grids and item orderings. Pure — no DOM, no React.
 *
 * Rects come back in the caller's item order. An item the packer had to drop
 * gets no rect, so the result may be shorter than `items`.
 *
 * Edge cases:
 * - **No items**, or a container without positive width and height, returns an
 *   empty array without doing any work.
 * - **One item** takes the whole container, subject to the ratio constraints
 *   below. No grid search runs.
 * - **`strictRatio`** inscribes each cell's rect at the item's exact declared
 *   ratio, centred, leaving empty space rather than distorting. It never
 *   changes which cell an item occupies — only how much of it is used.
 * - **`minCellWidth` wider than the container** cannot be honoured, so the grid
 *   collapses to a single column and cells take the full container width. The
 *   floor is best-effort: it caps the column count, and is never allowed to
 *   produce a zero-width or negative-width cell.
 */
export function computeLayout(
  items: readonly GridItem[],
  container: { width: number; height: number },
  options: ComputeLayoutOptions = {},
): Rect[] {
  const { width, height } = container;

  // Nothing renderable: no items, or no space to render them into.
  if (items.length === 0) return [];
  if (!isPositive(width) || !isPositive(height)) return [];

  const gap = options.gap ?? 0;
  if (!Number.isFinite(gap) || gap < 0) {
    throw new RangeError(`gap must be a finite number >= 0, got ${gap}`);
  }

  const strict = options.strictRatio ?? false;
  const maxDeviation = options.maxRatioDeviation;

  // Single item: it owns the container outright, so skip the grid search.
  if (items.length === 1) {
    const item = at(items, 0);
    return [
      constrainRatio(
        { key: item.key, x: 0, y: 0, width, height },
        item.ratio,
        strict,
        maxDeviation,
      ),
    ];
  }

  // The widest floor any item asks for; every cell is at least one track wide,
  // so capping the column count satisfies the global floor and each item's own.
  const floor = items.reduce(
    (widest, item) => Math.max(widest, item.minWidth ?? 0),
    options.minCellWidth ?? 0,
  );
  const maxCols = columnCap(width, gap, floor, items.length);

  const grids = options.tracks
    ? [{ cols: options.tracks[0], rows: options.tracks[1] }]
    : candidateGrids(items.length, width / height, maxCols);

  const solverItems: SolverItem[] = items.map((item) => ({
    ratio: item.ratio,
    weight: item.weight,
  }));
  const maxCandidates = orderingBudget(items.length);

  let best: { grid: TrackGrid; rects: Rect[]; score: number; dropped: number } | undefined;

  for (const grid of grids) {
    // Solve against the space left once gaps are removed, so track sizes and
    // the scores computed from them describe the boxes items actually get.
    const content = {
      width: width - gap * (grid.cols - 1),
      height: height - gap * (grid.rows - 1),
    };
    if (!isPositive(content.width) || !isPositive(content.height)) continue;

    const solved = solveLayout(solverItems, content, grid, { maxCandidates });

    const trackWidth = content.width / grid.cols;
    const trackHeight = content.height / grid.rows;

    const rects = solved.layout.placements.map((placement) => {
      const item = at(items, placement.index);
      const cell: Rect = {
        key: item.key,
        x: placement.col * (trackWidth + gap),
        y: placement.row * (trackHeight + gap),
        width: placement.cols * trackWidth + (placement.cols - 1) * gap,
        height: placement.rows * trackHeight + (placement.rows - 1) * gap,
      };
      return constrainRatio(cell, item.ratio, strict, maxDeviation);
    });

    const candidate = {
      grid,
      rects,
      score: solved.score,
      dropped: solved.dropped.length,
    };

    if (
      best === undefined ||
      candidate.dropped < best.dropped ||
      (candidate.dropped === best.dropped && candidate.score < best.score)
    ) {
      best = candidate;
    }
  }

  return best?.rects ?? [];
}

/**
 * Shrinks a cell rect until its ratio is acceptable, centring what remains.
 * Returns the cell untouched when no constraint applies or it already complies.
 */
function constrainRatio(
  cell: Rect,
  declared: number,
  strict: boolean,
  maxDeviation: number | undefined,
): Rect {
  if (!isPositive(cell.width) || !isPositive(cell.height)) return cell;

  const actual = cell.width / cell.height;
  let target: number;

  if (strict) {
    // Exact ratio or nothing: the leftover space is left empty by design.
    target = declared;
  } else if (
    maxDeviation !== undefined &&
    Number.isFinite(maxDeviation) &&
    maxDeviation >= 0
  ) {
    const lower = declared * (1 - maxDeviation);
    const upper = declared * (1 + maxDeviation);
    if (actual >= lower && actual <= upper) return cell;
    target = actual < lower ? lower : upper;
  } else {
    // Unconstrained: fill the cell, whatever that does to the ratio.
    return cell;
  }

  if (!isPositive(target)) return cell;

  const width = target > actual ? cell.width : cell.height * target;
  const height = target > actual ? cell.width / target : cell.height;

  return {
    key: cell.key,
    x: cell.x + (cell.width - width) / 2,
    y: cell.y + (cell.height - height) / 2,
    width,
    height,
  };
}

/**
 * Largest column count whose tracks still clear `floor` px. Returns `1` when
 * even a single full-width column falls short — the floor is unsatisfiable, and
 * one column is the closest the grid can get.
 */
function columnCap(width: number, gap: number, floor: number, count: number): number {
  if (floor <= 0) return count;
  return Math.max(1, Math.min(count, Math.floor((width + gap) / (floor + gap))));
}

/**
 * Grids worth trying: column counts either side of the one that matches the
 * container's aspect, plus a double-resolution variant of each so weights can
 * express themselves through multi-track spans.
 */
function candidateGrids(count: number, aspect: number, maxCols: number): TrackGrid[] {
  const ideal = clamp(Math.round(Math.sqrt(count * aspect)), 1, count);
  const grids: TrackGrid[] = [];
  const seen = new Set<string>();

  for (const offset of [0, -1, 1]) {
    const cols = clamp(ideal + offset, 1, maxCols);
    const rows = Math.ceil(count / cols);

    for (const scale of [1, 2]) {
      const grid = { cols: cols * scale, rows: rows * scale };
      // A doubled grid past the column cap would violate the width floor.
      if (grid.cols > maxCols) continue;

      const signature = `${grid.cols}x${grid.rows}`;
      if (seen.has(signature)) continue;
      seen.add(signature);
      grids.push(grid);
    }
  }

  return grids;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new RangeError(`index ${index} out of range`);
  return value;
}
