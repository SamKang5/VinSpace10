/**
 * Loader entry points for the MARS NAVIGATOR frontend.
 *
 * Both paths parse and cross-check everything fail-closed; a model is only
 * returned when grid and metadata fully agree (dimensions, statistics,
 * affine-vs-bounds, resolution).
 *
 * RESEARCH/DEMO DATA — not for operational Mars navigation. Friction values
 * are a dimensionless research index, not energy, time or safety.
 */

import { createNavigationGridModel } from "./navigationGridModel.ts";
import { parseGridMetadata } from "./parseGridMetadata.ts";
import { parseNavigationGrid } from "./parseNavigationGrid.ts";
import type { NavigationGridModel } from "./navigationGridModel.ts";

/**
 * Build a model from raw (already-`JSON.parse`d) payloads of
 * `navigation_grid.json` and `grid_metadata.json`. This is the sync path for
 * bundler imports and tests; `fetchMarsNavigationGrid` is the browser path.
 */
export function loadMarsNavigationGrid(
  rawGrid: unknown,
  rawMetadata: unknown,
): NavigationGridModel {
  const grid = parseNavigationGrid(rawGrid);
  const metadata = parseGridMetadata(rawMetadata);
  return createNavigationGridModel(grid, metadata);
}

/**
 * Fetch and load both files from a base URL that serves the M2-02 package,
 * e.g. `fetchMarsNavigationGrid("/data/M2_02")` with the files under
 * `public/data/M2_02/`. Requires `<base>/navigation_grid.json` and
 * `<base>/grid_metadata.json`. Throws on non-2xx responses or invalid data.
 */
export async function fetchMarsNavigationGrid(
  baseUrl: string,
  init?: RequestInit,
): Promise<NavigationGridModel> {
  const gridUrl = `${baseUrl.replace(/\/$/, "")}/navigation_grid.json`;
  const metadataUrl = `${baseUrl.replace(/\/$/, "")}/grid_metadata.json`;

  const [gridResponse, metadataResponse] = await Promise.all([
    fetch(gridUrl, init),
    fetch(metadataUrl, init),
  ]);

  if (!gridResponse.ok) {
    throw new Error(`Failed to fetch navigation grid (${gridUrl}): HTTP ${gridResponse.status}`);
  }
  if (!metadataResponse.ok) {
    throw new Error(`Failed to fetch grid metadata (${metadataUrl}): HTTP ${metadataResponse.status}`);
  }

  let rawGrid: unknown;
  let rawMetadata: unknown;
  try {
    rawGrid = await gridResponse.json();
  } catch (cause) {
    throw new Error(`navigation_grid.json at ${gridUrl} is not valid JSON`, { cause });
  }
  try {
    rawMetadata = await metadataResponse.json();
  } catch (cause) {
    throw new Error(`grid_metadata.json at ${metadataUrl} is not valid JSON`, { cause });
  }

  return loadMarsNavigationGrid(rawGrid, rawMetadata);
}
