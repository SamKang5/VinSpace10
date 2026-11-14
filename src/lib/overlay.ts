// Slope-class overlay (M2-06 / M4-04).
//
// The D07 hazard raster classifies each cell by slope: class 0 below 5
// degrees, class 1 from 5 to 10, class 2 from 10 to 15, and class 3 at 15
// degrees or above, which is also the blocked set. Because the published
// friction is `1 + (slope/10)^2`, the class follows from the friction the app
// already loads, so no second raster is needed.
//
// The classes are an illustrative research threshold, not a safety rating.

import { NODATA, type RoutingGrid } from './router.ts';

/** Hazard class per cell: 0 below 5 deg, 1 up to 10, 2 up to 15, 3 blocked. */
export type SlopeClass = 0 | 1 | 2 | 3;

/** RGBA per class. Class 0 is transparent so flat ground shows the imagery. */
const CLASS_COLOR: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, 0, 0],
  [230, 195, 90, 65],
  [242, 132, 59, 105],
  [242, 68, 45, 150],
];

/** The slope in degrees that puts a cell in each class. */
export const SLOPE_CLASS_EDGES = [5, 10, 15] as const;

export function slopeClassOf(slopeDeg: number): SlopeClass {
  if (!Number.isFinite(slopeDeg) || slopeDeg >= SLOPE_CLASS_EDGES[2]) return 3;
  if (slopeDeg >= SLOPE_CLASS_EDGES[1]) return 2;
  if (slopeDeg >= SLOPE_CLASS_EDGES[0]) return 1;
  return 0;
}

/**
 * Render the slope classes to an offscreen canvas the size of the grid.
 *
 * The map draws this scaled over the imagery, so the canvas is one pixel per
 * cell and the browser does the scaling.
 */
export function buildSlopeOverlay(grid: RoutingGrid): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = grid.width;
  canvas.height = grid.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const image = ctx.createImageData(grid.width, grid.height);
  for (let i = 0; i < grid.width * grid.height; i += 1) {
    const cost = grid.cost[i];
    const slope = cost === NODATA ? Number.NaN : 10 * Math.sqrt(cost - 1);
    const [r, g, b, a] = CLASS_COLOR[slopeClassOf(slope)];
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = a;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
