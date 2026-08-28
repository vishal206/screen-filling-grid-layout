import type { ReactNode } from "react";

/**
 * The pixel box computed for one item, in the grid container's coordinate
 * space. Passed to {@link GridItem.render} and to the pointer callbacks.
 */
export interface Rect {
  /** Key of the item this rect was computed for. */
  key: string;
  /** Distance in px from the container's left edge to the cell's left edge. */
  x: number;
  /** Distance in px from the container's top edge to the cell's top edge. */
  y: number;
  /** Cell width in px, gaps already subtracted. */
  width: number;
  /** Cell height in px, gaps already subtracted. */
  height: number;
}

/** A single tile to place in the grid. */
export interface GridItem {
  /** Stable identity for the item; used as the React key and in {@link Rect.key}. */
  key: string;
  /**
   * Intrinsic aspect ratio as width / height (e.g. `16 / 9`). Required: the
   * layout solver has no sensible default, so omitting it is a compile error.
   */
  ratio: number;
  /**
   * Relative share of available area this item claims against its siblings.
   * Higher means a larger cell. Defaults to `1`.
   */
  weight?: number;
  /**
   * Floor in px for this item's cell width. The solver will not shrink the
   * cell below it, even if that costs other items area.
   */
  minWidth?: number;
  /** Renders the item's content for the cell box the solver assigned to it. */
  render: (rect: Rect) => ReactNode;
}

/** Props for the grid component. */
export interface GridProps {
  /** Items to lay out, in visual order. */
  items: GridItem[];
  /** Space in px between adjacent cells, both axes. Defaults to `0`. */
  gap?: number;
  /**
   * Force a fixed `[cols, rows]` track count instead of letting the solver
   * choose one. Extra tracks stay empty; too few tracks drop items.
   */
  tracks?: [cols: number, rows: number];
  /**
   * When `true`, cells must match their item's `ratio` exactly and the grid
   * leaves empty space rather than distorting. When `false`, cells may deviate
   * up to {@link GridProps.maxRatioDeviation} to fill the container.
   * Defaults to `false`.
   */
  strictRatio?: boolean;
  /**
   * Largest tolerated relative difference between a cell's ratio and its
   * item's `ratio`, as a fraction (e.g. `0.1` allows ±10%). Ignored when
   * `strictRatio` is `true`.
   */
  maxRatioDeviation?: number;
  /** How content larger than its cell is handled. Defaults to `"hidden"`. */
  overflow?: "hidden" | "auto" | "visible";
  /**
   * Global floor in px for cell width, applied to every item. An item's own
   * {@link GridItem.minWidth} takes precedence where it is larger.
   */
  minCellWidth?: number;
  /** Called when a cell is clicked, with the item and its current rect. */
  onItemClick?: (item: GridItem, rect: Rect) => void;
  /**
   * Called when the pointer enters a cell, and again with `null` when it
   * leaves the last hovered cell.
   */
  onItemHover?: (item: GridItem | null, rect: Rect | null) => void;
}
