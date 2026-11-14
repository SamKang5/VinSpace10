/**
 * Types describing the M2-02 navigation grid export
 * (`exports/M2_02/navigation_grid.json` and `grid_metadata.json`).
 *
 * RESEARCH/DEMO DATA — NOT FOR OPERATIONAL MARS NAVIGATION.
 *
 * Terminology notes that must not be lost in the frontend:
 * - `cost` is the source's dimensionless per-cell movement friction. It is
 *   NOT a physical energy, time, speed, distance or safety measurement.
 * - `validDataMask` (supported) means image footprint + 3x3 DEM support per
 *   the D07 pipeline. It does NOT mean traversable or safe.
 * - `blockedMask` means a data-supported slope hazard class 3 (slope >= 15
 *   degrees), an illustrative research threshold, not a validated hazard.
 * - `null` cost means "excluded from routing" (unknown or blocked). It never
 *   means a free or cheap cell, and unknown cells must never be filled.
 */

/** A cell's routing cost: finite friction, or null when unknown/blocked. */
export type CellCost = number | null;

/** Mask values exactly as exported: 0 or 1 (plain JSON numbers, not booleans). */
export type MaskValue = 0 | 1;

/** Flat row-major grid arrays; index `i = row * width + col`, rows increase southward. */
export interface NavigationGrid {
  readonly schemaVersion: "1.0";
  readonly width: number;
  readonly height: number;
  readonly cost: readonly CellCost[];
  readonly validDataMask: readonly MaskValue[];
  readonly blockedMask: readonly MaskValue[];
}

/** GDAL-style geotransform parameters in the order a, b, c, d, e, f. */
export interface GridAffine {
  readonly order: "a,b,c,d,e,f";
  readonly values: readonly [number, number, number, number, number, number];
  readonly maps: string;
}

/** CRS identity of the export: Mars 2000 spherical equirectangular metres. */
export interface GridCrs {
  readonly name: string;
  readonly wkt: string;
  readonly radiusMeters: number;
}

/** Cell counts declared by the export and cross-checked against the arrays. */
export interface GridStatistics {
  readonly total: number;
  readonly supported: number;
  readonly unknown: number;
  readonly blocked: number;
  readonly finiteCost: number;
}

/** Provenance entry for one upstream source raster. */
export interface GridSourceFile {
  readonly filename: string;
  readonly sha256: string;
  readonly nodata: number;
}

export interface GridMetadata {
  readonly schemaVersion: "1.0";
  readonly width: number;
  readonly height: number;
  readonly layout: "row-major";
  readonly crs: GridCrs;
  readonly affine: GridAffine;
  /** [west, south, east, north] in Mars 2000 equirectangular projected metres. */
  readonly bounds: readonly [number, number, number, number];
  readonly resolutionProjectedMeters: readonly [number, number];
  readonly statistics: GridStatistics;
  readonly sourceFiles: Readonly<Record<string, GridSourceFile>>;
  readonly sourceManifestSha256: string;
  readonly sourceProvenance: Readonly<Record<string, { readonly sha256: string }>>;
  readonly sourcePolicy: Readonly<Record<string, string>>;
  readonly limitations: readonly string[];
}

/** One cell as returned by the model, with derived booleans for convenience. */
export interface GridCell {
  readonly row: number;
  readonly col: number;
  /** Flat row-major index: `row * width + col`. */
  readonly index: number;
  readonly cost: CellCost;
  /** validDataMask === 1 (image footprint + 3x3 DEM support). Not "safe". */
  readonly supported: boolean;
  /** blockedMask === 1 (supported slope hazard class 3). */
  readonly blocked: boolean;
  /** May participate in routing: supported and not blocked. */
  readonly traversable: boolean;
}

/** A point in Mars 2000 spherical equirectangular PROJECTED metres, not WGS84 lon/lat. */
export interface ProjectedPoint {
  readonly x: number;
  readonly y: number;
}
