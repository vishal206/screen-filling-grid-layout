import type { CSSProperties, ReactNode } from "react";

import { computeLayoutPlan } from "./engine/computeLayout.js";
import type { GridItem, GridProps } from "./types.js";

/**
 * Stand-in container the solver reasons about until the component measures its
 * own box. The solver only reads the container through its aspect ratio, so the
 * track grid this yields is right for any 16:9-ish container; the rects handed
 * to `render` are in these coordinates, not real screen pixels.
 */
const NOMINAL = { width: 1600, height: 900 };

/**
 * Renders `items` as a screen-filling grid.
 *
 * The solver picks a track grid and a whole-track span per item; this component
 * then states that grid in CSS and lets the browser size it. Tracks are `1fr`,
 * so they divide the container exactly however large it turns out to be, and
 * each item is placed by track line with `grid-area` rather than by pixel
 * offset — no measurement, and no rounding drift along the way.
 *
 * `gap` is handed to the native CSS `gap` property, and to the solver so the
 * rects it reports describe the same boxes. Gutters come out of the track
 * space, never out of the container - see the note on {@link gapStyle}.
 *
 * Not wired up yet: re-solving on resize. `maxRatioDeviation` is honoured by
 * the solver when it shapes spans, but the letterboxing it implies is not drawn.
 */
export function Grid({
  items,
  gap = 0,
  tracks,
  strictRatio = false,
  maxRatioDeviation,
  minCellWidth,
  overflow = "hidden",
  onItemClick,
  onItemHover,
}: GridProps): ReactNode {
  const plan = computeLayoutPlan(items, NOMINAL, {
    gap,
    tracks,
    strictRatio,
    maxRatioDeviation,
    minCellWidth,
  });

  const byKey = new Map(items.map((item) => [item.key, item]));

  const containerStyle: CSSProperties = {
    display: "grid",
    width: "100%",
    height: "100%",
    // 1fr tracks split whatever the container is into equal shares, so the
    // tracks always sum to exactly 100% of it — no leftover strip, no overflow.
    gridTemplateColumns: `repeat(${plan.grid.cols}, 1fr)`,
    gridTemplateRows: `repeat(${plan.grid.rows}, 1fr)`,
    ...gapStyle(gap),
  };

  return (
    <div style={containerStyle}>
      {plan.cells.map((cell) => {
        const item = byKey.get(cell.key);
        if (item === undefined) return null;

        const cellStyle: CSSProperties = {
          // Line numbers are 1-based: row / column / row-end / column-end.
          gridArea: `${cell.row + 1} / ${cell.col + 1} / span ${cell.rows} / span ${cell.cols}`,
          overflow,
          minWidth: 0,
          minHeight: 0,
          cursor: onItemClick ? "pointer" : undefined,
          ...strictRatioStyle(item, strictRatio),
        };

        return (
          <div
            key={cell.key}
            style={cellStyle}
            onClick={onItemClick ? () => onItemClick(item, cell.rect) : undefined}
            // Pointer enter/leave do not bubble, so each cell reports only
            // itself. Crossing from one cell to another emits a `null` on the
            // way out before the next enter - which is the truth once `gap` is
            // non-zero, since the pointer really is over no cell in between.
            onPointerEnter={onItemHover ? () => onItemHover(item, cell.rect) : undefined}
            onPointerLeave={onItemHover ? () => onItemHover(null, null) : undefined}
          >
            {item.render(cell.rect)}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Gutters are drawn by the grid itself, not by margins on the cells. The `fr`
 * algorithm subtracts every gutter from the container's content box first and
 * shares out only what is left, so `cols * track + (cols - 1) * gap` still
 * equals the container exactly: the gap comes out of the tracks, it never makes
 * the grid wider. A gap large enough to consume the whole container leaves the
 * tracks at zero and the gutters overflow, so keep it small next to
 * `container / cols`.
 */
function gapStyle(gap: number): CSSProperties {
  if (!Number.isFinite(gap) || gap <= 0) return {};
  return { gap: `${gap}px` };
}

/**
 * Under `strictRatio` the cell keeps its declared shape and sits centred in the
 * track area it was given, leaving the slack empty. `aspect-ratio` says that
 * without anyone computing a pixel box for it.
 */
function strictRatioStyle(item: GridItem, strict: boolean): CSSProperties {
  if (!strict) return {};
  return { aspectRatio: String(item.ratio), placeSelf: "center", maxWidth: "100%", maxHeight: "100%" };
}
