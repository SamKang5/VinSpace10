// Loader for the M2-02 navigation grid and the terrain image metadata.
//
// The grid ships as a compact binary (see scripts/build-grid-bin.mjs) so the
// app downloads 418 KB instead of 1.5 MB and parses it in one read. The CTX
// orthomosaic and the grid are served from the app's own public folder, so the
// viewer works without any network access.
//
// The full export is validated fail-closed at build time by the team's own
// M2-02 loader (src/lib/navigationGrid). At runtime the downloaded bytes are
// checked against source-controlled hashes before parsing or routing.

import { GRID_HEIGHT, GRID_WIDTH } from './geo.ts';
import { TERRAIN_SHA256 } from './terrain-pins.ts';
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

export interface OverlayMeta {
  schemaVersion: string;
  width: number;
  height: number;
  layout: string;
  bounds: [number, number, number, number];
  geotransform: number[];
  arrays: string;
  elevation: {
    min: number;
    max: number;
    unit: string;
    datum: string;
  };
  hazard: {
    edges: number[];
    counts: number[];
  };
}

export interface AppData {
  imageBytes: ArrayBuffer;
  /** The published grid metadata (CRS, affine, bounds, statistics, limits). */
  metadata: GridMetadata;
  /** The arrays the router needs, decoded from the binary. */
  routing: RoutingGrid;
  meta: TerrainImageMeta;
  /** The D07 elevation raster, in metres. */
  elevation: Float32Array;
  /** The D07 slope-class raster: 0 below 5 deg, 1 up to 10, 2 up to 15, 3 blocked. */
  hazard: Uint8Array;
  overlay: OverlayMeta;
}

/**
 * Where the data lives. Kept in one place so the merge can repoint it.
 *
 * The optional chaining keeps this module importable from the Node check
 * script, where `import.meta.env` does not exist.
 */
export const DATA_URLS = {
  image: `${import.meta.env?.BASE_URL ?? './'}terrain/ctx-jezero-aoi.png`,
  grid: `${import.meta.env?.BASE_URL ?? './'}terrain/navigation_grid.bin`,
  gridMetadata: `${import.meta.env?.BASE_URL ?? './'}terrain/grid_metadata.json`,
  meta: `${import.meta.env?.BASE_URL ?? './'}terrain/ctx-aoi-meta.json`,
  elevation: `${import.meta.env?.BASE_URL ?? './'}terrain/elevation.bin`,
  hazard: `${import.meta.env?.BASE_URL ?? './'}terrain/hazard.bin`,
  overlayMetadata: `${import.meta.env?.BASE_URL ?? './'}terrain/overlay_metadata.json`,
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

/** Check the exact response body against the digest bundled with the app. */
async function fetchVerified(file: keyof typeof TERRAIN_SHA256, url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${file} failed to load (${response.status})`);
  const bytes = await response.arrayBuffer();
  if (!globalThis.crypto?.subtle) throw new Error('Terrain integrity verification is unavailable.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const actual = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  if (actual !== TERRAIN_SHA256[file]) throw new Error(`Terrain integrity verification failed for ${file}.`);
  return bytes;
}

/** Verify every asset before decoding any routing data. */
export async function loadAppData(signal?: AbortSignal): Promise<AppData> {
  const [gridBytes, metaBytes, gridMetadataBytes, elevationBytes, hazardBytes, overlayBytes, imageBytes] = await Promise.all([
    fetchVerified('navigation_grid.bin', DATA_URLS.grid, signal),
    fetchVerified('ctx-aoi-meta.json', DATA_URLS.meta, signal),
    fetchVerified('grid_metadata.json', DATA_URLS.gridMetadata, signal),
    fetchVerified('elevation.bin', DATA_URLS.elevation, signal),
    fetchVerified('hazard.bin', DATA_URLS.hazard, signal),
    fetchVerified('overlay_metadata.json', DATA_URLS.overlayMetadata, signal),
    fetchVerified('ctx-jezero-aoi.png', DATA_URLS.image, signal),
  ]);
  const json = (bytes: ArrayBuffer) => JSON.parse(new TextDecoder().decode(bytes));
  const metadata = parseGridMetadata(json(gridMetadataBytes));
  const decoded = decodeGrid(gridBytes);

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

  const meta = json(metaBytes) as TerrainImageMeta;
  const overlay = json(overlayBytes) as OverlayMeta;

  // The overlay rasters are the same grid frame as the navigation grid, so a
  // size mismatch means they belong to a different export.
  const cellCount = decoded.width * decoded.height;
  if (elevationBytes.byteLength !== cellCount * 4) {
    throw new Error(
      `elevation raster is ${elevationBytes.byteLength} bytes but the grid has ${cellCount} cells`,
    );
  }
  if (hazardBytes.byteLength !== cellCount) {
    throw new Error(
      `hazard raster is ${hazardBytes.byteLength} bytes but the grid has ${cellCount} cells`,
    );
  }

  const elevation = new Float32Array(elevationBytes);
  const hazard = new Uint8Array(hazardBytes);

  // The hazard class 3 is the blocked set, so it must match the grid's
  // NoData cells exactly. A disagreement means the overlay and the router
  // would disagree about which ground can be crossed.
  let classMismatch = 0;
  for (let i = 0; i < cellCount; i += 1) {
    if ((hazard[i] === 3) !== (decoded.cost[i] === NODATA)) classMismatch += 1;
  }
  if (classMismatch > 0) {
    throw new Error(
      `hazard classes disagree with the navigation grid on ${classMismatch} cells`,
    );
  }

  return {
    metadata,
    imageBytes,
    routing: {
      width: decoded.width,
      height: decoded.height,
      cost: decoded.cost,
      slope: slopeFromCost(decoded.cost),
      mask: decoded.mask,
    },
    meta,
    elevation,
    hazard,
    overlay,
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
