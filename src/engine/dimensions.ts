/** The unconstrained width/height a single item wants, before packing. */
export interface IdealDimensions {
  /** Ideal cell width in px. */
  width: number;
  /** Ideal cell height in px. */
  height: number;
}

/**
 * Solves the ideal cell box for one item from its share of the container's
 * area and its intrinsic aspect ratio.
 *
 * The item claims `weight / totalWeight` of `containerWidth * containerHeight`.
 * Given `area` and `ratio = width / height`, substituting `width = ratio *
 * height` into `area = width * height` yields `height = sqrt(area / ratio)` and
 * `width = sqrt(area * ratio)`.
 *
 * Pure. The result satisfies `width * height === area` and `width / height ===
 * ratio`; it ignores gaps, min-widths, and whether the box actually fits, all
 * of which are the packer's problem.
 *
 * @throws RangeError if any argument is not a finite number, if `totalWeight`
 * or `ratio` is not positive, or if `weight` or either container dimension is
 * negative.
 */
export function idealDimensions(
  weight: number,
  totalWeight: number,
  containerWidth: number,
  containerHeight: number,
  ratio: number,
): IdealDimensions {
  assertFinite({ weight, totalWeight, containerWidth, containerHeight, ratio });

  if (totalWeight <= 0) {
    throw new RangeError(`totalWeight must be > 0, got ${totalWeight}`);
  }
  if (ratio <= 0) {
    throw new RangeError(`ratio must be > 0, got ${ratio}`);
  }
  if (weight < 0) {
    throw new RangeError(`weight must be >= 0, got ${weight}`);
  }
  if (containerWidth < 0 || containerHeight < 0) {
    throw new RangeError(
      `container dimensions must be >= 0, got ${containerWidth}x${containerHeight}`,
    );
  }

  const area = (weight / totalWeight) * containerWidth * containerHeight;

  return {
    width: Math.sqrt(area * ratio),
    height: Math.sqrt(area / ratio),
  };
}

function assertFinite(args: Record<string, number>): void {
  for (const [name, value] of Object.entries(args)) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`${name} must be a finite number, got ${value}`);
    }
  }
}
