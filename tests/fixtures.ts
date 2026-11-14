/**
 * Synthetic fixtures for loader tests. Independent of the real M2-02 export so
 * that every invalid-data case is reproducible without the 1.5 MB payload.
 */

import type { CellCost, GridMetadata, MaskValue, NavigationGrid } from "../src/lib/navigationGrid/types.ts";

/** 3x3 grid: 8 supported cells, 1 blocked (row 1, col 1), 1 unknown (row 2, col 0). */
export const FIXTURE_WIDTH = 3;
export const FIXTURE_HEIGHT = 3;

export const FIXTURE_COST: CellCost[] = [
  1.5, 2.0, 1.25,
  1.1, null, 3.0,
  null, 1.0, 2.5,
];
export const FIXTURE_VALID: MaskValue[] = [
  1, 1, 1,
  1, 1, 1,
  0, 1, 1,
];
export const FIXTURE_BLOCKED: MaskValue[] = [
  0, 0, 0,
  0, 1, 0,
  0, 0, 0,
];

export function makeGrid(overrides: Partial<Record<string, unknown>> = {}): NavigationGrid {
  return {
    schemaVersion: "1.0",
    width: FIXTURE_WIDTH,
    height: FIXTURE_HEIGHT,
    cost: [...FIXTURE_COST],
    validDataMask: [...FIXTURE_VALID],
    blockedMask: [...FIXTURE_BLOCKED],
    ...(overrides as object),
  } as NavigationGrid;
}

/**
 * Metadata matching the fixture grid: north-up affine a=10, e=-10,
 * c=100, f=200 -> bounds [west=100, south=170, east=130, north=200].
 */
export function makeMetadata(overrides: Partial<Record<string, unknown>> = {}): GridMetadata {
  return {
    schemaVersion: "1.0",
    width: FIXTURE_WIDTH,
    height: FIXTURE_HEIGHT,
    layout: "row-major",
    crs: {
      name: "Mars 2000 sphere equirectangular",
      wkt: "PROJCS[fixture]",
      radiusMeters: 3396190,
    },
    affine: {
      order: "a,b,c,d,e,f",
      values: [10, 0, 100, 0, -10, 200],
      maps: "x=a*col+b*row+c; y=d*col+e*row+f",
    },
    bounds: [100, 170, 130, 200],
    resolutionProjectedMeters: [10, 10],
    statistics: { total: 9, supported: 8, unknown: 1, blocked: 1, finiteCost: 7 },
    sourceFiles: {
      cost: { filename: "movement_cost.tif", sha256: "a".repeat(64), nodata: -9999 },
    },
    sourceManifestSha256: "b".repeat(64),
    sourceProvenance: {
      "fixture/source.tif": { sha256: "c".repeat(64) },
    },
    sourcePolicy: { movement_cost: "fixture friction policy" },
    limitations: ["Research/demo only; not operational navigation or safety."],
    ...(overrides as object),
  } as GridMetadata;
}

export function rawGridFixture(): Record<string, unknown> {
  return makeGrid() as unknown as Record<string, unknown>;
}

export function rawMetadataFixture(): Record<string, unknown> {
  return makeMetadata() as unknown as Record<string, unknown>;
}
