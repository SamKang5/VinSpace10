// Mars 2000 sphere geometry and grid affine helpers.
//
// The navigation grid and the CTX orthomosaic share the same CRS (Mars 2000
// spherical equirectangular, EPSG:9001/9122), so one affine describes both.

export const MARS_RADIUS_M = 3396190;

/** Grid cell size in projected metres. */
export const CELL_M = 20;

/** Navigation grid dimensions. */
export const GRID_WIDTH = 267;
export const GRID_HEIGHT = 267;

/** Grid origin: the west edge of column 0 and the north edge of row 0. */
export const GRID_ORIGIN_X = 4582523.250853;
export const GRID_ORIGIN_Y = 1095993.140188;

/**
 * Projected metres of the centre of cell (row, col).
 *
 * The M2-03 coordinate contract puts a cell centre half a cell past its
 * corner: `x = originX + 20 * (col + 0.5)`, `y = originY - 20 * (row + 0.5)`.
 */
export function cellToProjected(row: number, col: number): { x: number; y: number } {
  return {
    x: GRID_ORIGIN_X + CELL_M * (col + 0.5),
    y: GRID_ORIGIN_Y - CELL_M * (row + 0.5),
  };
}

/** Planetocentric latitude/longitude in radians for a projected position. */
export function projectedToLatLon(x: number, y: number): { lat: number; lon: number } {
  return { lat: y / MARS_RADIUS_M, lon: x / MARS_RADIUS_M };
}

/**
 * Great-circle distance in metres between two projected positions.
 *
 * East-west spacing on the ground is wider than the projected spacing away
 * from the equator, so the spherical metric is used for both edge weights and
 * the heuristic. Using one metric for both keeps the heuristic admissible.
 */
export function greatCircle(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const p = projectedToLatLon(a.x, a.y);
  const q = projectedToLatLon(b.x, b.y);
  const dLat = q.lat - p.lat;
  const dLon = q.lon - p.lon;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(p.lat) * Math.cos(q.lat) * Math.sin(dLon / 2) ** 2;
  return 2 * MARS_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
