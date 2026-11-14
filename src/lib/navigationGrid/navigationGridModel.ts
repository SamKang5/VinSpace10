/**
 * The verified, queryable navigation grid used by the MARS NAVIGATOR frontend.
 *
 * A model can only be created from a parsed {@link NavigationGrid} plus a
 * parsed {@link GridMetadata} that agree with each other. Creation fails
 * closed when:
 * - grid and metadata dimensions differ,
 * - the recomputed cell counts (supported / unknown / blocked / finite cost)
 *   disagree with `metadata.statistics`,
 * - the affine does not reproduce `metadata.bounds`,
 * - axis-aligned resolution disagrees with `resolutionProjectedMeters`.
 *
 * Coordinate helpers are exposed because the metadata carries and verifies the
 * full affine + CRS; they are Mars 2000 spherical equirectangular PROJECTED
 * metres, never WGS84 lon/lat.
 *
 * RESEARCH/DEMO DATA: friction is a dimensionless research index (not energy,
 * time or safety); supported/blocked masks encode data availability and an
 * illustrative slope threshold. Nothing here establishes real traversability.
 */

import { OutOfBoundsError } from "./errors.ts";
import { cellCenterToWorld, worldToNearestCell } from "./coordinates.ts";
import type {
  CellCost,
  GridCell,
  GridMetadata,
  GridStatistics,
  MaskValue,
  NavigationGrid,
  ProjectedPoint,
} from "./types.ts";

/** Absolute tolerance (metres) for affine-vs-bounds and resolution checks. */
const METRIC_TOLERANCE = 1e-6;

export interface NavigationGridModel {
  readonly grid: NavigationGrid;
  readonly metadata: GridMetadata;
  readonly width: number;
  readonly height: number;

  /** True when row/col are integers inside the grid. */
  isInside(row: number, col: number): boolean;
  /** True when the flat index is in [0, width*height). */
  isInsideIndex(index: number): boolean;

  /**
   * Flat row-major index `i = row * width + col`. Throws
   * {@link OutOfBoundsError} for non-integer or out-of-range coordinates.
   */
  cellIndex(row: number, col: number): number;
  /** Inverse of {@link cellIndex}. Throws {@link OutOfBoundsError} when out of range. */
  indexToCell(index: number): { readonly row: number; readonly col: number };

  /** Full cell view. Throws {@link OutOfBoundsError} when out of bounds. */
  getCell(row: number, col: number): GridCell;
  getCellByIndex(index: number): GridCell;

  /**
   * May participate in routing: supported (validDataMask=1) and not blocked
   * (blockedMask=0), which is exactly the set of finite-cost cells. Unknown
   * and blocked cells return false, never get filled in, and are excluded by
   * the (future) router per the D07 A* policy. Throws
   * {@link OutOfBoundsError} when out of bounds.
   */
  isTraversable(row: number, col: number): boolean;

  /**
   * Pixel-centre in Mars 2000 equirectangular projected metres:
   * x = a*(col+0.5) + b*(row+0.5) + c; y = d*(col+0.5) + e*(row+0.5) + f.
   * Throws {@link OutOfBoundsError} when out of bounds.
   */
  cellCenter(row: number, col: number): ProjectedPoint;

  /**
   * Nearest cell for a projected point (exact on pixel centres). Throws
   * {@link OutOfBoundsError} when the point maps outside the grid and
   * {@link SingularAffineError} when the affine is not invertible.
   */
  worldToCell(x: number, y: number): { readonly row: number; readonly col: number };
}

interface CellCounts {
  supported: number;
  unknown: number;
  blocked: number;
  finiteCost: number;
}

function countCells(grid: NavigationGrid): CellCounts {
  let supported = 0;
  let unknown = 0;
  let blocked = 0;
  let finiteCost = 0;
  const { cost, validDataMask, blockedMask } = grid;
  for (let i = 0; i < cost.length; i += 1) {
    const valid = validDataMask[i] as MaskValue;
    if (valid === 1) {
      supported += 1;
    } else {
      unknown += 1;
    }
    if ((blockedMask[i] as MaskValue) === 1) {
      blocked += 1;
    }
    if (cost[i] !== null) {
      finiteCost += 1;
    }
  }
  return { supported, unknown, blocked, finiteCost };
}

function expectConsistentStatistics(
  grid: NavigationGrid,
  metadata: GridMetadata,
  counts: CellCounts,
): void {
  const expected: GridStatistics = {
    total: grid.width * grid.height,
    supported: counts.supported,
    unknown: counts.unknown,
    blocked: counts.blocked,
    finiteCost: counts.finiteCost,
  };
  const declared = metadata.statistics;
  const mismatches: string[] = [];
  for (const key of ["total", "supported", "unknown", "blocked", "finiteCost"] as const) {
    if (declared[key] !== expected[key]) {
      mismatches.push(`statistics.${key}: declared ${declared[key]}, computed ${expected[key]}`);
    }
  }
  if (mismatches.length > 0) {
    throw new Error(
      "grid_metadata.json statistics disagree with the navigation grid arrays:\n  - " +
        mismatches.join("\n  - "),
    );
  }
}

function expectAffineMatchesBounds(metadata: GridMetadata): void {
  const [a, , c, , e, f] = metadata.affine.values;
  const [west, south, east, north] = metadata.bounds;
  const width = metadata.width;
  const height = metadata.height;

  const checks: Array<[string, number, number]> = [
    ["west", c, west],
    ["north", f, north],
    ["east", c + a * width, east],
    ["south", f + e * height, south],
  ];
  for (const [name, computed, declared] of checks) {
    if (Math.abs(computed - declared) > METRIC_TOLERANCE) {
      throw new Error(
        `affine does not reproduce metadata.bounds: computed ${name} ${computed} vs declared ${declared} ` +
          `(tolerance ${METRIC_TOLERANCE} m)`,
      );
    }
  }

  const [b, d] = [metadata.affine.values[1], metadata.affine.values[3]];
  const [resX, resY] = metadata.resolutionProjectedMeters;
  if (b === 0 && Math.abs(a - resX) > METRIC_TOLERANCE) {
    throw new Error(
      `affine.a (${a}) does not match resolutionProjectedMeters[0] (${resX}) within ${METRIC_TOLERANCE} m`,
    );
  }
  if (d === 0 && Math.abs(Math.abs(e) - resY) > METRIC_TOLERANCE) {
    throw new Error(
      `|affine.e| (${Math.abs(e)}) does not match resolutionProjectedMeters[1] (${resY}) within ${METRIC_TOLERANCE} m`,
    );
  }
}

/**
 * Build a model from already-parsed, individually validated grid and metadata.
 * Throws when the two files disagree (fail-closed).
 */
export function createNavigationGridModel(
  grid: NavigationGrid,
  metadata: GridMetadata,
): NavigationGridModel {
  if (grid.width !== metadata.width || grid.height !== metadata.height) {
    throw new Error(
      `Grid dimensions ${grid.width}x${grid.height} do not match metadata dimensions ` +
        `${metadata.width}x${metadata.height}`,
    );
  }
  expectConsistentStatistics(grid, metadata, countCells(grid));
  expectAffineMatchesBounds(metadata);

  const width = grid.width;
  const height = grid.height;
  const size = width * height;
  const { cost, validDataMask, blockedMask } = grid;

  function requireCellCoords(row: number, col: number, what: string): number {
    if (!Number.isInteger(row) || !Number.isInteger(col)) {
      throw new OutOfBoundsError(
        `${what}: row and col must be integers, got row=${row}, col=${col}`,
        { row, col },
      );
    }
    if (row < 0 || row >= height || col < 0 || col >= width) {
      throw new OutOfBoundsError(
        `${what}: cell (row=${row}, col=${col}) is outside the ${width}x${height} grid ` +
          `(rows 0..${height - 1}, cols 0..${width - 1})`,
        { row, col },
      );
    }
    return row * width + col;
  }

  function buildCell(index: number): GridCell {
    // Parsed-and-validated arrays have exactly `size` elements, so index is
    // always populated here; callers bound-check first.
    const cellCost = cost[index] as CellCost;
    const valid = validDataMask[index] as MaskValue;
    const blocked = blockedMask[index] as MaskValue;
    const supported = valid === 1;
    const isBlocked = blocked === 1;
    return {
      row: Math.floor(index / width),
      col: index % width,
      index,
      cost: cellCost,
      supported,
      blocked: isBlocked,
      traversable: supported && !isBlocked,
    };
  }

  return {
    grid,
    metadata,
    width,
    height,

    isInside(row, col) {
      return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && row < height && col >= 0 && col < width;
    },
    isInsideIndex(index) {
      return Number.isInteger(index) && index >= 0 && index < size;
    },

    cellIndex(row, col) {
      return requireCellCoords(row, col, "cellIndex");
    },
    indexToCell(index) {
      if (!Number.isInteger(index) || index < 0 || index >= size) {
        throw new OutOfBoundsError(
          `indexToCell: index ${index} is outside [0, ${size})`,
          { index },
        );
      }
      return { row: Math.floor(index / width), col: index % width };
    },

    getCell(row, col) {
      const index = requireCellCoords(row, col, "getCell");
      return buildCell(index);
    },
    getCellByIndex(index) {
      if (!Number.isInteger(index) || index < 0 || index >= size) {
        throw new OutOfBoundsError(
          `getCellByIndex: index ${index} is outside [0, ${size})`,
          { index },
        );
      }
      return buildCell(index);
    },

    isTraversable(row, col) {
      const index = requireCellCoords(row, col, "isTraversable");
      // Null semantics were validated at parse time: finite cost is exactly
      // the supported-unblocked set. Check the mask expression anyway so this
      // helper stays correct even if callers hand-build grids.
      const supported = (validDataMask[index] as MaskValue) === 1;
      const blocked = (blockedMask[index] as MaskValue) === 1;
      return supported && !blocked && cost[index] !== null;
    },

    cellCenter(row, col) {
      requireCellCoords(row, col, "cellCenter");
      return cellCenterToWorld(metadata.affine, row, col);
    },

    worldToCell(x, y) {
      const cell = worldToNearestCell(metadata.affine, x, y);
      if (cell.row < 0 || cell.row >= height || cell.col < 0 || cell.col >= width) {
        throw new OutOfBoundsError(
          `worldToCell: projected point (${x}, ${y}) maps to (row=${cell.row}, col=${cell.col}), ` +
            `outside the ${width}x${height} grid`,
          { row: cell.row, col: cell.col },
        );
      }
      return cell;
    },
  };
}
