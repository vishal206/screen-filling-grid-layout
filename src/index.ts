import type { ReactNode } from "react";
import type { GridProps } from "./types.js";

export type { GridItem, GridProps, Rect } from "./types.js";
export type { ComputeLayoutOptions } from "./engine/computeLayout.js";
export { computeLayout } from "./engine/computeLayout.js";

/** Renders `items` as a screen-filling grid, measuring its own container. */
export function Grid(_props: GridProps): ReactNode {
  throw new Error("not implemented");
}
