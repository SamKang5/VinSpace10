// Loader for the M2-02 navigation grid and the terrain image metadata.
//
// The grid ships as a compact binary (see scripts/build-grid-bin.mjs) so the
// app downloads 418 KB instead of 1.5 MB and parses it in one read. The CTX
// orthomosaic and the grid are served from the app's own public folder, so the
// viewer works without any network access.
//
// The full export is validated fail-closed at build time by the team's own
// M2-02 loader (src/lib/navigationGrid), so a malformed or drifted export
// fails the build. At runtime the binary is cross-checked against the
// published grid metadata, which is small enough to ship.

import { GRID_HEIGHT, GRID_WIDTH } from './geo.ts';
import { parseGridMetadata, type GridMetadata } from './navigationGrid/index.ts';
import { NODATA, slopeFromCost, type GridPoint, type RoutingGrid } from './router.ts';

export interface TerrainImageMeta {
  schemaVersion: string;
  image: string;
  width: number;
  height: number;
  pxPerCell: number;
  metersPerPx: number;
  grid: {
    width: number;
    height: number;
    cellMeters: number;
    colScale: number;
    rowScale: number;
    colOffset: number;
    rowOffset: number;
  };
  source: Record<string, string>;
}

export interface AppData {
  /** The published grid metadata (CRS, affine, bounds, statistics, limits). */
  metadata: GridMetadata;
  /** The arrays the router needs, decoded from the binary. */
  routing: RoutingGrid;
  meta: TerrainImageMeta;
}

/**
 * Where the data lives. Kept in one place so the merge can repoint it.
 *
 * The optional chaining keeps this module importable from the Node check
 * script, where `import.meta.env` does not exist.
 */
export const DATA_URLS = {
  grid: `${import.meta.env?.BASE_URL ?? './'}terrain/navigation_grid.bin`,
  gridMetadata: `${import.meta.env?.BASE_URL ?? './'}terrain/grid_metadata.json`,
  meta: `${import.meta.env?.BASE_URL ?? './'}terrain/ctx-aoi-meta.json`,
} as const;

/** Decode the binary grid produced by scripts/build-grid-bin.mjs. */
export function decodeGrid(buffer: ArrayBuffer): {
  width: number;
  height: number;
  cost: Float32Array;
  mask: Uint8Array;
} {
  const view = new DataView(buffer);
  const width = view.getUint32(0, true);
  const height = view.getUint32(4, true);
  const version = view.getUint32(8, true);
  if (version !== 1) throw new Error(`unsupported grid binary version ${version}`);

  const n = width * height;
  const costOffset = 12;
  const maskOffset = costOffset + n * 4;

  const cost = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const v = view.getFloat32(costOffset + i * 4, true);
    cost[i] = Number.isNaN(v) ? NODATA : v;
  }

  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) mask[i] = view.getUint8(maskOffset + i);

  // The blocked mask is not needed by the router: blocked and unknown cells
  // both carry the NoData cost, which is exactly what the router excludes.
  return { width, height, cost, mask };
}

/**
 * Load everything the app needs and cross-check it against the published
 * metadata.
 *
 * The counts in `grid_metadata.json` were recomputed from the export when the
 * binary was built, so a mismatch here means the binary and the metadata
 * disagree and the app must not route over it.
 */
export async function loadAppData(signal?: AbortSignal): Promise<AppData> {
  const [binRes, metaRes, gridMetadataRes] = await Promise.all([
    fetch(DATA_URLS.grid, { signal }),
    fetch(DATA_URLS.meta, { signal }),
    fetch(DATA_URLS.gridMetadata, { signal }),
  ]);
  if (!binRes.ok) throw new Error(`navigation grid failed to load (${binRes.status})`);
  if (!metaRes.ok) throw new Error(`terrain metadata failed to load (${metaRes.status})`);
  if (!gridMetadataRes.ok) {
    throw new Error(`grid metadata failed to load (${gridMetadataRes.status})`);
  }

  const metadata = parseGridMetadata(await gridMetadataRes.json());
  const decoded = decodeGrid(await binRes.arrayBuffer());

  if (decoded.width !== GRID_WIDTH || decoded.height !== GRID_HEIGHT) {
    throw new Error(`unexpected grid size ${decoded.width}x${decoded.height}`);
  }
  if (decoded.width !== metadata.width || decoded.height !== metadata.height) {
    throw new Error(
      `navigation grid is ${decoded.width}x${decoded.height} but the metadata declares ` +
        `${metadata.width}x${metadata.height}`,
    );
  }

  // The binary's cell counts must match the published statistics.
  let traversable = 0;
  for (let i = 0; i < decoded.cost.length; i += 1) {
    if (decoded.cost[i] !== NODATA) traversable += 1;
  }
  if (traversable !== metadata.statistics.finiteCost) {
    throw new Error(
      `navigation grid has ${traversable} traversable cells but the metadata declares ` +
        `${metadata.statistics.finiteCost}`,
    );
  }

  const meta = (await metaRes.json()) as TerrainImageMeta;

  return {
    metadata,
    routing: {
      width: decoded.width,
      height: decoded.height,
      cost: decoded.cost,
      slope: slopeFromCost(decoded.cost),
      mask: decoded.mask,
    },
    meta,
  };
}

/**
 * Convert a position inside the terrain image to a grid cell (M1-04).
 *
 * The image is grid-aligned by construction, so the conversion is a scale and
 * a floor. The result is clamped to the grid, and null is returned when the
 * point falls outside the image entirely.
 */
export function imagePixelToGrid(
  meta: TerrainImageMeta,
  pixelX: number,
  pixelY: number,
): GridPoint | null {
  if (pixelX < 0 || pixelY < 0 || pixelX > meta.width || pixelY > meta.height) return null;
  const g = meta.grid;
  const col = Math.min(g.width - 1, Math.max(0, Math.floor(pixelX * g.colScale + g.colOffset)));
  const row = Math.min(g.height - 1, Math.max(0, Math.floor(pixelY * g.rowScale + g.rowOffset)));
  return [row, col];
}

/** Convert a grid cell back to the pixel position of its centre. */
export function gridToImagePixel(meta: TerrainImageMeta, point: GridPoint): { x: number; y: number } {
  const g = meta.grid;
  return {
    x: (point[1] + 0.5) / g.colScale - g.colOffset,
    y: (point[0] + 0.5) / g.rowScale - g.rowOffset,
  };
}
