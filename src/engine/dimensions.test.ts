import { describe, expect, it } from "vitest";

import { idealDimensions } from "./dimensions.js";

const CONTAINER = { width: 1200, height: 800 };
const CONTAINER_AREA = CONTAINER.width * CONTAINER.height;

/** Area and ratio are the two things the function promises to preserve. */
function expectAreaAndRatio(
  box: { width: number; height: number },
  area: number,
  ratio: number,
): void {
  expect(box.width * box.height).toBeCloseTo(area, 6);
  expect(box.width / box.height).toBeCloseTo(ratio, 10);
}

describe("idealDimensions", () => {
  it("splits area evenly when all weights are equal", () => {
    const items = [1, 1, 1, 1];
    const total = items.reduce((sum, w) => sum + w, 0);
    const expectedArea = CONTAINER_AREA / items.length;

    const boxes = items.map((weight) =>
      idealDimensions(weight, total, CONTAINER.width, CONTAINER.height, 16 / 9),
    );

    for (const box of boxes) {
      expectAreaAndRatio(box, expectedArea, 16 / 9);
    }
    // Equal weight and equal ratio means identical boxes.
    for (const box of boxes) {
      expect(box).toEqual(boxes[0]);
    }
    // The shares still add up to the whole container.
    const totalArea = boxes.reduce((sum, b) => sum + b.width * b.height, 0);
    expect(totalArea).toBeCloseTo(CONTAINER_AREA, 6);
  });

  it("gives a dominant weight almost all the area", () => {
    const items = [9, 1, 1, 1];
    const total = items.reduce((sum, w) => sum + w, 0);

    const boxes = items.map((weight) =>
      idealDimensions(weight, total, CONTAINER.width, CONTAINER.height, 4 / 3),
    );

    const [hero, ...rest] = boxes;
    expect(hero).toBeDefined();
    if (hero === undefined) return;

    expectAreaAndRatio(hero, (9 / 12) * CONTAINER_AREA, 4 / 3);
    for (const box of rest) {
      expectAreaAndRatio(box, (1 / 12) * CONTAINER_AREA, 4 / 3);
      // 9x the weight is 9x the area, so 3x each linear dimension.
      expect(hero.width / box.width).toBeCloseTo(3, 10);
      expect(hero.height / box.height).toBeCloseTo(3, 10);
    }
  });

  it("scales width and height by the ratio at fixed area", () => {
    const wide = idealDimensions(1, 1, 400, 400, 4);
    const tall = idealDimensions(1, 1, 400, 400, 1 / 4);

    expectAreaAndRatio(wide, 160_000, 4);
    expectAreaAndRatio(tall, 160_000, 1 / 4);
    expect(wide.width).toBeCloseTo(tall.height, 10);
    expect(wide.height).toBeCloseTo(tall.width, 10);
  });

  it("returns a zero box for zero weight or a zero-sized container", () => {
    expect(idealDimensions(0, 4, 1200, 800, 1)).toEqual({ width: 0, height: 0 });
    expect(idealDimensions(1, 4, 0, 800, 1)).toEqual({ width: 0, height: 0 });
    expect(idealDimensions(1, 4, 1200, 0, 1)).toEqual({ width: 0, height: 0 });
  });

  it("rejects invalid arguments", () => {
    expect(() => idealDimensions(1, 0, 1200, 800, 1)).toThrow(RangeError);
    expect(() => idealDimensions(1, 4, 1200, 800, 0)).toThrow(RangeError);
    expect(() => idealDimensions(1, 4, 1200, 800, -2)).toThrow(RangeError);
    expect(() => idealDimensions(-1, 4, 1200, 800, 1)).toThrow(RangeError);
    expect(() => idealDimensions(1, 4, -1200, 800, 1)).toThrow(RangeError);
    expect(() => idealDimensions(1, 4, 1200, 800, NaN)).toThrow(RangeError);
    expect(() => idealDimensions(1, Infinity, 1200, 800, 1)).toThrow(RangeError);
  });
});
