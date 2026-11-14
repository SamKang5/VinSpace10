/**
 * MARS NAVIGATOR frontend data loader for the M2-02 navigation grid export.
 *
 * RESEARCH/DEMO DATA — NOT FOR OPERATIONAL MARS NAVIGATION.
 * - `cost` is the source's dimensionless per-cell movement friction, NOT a
 *   physical energy, time, speed or safety measurement.
 * - Unknown cells (validDataMask=0) and blocked cells (blockedMask=1, slope
 *   hazard class 3) both carry null cost and are excluded from routing; never
 *   fill them in.
 * - Coordinates are Mars 2000 spherical equirectangular projected metres,
 *   not WGS84 lon/lat.
 * - The D07 A* routing policy is documented in the export but deliberately
 *   NOT implemented here.
 */

export * from "./types.ts";
export * from "./errors.ts";
export * from "./parseNavigationGrid.ts";
export * from "./parseGridMetadata.ts";
export * from "./coordinates.ts";
export * from "./navigationGridModel.ts";
export * from "./loader.ts";
