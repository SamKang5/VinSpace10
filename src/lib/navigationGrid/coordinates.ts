/**
 * Coordinate conversion for the M2-02 grid, exposed only because the verified
 * metadata carries the complete affine and CRS (checked against bounds at
 * load time by the model). All values are Mars 2000 spherical equirectangular
 * PROJECTED metres, not WGS84 lon/lat degrees.
 *
 * Conventions (M2-02 README + grid_metadata.json):
 * - Corner convention: x = a*col + b*row + c; y = d*col + e*row + f.
 * - Pixel-centre convention: x = a*(col+0.5) + b*(row+0.5) + c;
 *   y = d*(col+0.5) + e*(row+0.5) + f. Rows increase southward, so the
 *   northing decreases as the row index grows (e < 0 for the north-up export).
 * - The inverse below maps projected metres back to the NEAREST cell. It is
 *   exact for points that lie on pixel centres; other points round to the
 *   nearest centre (ties toward the larger index). It is a frontend
 *   convenience derived from the same affine, not an extra source convention.
 */

import { SingularAffineError } from "./errors.ts";
import type { GridAffine, ProjectedPoint } from "./types.ts";

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number, got ${value}`);
  }
}

/** Cell-corner (top-left of the cell) in projected metres, no bounds checks. */
export function cellCornerToWorld(affine: GridAffine, row: number, col: number): ProjectedPoint {
  requireFinite(row, "row");
  requireFinite(col, "col");
  const [a, b, c, d, e, f] = affine.values;
  return { x: a * col + b * row + c, y: d * col + e * row + f };
}

/** Pixel-centre in projected metres, no bounds checks. */
export function cellCenterToWorld(affine: GridAffine, row: number, col: number): ProjectedPoint {
  requireFinite(row, "row");
  requireFinite(col, "col");
  const [a, b, c, d, e, f] = affine.values;
  const u = col + 0.5;
  const v = row + 0.5;
  return { x: a * u + b * v + c, y: d * u + e * v + f };
}

/**
 * Nearest cell for a projected point (inverse of `cellCenterToWorld`),
 * no bounds checks. Throws {@link SingularAffineError} when the 2x2 affine
 * matrix [[a, b], [d, e]] is not invertible.
 */
export function worldToNearestCell(
  affine: GridAffine,
  x: number,
  y: number,
): { readonly row: number; readonly col: number } {
  requireFinite(x, "x");
  requireFinite(y, "y");
  const [a, b, c, d, e, f] = affine.values;
  const det = a * e - b * d;
  if (det === 0 || !Number.isFinite(det)) {
    throw new SingularAffineError(det);
  }
  const u = x - c;
  const v = y - f;
  const colFloat = (e * u - b * v) / det;
  const rowFloat = (a * v - d * u) / det;
  // rowFloat/colFloat are (row + 0.5, col + 0.5) at pixel centres; the
  // nearest centre is round(float - 0.5). Ties round toward the larger
  // index, which is what places the west/north edges on row/col 0.
  return {
    row: normalizeCellIndex(Math.round(rowFloat - 0.5)),
    col: normalizeCellIndex(Math.round(colFloat - 0.5)),
  };
}

/** Collapse the -0 that Math.round(-0.5) produces on the west/north edges. */
function normalizeCellIndex(value: number): number {
  return value === 0 ? 0 : value;
}
