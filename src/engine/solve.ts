import { idealDimensions } from "./dimensions.js";
import { packTracks } from "./pack.js";
import { score, type Layout, type RatioItem } from "./score.js";
import { assignTracks, type TrackGrid } from "./tracks.js";

/** What the solver needs from each item. */
export interface SolverItem extends RatioItem {
  /** Relative share of container area. Defaults to `1`. Must be >= 0. */
  weight?: number;
}

/** Options for {@link solveLayout}. */
export interface SolveOptions {
  /**
   * Upper bound on how many orderings to try. The identity ordering is always
   * candidate 0, so `1` reproduces single-pass behaviour. Defaults to `6`.
   */
  maxCandidates?: number;
}

/** The winning layout and how it was reached. */
export interface SolveResult {
  /** Placements addressing the caller's `items`, sorted by item index. */
  layout: Layout;
  /** {@link score} of `layout`. Lower is better. */
  score: number;
  /** Item indices the packer could not place. */
  dropped: number[];
  /** Board cells left empty. */
  emptyCells: number;
  /** Which candidate ordering won; `0` is the caller's own item order. */
  ordering: number;
  /** How many orderings were actually evaluated. */
  evaluated: number;
}

const DEFAULT_MAX_CANDIDATES = 6;

/**
 * Packs `items` into `grid` several times under different orderings and returns
 * the layout that honours the declared aspect ratios best.
 *
 * Candidates are ranked by fewest dropped items, then lowest {@link score},
 * then fewest empty cells, then earliest candidate. Ties therefore fall to the
 * caller's own item order, which is candidate 0.
 *
 * Note that a winning non-identity ordering changes which cell each item lands
 * in, so visual order is traded for ratio fidelity. Pass `maxCandidates: 1` to
 * keep the caller's order unconditionally.
 *
 * Pure and deterministic. Depends on the container only through its aspect
 * ratio, which is what makes the result memoizable across most resizes.
 *
 * @throws RangeError if the grid or container is invalid, or an item's ratio or
 * weight is out of range.
 */
export function solveLayout(
  items: readonly SolverItem[],
  container: { width: number; height: number },
  grid: TrackGrid,
  options: SolveOptions = {},
): SolveResult {
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1) {
    throw new RangeError(
      `maxCandidates must be a positive integer, got ${maxCandidates}`,
    );
  }

  if (items.length === 0) {
    return {
      layout: { placements: [], grid, container },
      score: 0,
      dropped: [],
      emptyCells: grid.cols * grid.rows,
      ordering: 0,
      evaluated: 0,
    };
  }

  const totalWeight = items.reduce((sum, item) => sum + weightOf(item), 0);
  if (totalWeight <= 0) {
    throw new RangeError("items must have a positive total weight");
  }

  const orderings = candidateOrderings(items).slice(0, maxCandidates);

  let best: SolveResult | undefined;

  for (const [ordering, order] of orderings.entries()) {
    const candidate = evaluate(items, container, grid, totalWeight, order, ordering);
    if (best === undefined || beats(candidate, best)) best = candidate;
  }

  // orderings always contains at least the identity ordering.
  if (best === undefined) throw new Error("no candidate layout produced");

  return { ...best, evaluated: orderings.length };
}

/** Runs the full pipeline for one ordering and scores the outcome. */
function evaluate(
  items: readonly SolverItem[],
  container: { width: number; height: number },
  grid: TrackGrid,
  totalWeight: number,
  order: number[],
  ordering: number,
): SolveResult {
  const ideals = order.map((index) => {
    const item = items[index];
    if (item === undefined) throw new RangeError(`ordering references item ${index}`);
    return idealDimensions(
      weightOf(item),
      totalWeight,
      container.width,
      container.height,
      item.ratio,
    );
  });

  const { spans } = assignTracks(ideals, container, grid);
  const packed = packTracks(spans, grid);

  // Placements address positions in `order`; map them back to item indices.
  const placements = packed.placements
    .map((placement) => ({ ...placement, index: at(order, placement.index) }))
    .sort((a, b) => a.index - b.index);

  const dropped = packed.dropped.map((position) => at(order, position)).sort((a, b) => a - b);
  const layout: Layout = { placements, grid, container };

  return {
    layout,
    score: score(layout, items),
    dropped,
    emptyCells: packed.emptyCells,
    ordering,
    evaluated: 0,
  };
}

/** Ranks candidates: fewest dropped, then lowest score, then fewest holes. */
function beats(candidate: SolveResult, incumbent: SolveResult): boolean {
  if (candidate.dropped.length !== incumbent.dropped.length) {
    return candidate.dropped.length < incumbent.dropped.length;
  }
  if (candidate.score !== incumbent.score) return candidate.score < incumbent.score;
  return candidate.emptyCells < incumbent.emptyCells;
}

/**
 * Deterministic orderings worth trying, best-known-first after the identity.
 * Heavy-first is the classic win for greedy packing: big rectangles placed into
 * an empty board get the span they asked for, and small ones absorb the slack.
 */
function candidateOrderings(items: readonly SolverItem[]): number[][] {
  const indices = items.map((_, index) => index);
  const by = (rank: (item: SolverItem) => number): number[] =>
    [...indices].sort((a, b) => rank(at(items, b)) - rank(at(items, a)) || a - b);

  return [
    indices, // 0: the caller's visual order, and the tie-break winner
    by((item) => weightOf(item)), // heaviest first
    by((item) => -weightOf(item)), // lightest first
    by((item) => item.ratio), // widest first
    by((item) => -item.ratio), // tallest first
    by((item) => weightOf(item) * item.ratio), // widest-and-heaviest first
  ];
}

function weightOf(item: SolverItem): number {
  const weight = item.weight ?? 1;
  if (!Number.isFinite(weight) || weight < 0) {
    throw new RangeError(`weight must be a finite number >= 0, got ${weight}`);
  }
  return weight;
}

function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) throw new RangeError(`index ${index} out of range`);
  return value;
}
