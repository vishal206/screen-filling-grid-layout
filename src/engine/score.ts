import type { Placement } from "./pack.js";
import type { TrackGrid } from "./tracks.js";

/** Anything with a declared aspect ratio; the solver only needs this much. */
export interface RatioItem {
  /** Declared intrinsic ratio as width / height. Must be finite and positive. */
  ratio: number;
}

/** A packed board plus the geometry needed to turn track spans into pixels. */
export interface Layout {
  /** Placements whose `index` addresses the caller's own `items` array. */
  placements: Placement[];
  /** Track grid the placements sit on. */
  grid: TrackGrid;
  /** Pixel size of the container the grid fills. */
  container: { width: number; height: number };
}

/**
 * Rates how faithfully a layout honours its items' declared aspect ratios.
 * Lower is better; `0` means every cell matches its item exactly.
 *
 * For each placed item, compares the cell's actual pixel ratio to the item's
 * declared ratio and sums `Math.log(actual / declared) ** 2`.
 *
 * The log makes the error multiplicative and sign-symmetric: twice as wide and
 * twice as tall are equal and opposite distortions, so the metric has no hidden
 * preference between stretching and squashing, and it is invariant to scaling
 * every ratio at once. Squaring removes the sign — otherwise a stretch and a
 * squash would cancel and a visibly wrecked layout could score zero — and makes
 * the penalty convex, so one badly mangled cell costs more than several
 * slightly imperfect ones.
 *
 * Only placed items are scored; dropped items have no cell and no ratio error,
 * so callers comparing layouts must weigh {@link Placement} count separately
 * rather than reading a low score as a good layout.
 *
 * Pure. Depends on the container only through its aspect ratio.
 *
 * @throws RangeError if the container is not positive, a placement addresses a
 * missing item, or an item's ratio is not finite and positive.
 */
export function score(layout: Layout, items: readonly RatioItem[]): number {
  const { container, grid, placements } = layout;

  if (!isPositive(container.width) || !isPositive(container.height)) {
    throw new RangeError(
      `container must be positive, got ${container.width}x${container.height}`,
    );
  }

  const trackWidth = container.width / grid.cols;
  const trackHeight = container.height / grid.rows;

  let total = 0;

  for (const placement of placements) {
    const item = items[placement.index];
    if (item === undefined) {
      throw new RangeError(`placement addresses missing item ${placement.index}`);
    }
    if (!isPositive(item.ratio)) {
      throw new RangeError(
        `items[${placement.index}].ratio must be > 0, got ${item.ratio}`,
      );
    }

    const actual = (placement.cols * trackWidth) / (placement.rows * trackHeight);
    const error = Math.log(actual / item.ratio);
    total += error * error;
  }

  return total;
}

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}
