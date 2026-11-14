/**
 * Click-to-grid selection pipeline (M1-03), implementing the M2-03
 * coordinate contract exactly:
 *
 * 1. Convert the clicked IMAGE pixel to projected metres through the M2-04
 *    image affine (forward mapping: x = a*pixelX + b*pixelY + c,
 *    y = d*pixelX + e*pixelY + f).
 * 2. Apply the projected footprint guard: xmin <= x < xmax and
 *    ymin < y <= ymax. West/north edges are inclusive; east/south edges are
 *    exclusive. Non-finite and out-of-bounds points are REJECTED, never
 *    clamped to the closest cell.
 * 3. Convert to grid indices with the contract's floor division
 *    (col = floor((x - xmin) / 20), row = floor((ymax - y) / 20), derived
 *    from the verified grid affine so internal edges belong to the cell
 *    east/south of them).
 * 4. Read the cell from the verified loader model and reject blocked and
 *    unsupported (unknown) cells for routing selection; the cell's data is
 *    still reported so the UI can explain the rejection.
 *
 * The pure functions here are deliberately DOM-free so the whole click
 * contract is unit-testable; the React layer only converts screen points to
 * image points via mapTransform.ts.
 *
 * RESEARCH/DEMO DATA — the image is a display background and must never be
 * used to infer traversability; traversability comes only from the grid masks.
 */

import type { GridCell, ProjectedPoint } from "../navigationGrid/types.ts";
import type { NavigationGridModel } from "../navigationGrid/navigationGridModel.ts";
import type { ImageryMetadata } from "./imagery.ts";
import type { Point } from "./mapTransform.ts";

export interface GridCellRef {
  readonly row: number;
  readonly col: number;
  readonly index: number;
}

export type CellSelection =
  | {
      readonly status: "selected";
      readonly cell: GridCell;
      readonly projected: ProjectedPoint;
      readonly image: Point;
    }
  | {
      readonly status: "rejected";
      readonly reason: "out-of-bounds" | "blocked" | "unsupported" | "invalid-point";
      readonly detail: string;
      readonly cell: GridCell | null;
      readonly projected: ProjectedPoint | null;
      readonly image: Point;
    };

/** Forward image-affine mapping: continuous image pixels -> projected metres. */
export function imageToProjected(imagery: ImageryMetadata, p: Point): ProjectedPoint {
  const [a, b, c, d, e, f] = imagery.affine.values;
  return { x: a * p.x + b * p.y + c, y: d * p.x + e * p.y + f };
}

/**
 * Continuous image coordinates of a cell centre: (pixelsPerCell*(col+0.5),
 * pixelsPerCell*(row+0.5)) per the M2-04 contract — e.g. (122, 922) for
 * [230, 30] on the 4-px-per-cell image.
 */
export function cellCenterImagePoint(imagery: ImageryMetadata, ref: GridCellRef): Point {
  const [ppcX, ppcY] = imagery.navigationGrid.pixelsPerCell;
  return { x: ppcX * (ref.col + 0.5), y: ppcY * (ref.row + 0.5) };
}

export function cellRefFromCell(cell: GridCell): GridCellRef {
  return { row: cell.row, col: cell.col, index: cell.index };
}

/**
 * Full click pipeline from an IMAGE pixel point (already converted from
 * screen space by the caller, accounting for pan, zoom and CSS scaling).
 * Implements the M2-03 footprint guard and floor conversion; never clamps.
 */
export function selectCellAtImagePoint(
  model: NavigationGridModel,
  imagery: ImageryMetadata,
  imagePoint: Point,
): CellSelection {
  if (!Number.isFinite(imagePoint.x) || !Number.isFinite(imagePoint.y)) {
    return {
      status: "rejected",
      reason: "invalid-point",
      detail: `Click image coordinates must be finite, got (${imagePoint.x}, ${imagePoint.y})`,
      cell: null,
      projected: null,
      image: imagePoint,
    };
  }

  const projected = imageToProjected(imagery, imagePoint);
  if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
    return {
      status: "rejected",
      reason: "invalid-point",
      detail: `Projected coordinates must be finite, got (${projected.x}, ${projected.y})`,
      cell: null,
      projected,
      image: imagePoint,
    };
  }

  // M2-03 footprint guard: west/north inclusive, east/south exclusive.
  const [xmin, ymin, xmax, ymax] = imagery.bounds;
  const insideX = projected.x >= xmin && projected.x < xmax;
  const insideY = projected.y > ymin && projected.y <= ymax;
  if (!insideX || !insideY) {
    return {
      status: "rejected",
      reason: "out-of-bounds",
      detail:
        `Projected point (${projected.x}, ${projected.y}) m is outside the footprint ` +
        `[${xmin}, ${xmax}) x (${ymin}, ${ymax}]; clicks are rejected, never clamped`,
      cell: null,
      projected,
      image: imagePoint,
    };
  }

  // M2-03 floor conversion, derived from the verified grid affine
  // (axis-aligned: b = d = 0, a > 0, e < 0).
  const [ga, gb, , gd, ge] = model.metadata.affine.values;
  if (gb !== 0 || gd !== 0 || ga <= 0 || ge >= 0) {
    return {
      status: "rejected",
      reason: "invalid-point",
      detail: "Grid affine is not the contracted north-up axis-aligned layout; click mapping is not defined",
      cell: null,
      projected,
      image: imagePoint,
    };
  }
  const col = Math.floor((projected.x - xmin) / ga);
  const row = Math.floor((ymax - projected.y) / -ge);

  const cell = model.getCell(row, col);
  if (cell.blocked) {
    return {
      status: "rejected",
      reason: "blocked",
      detail:
        `Cell [${cell.row}, ${cell.col}] is blocked (data-supported slope hazard class 3); ` +
        "blocked cells cannot start or end a route",
      cell,
      projected,
      image: imagePoint,
    };
  }
  if (!cell.supported) {
    return {
      status: "rejected",
      reason: "unsupported",
      detail:
        `Cell [${cell.row}, ${cell.col}] is unknown (no image footprint / 3x3 DEM support); ` +
        "unknown cells are excluded from routing and are never filled in",
      cell,
      projected,
      image: imagePoint,
    };
  }
  return { status: "selected", cell, projected, image: imagePoint };
}
