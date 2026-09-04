# screen-filling-grid-layout

Lays out a set of items with declared aspect ratios into a React grid that fills its container on both axes, with no leftover strip and no scrolling.

## Install

```
npm install screen-filling-grid-layout
```

## Example

```tsx
import { Grid } from "screen-filling-grid-layout";

const items = [
  { key: "a", ratio: 16 / 9, weight: 2, render: () => <img src="/a.jpg" alt="" /> },
  { key: "b", ratio: 1, render: () => <img src="/b.jpg" alt="" /> },
  { key: "c", ratio: 3 / 4, render: () => <img src="/c.jpg" alt="" /> },
];

export const Wall = () => (
  <div style={{ width: "100vw", height: "100vh" }}>
    <Grid items={items} gap={8} />
  </div>
);
```

The wrapper matters: `Grid` takes the full width and height of whatever element contains it, so that element has to have a size of its own.

## Props

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `items` | `GridItem[]` | required | The tiles to place. See the item table below. |
| `gap` | `number` | `0` | Space in px between adjacent cells, on both axes. Gutters come out of the track sizes, so the grid never grows past its container. |
| `tracks` | `[cols: number, rows: number]` | solver picks | Forces a fixed track count instead of searching for one. Extra tracks stay empty; if the grid is too small to hold every item, the leftover items are dropped and not rendered. |
| `strictRatio` | `boolean` | `false` | When `true`, each cell is inscribed at its item's exact `ratio` and the slack in the track area is left empty. When `false`, cells take the whole track area whatever that does to the ratio. |
| `maxRatioDeviation` | `number` | unbounded | Largest tolerated relative difference between a cell's ratio and its item's `ratio`, as a fraction: `0.1` allows ±10%. Cells outside the band are shrunk to the nearest bound and centred. Ignored when `strictRatio` is `true`. |
| `minCellWidth` | `number` | none | Floor in px on cell width, applied to every item. It caps the column count rather than resizing cells after the fact, so it is best-effort: a floor wider than the container collapses the grid to one column. |
| `overflow` | `"hidden" \| "auto" \| "visible"` | `"hidden"` | CSS `overflow` set on each cell wrapper, for content that ends up larger than its cell. |
| `onItemClick` | `(item: GridItem, rect: Rect) => void` | none | Called when a cell is clicked, with the item and the box it currently occupies. Passing it also sets `cursor: pointer` on every cell. |
| `onItemHover` | `(item: GridItem \| null, rect: Rect \| null) => void` | none | Called with the item when the pointer enters a cell, and with `null` when it leaves. Moving between two cells emits the `null` first. |

Each entry in `items` is a `GridItem`:

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| `key` | `string` | required | Stable identity. Used as the React key and echoed back in `Rect.key`. |
| `ratio` | `number` | required | Intrinsic aspect ratio as width / height, for example `16 / 9`. There is no default; omitting it is a type error. |
| `weight` | `number` | `1` | Relative share of the available area this item claims against its siblings. Higher means a larger cell. |
| `minWidth` | `number` | none | Per-item floor in px on cell width. Takes precedence over `minCellWidth` where it is larger. |
| `render` | `(rect: Rect) => ReactNode` | required | Renders the item's content. `rect` is `{ key, x, y, width, height }` in px, in the container's coordinate space, with gaps already subtracted. |

The solver itself is exported as `computeLayout(items, container, options)`, which returns the `Rect[]` for a container of a given pixel size and takes `gap`, `tracks`, `strictRatio`, `maxRatioDeviation` and `minCellWidth`. It is pure and touches neither React nor the DOM. `computeLayoutPlan` returns the same solve with the chosen track grid and per-item spans kept.

## What this package does not do

It does not measure your content. Every item declares its `ratio` up front; nothing here loads an image, reads a video's dimensions, or waits for a font. If you do not know a ratio until the asset arrives, render the grid once you do.

It does not size itself. The container fills its parent's width and height, and it never grows to fit what it contains. A parent with no height of its own gives you a grid with no height.

It does not guarantee that visual order matches array order. The solver tries several item orderings and keeps the one whose cells match the declared ratios best, so an item can land in a different cell than its position in `items` suggests. There is no prop to pin the order.

It does not virtualize. Every item in `items` is rendered on every layout, so a few hundred tiles is the working range, not a few thousand.

It has no breakpoints and reads no media queries. The only input is the container's own box, watched with a single `ResizeObserver`; the same grid in a narrow panel and a wide one gets a different layout because the box differs, not because a breakpoint fired.

It does not animate. A layout change is a re-render into the new grid, with no transition between the two.

It provides no interaction beyond `onItemClick` and `onItemHover`. There is no dragging, no reordering, no resize handles, no selection state, and no keyboard navigation.

It ships no stylesheet and no theme. The only styles it writes are the inline layout properties on the container and cell wrappers. Everything inside a cell is yours to style.
