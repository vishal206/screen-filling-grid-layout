import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";

import { computeLayoutPlan } from "./engine/computeLayout.js";
import type { GridProps } from "./types.js";

/**
 * Container the solver reasons about for the very first paint, before the
 * observer has reported a real box. The solver reads the container only through
 * its aspect ratio, so this yields a sane grid immediately and the measured size
 * replaces it on the first layout pass.
 */
const NOMINAL = { width: 1600, height: 900 };

/** `useLayoutEffect` on the client, a no-op during server rendering. */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Reports the observed content box of `ref`'s element, or `undefined` until the
 * first measurement lands.
 *
 * One observer, on the container, for the life of the component. It is the only
 * thing in the component that reads layout back out of the DOM, and it reads a
 * single box - not one per item. Sizes are only committed when they actually
 * change, so a resize that rounds to the same box does not re-render.
 */
function useContainerSize(
  ref: RefObject<HTMLDivElement | null>,
): { width: number; height: number } | undefined {
  const [size, setSize] = useState<{ width: number; height: number }>();

  useIsomorphicLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry === undefined) return;

      const { width, height } = entry.contentRect;
      setSize((previous) =>
        previous !== undefined && previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

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
 * A single {@link ResizeObserver} on the container keeps the solved grid honest
 * as the container changes size: the CSS handles the continuous part on its own,
 * but the choice of track counts and spans depends on the container's aspect
 * ratio, and that choice is only correct for the aspect it was made at.
 *
 * `maxRatioDeviation` is honoured by the solver when it shapes spans, but the
 * letterboxing it implies is not drawn.
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
  const container = useRef<HTMLDivElement>(null);
  const measured = useContainerSize(container);

  // Before the first measurement, and for a container collapsed to nothing,
  // fall back to the nominal box so the first paint still has a real grid.
  const box =
    measured !== undefined && measured.width > 0 && measured.height > 0
      ? measured
      : NOMINAL;

  const [forcedCols, forcedRows] = tracks ?? [];
  const plan = useMemo(
    () =>
      computeLayoutPlan(items, box, {
        gap,
        tracks: forcedCols !== undefined && forcedRows !== undefined
          ? [forcedCols, forcedRows]
          : undefined,
        strictRatio,
        maxRatioDeviation,
        minCellWidth,
      }),
    [
      items,
      box.width,
      box.height,
      gap,
      forcedCols,
      forcedRows,
      strictRatio,
      maxRatioDeviation,
      minCellWidth,
    ],
  );

  const byKey = new Map(items.map((item) => [item.key, item]));

  // Whether the solver was asked to hold a shape at all. When it was not, cells
  // take their whole track area and no `aspect-ratio` is emitted.
  const constrained =
    strictRatio ||
    (maxRatioDeviation !== undefined &&
      Number.isFinite(maxRatioDeviation) &&
      maxRatioDeviation >= 0);

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
    <div ref={container} style={containerStyle}>
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
          ...ratioStyle(cell, constrained),
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
 * States the shape the solver settled on - the exact ratio under `strictRatio`,
 * or the nearest bound of `maxRatioDeviation` - as `aspect-ratio` on the
 * wrapper, and centres it in the track area so the slack is left empty.
 *
 * The ratio is taken from the solved rect rather than re-derived, so CSS and
 * {@link computeLayout} agree by construction. No pixel height is ever written
 * to the DOM: `aspect-ratio` derives the height from whatever width the `fr`
 * tracks work out to, at any container size, with no re-measurement.
 */
function ratioStyle(cell: { rect: { width: number; height: number } }, constrained: boolean): CSSProperties {
  if (!constrained) return {};
  const { width, height } = cell.rect;
  if (!(width > 0) || !(height > 0)) return {};

  return {
    aspectRatio: `${width} / ${height}`,
    placeSelf: "center",
    maxWidth: "100%",
    maxHeight: "100%",
  };
}
