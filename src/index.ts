import type { ReactNode } from "react";
import type { GridItem, GridProps, Rect } from "./types.js";

export type { GridItem, GridProps, Rect } from "./types.js";

/** Options accepted by {@link computeLayout}, mirroring the layout-affecting props. */
export type ComputeLayoutOptions = Pick<
  GridProps,
  "gap" | "tracks" | "strictRatio" | "maxRatioDeviation" | "minCellWidth"
>;

/**
 * Solves cell rects for `items` inside a container of `width` x `height` px.
 * Pure: no DOM access, no React. Returns one {@link Rect} per laid-out item.
 */
export function computeLayout(
  _items: GridItem[],
  _container: { width: number; height: number },
  _options?: ComputeLayoutOptions,
): Rect[] {
  throw new Error("not implemented");
}

/** Renders `items` as a screen-filling grid, measuring its own container. */
export function Grid(_props: GridProps): ReactNode {
  throw new Error("not implemented");
}
