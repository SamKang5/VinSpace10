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
// published grid metadata, and EVERY served payload — the grid binary, the
// terrain image, the overlay rasters and all metadata JSON — is downloaded
// once as bytes, SHA-256 hashed, and compared against
// public/terrain/asset_manifest.json AND the pinned accepted digests in
// src/lib/acceptedAssets.ts. The bytes that are hashed are the bytes that
// are parsed, so the app can never route or render unverified content.

import { GRID_HEIGHT, GRID_WIDTH } from './geo.ts';
import { parseGridMetadata, type GridMetadata } from './navigationGrid/index.ts';
import { NODATA, slopeFromCost, type GridPoint, type RoutingGrid } from './router.ts';
import { ACCEPTED_CTX_SOURCE_SHA256, ACCEPTED_TERRAIN_ASSETS } from './acceptedAssets.ts';

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
  /**
   * The SHA-256-verified terrain PNG bytes. The map must render the image
   * from a Blob URL over exactly these bytes — never a second fetch of the
   * origin URL, whose response could differ from what was verified.
   */
  terrainImage: { readonly bytes: ArrayBuffer; readonly sha256: string; readonly mimeType: 'image/png' };
}

export class AssetVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetVerificationError';
  }
}

/**
 * Where the data lives. Kept in one place so the merge can repoint it.
 *
 * The optional chaining keeps this module importable from the Node check
 * script, where `import.meta.env` does not exist.
 */
export function assetUrls(base: string = `${import.meta.env?.BASE_URL ?? './'}`) {
  const b = base.replace(/\/+$/, '');
  return {
    grid: `${b}/terrain/navigation_grid.bin`,
    gridMetadata: `${b}/terrain/grid_metadata.json`,
    meta: `${b}/terrain/ctx-aoi-meta.json`,
    elevation: `${b}/terrain/elevation.bin`,
    hazard: `${b}/terrain/hazard.bin`,
    overlayMetadata: `${b}/terrain/overlay_metadata.json`,
    manifest: `${b}/terrain/asset_manifest.json`,
  } as const;
}

export const DATA_URLS = assetUrls();

/** SHA-256 of bytes via WebCrypto (browser and Node >= 20). */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

interface AssetManifest {
  schemaVersion: string;
  files: Record<string, string>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parse and structurally validate the served asset manifest. */
function parseAssetManifest(raw: unknown): AssetManifest {
  if (!isPlainObject(raw)) {
    throw new AssetVerificationError('asset_manifest.json must be a JSON object');
  }
  if (raw['schemaVersion'] !== '1.0') {
    throw new AssetVerificationError(
      `asset_manifest.json schemaVersion must be "1.0", got ${JSON.stringify(raw['schemaVersion'])}`,
    );
  }
  const filesRaw = raw['files'];
  if (!isPlainObject(filesRaw) || Object.keys(filesRaw).length === 0) {
    throw new AssetVerificationError('asset_manifest.json "files" must be a non-empty object');
  }
  const files: Record<string, string> = {};
  for (const [filename, digest] of Object.entries(filesRaw)) {
    if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest)) {
      throw new AssetVerificationError(
        `asset_manifest.json digest for "${filename}" must be a 64-char lowercase hex digest`,
      );
    }
    files[filename] = digest;
  }
  return { schemaVersion: '1.0', files };
}

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
 * Load everything the app needs, verify every served byte, and cross-check
 * the payloads against each other and the published metadata.
 *
 * Verification layers (all must pass, fail-closed):
 * 1. The served `asset_manifest.json` must exactly match the pinned accepted
 *    digests in src/lib/acceptedAssets.ts (same file set, same digests) —
 *    replacing both a payload and the manifest is therefore detectable.
 * 2. Every payload is fetched ONCE as bytes, SHA-256 hashed, and compared
 *    against the manifest and the pinned digests. The hashed bytes are the
 *    parsed bytes — there is no second fetch that could diverge.
 * 3. The verified terrain image metadata must declare the accepted CTX
 *    source digest and describe exactly this grid.
 * 4. Content cross-checks: binary dimensions and traversable counts vs the
 *    metadata, raster byte sizes, hazard classes vs the blocked mask.
 *
 * The verified terrain PNG bytes are returned in the result; the app renders
 * the image from a Blob URL over exactly those bytes.
 */
export async function loadAppData(
  signal?: AbortSignal,
  urls: ReturnType<typeof assetUrls> = DATA_URLS,
): Promise<AppData> {
  const fetchBytes = async (url: string): Promise<ArrayBuffer> => {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new AssetVerificationError(`${url} failed to load (HTTP ${response.status})`);
    return response.arrayBuffer();
  };

  const [manifestBytes, binBytes, gridMetadataBytes, metaBytes, elevationBytes, hazardBytes, overlayBytes, pngBytes] =
    await Promise.all([
      fetchBytes(urls.manifest),
      fetchBytes(urls.grid),
      fetchBytes(urls.gridMetadata),
      fetchBytes(urls.meta),
      fetchBytes(urls.elevation),
      fetchBytes(urls.hazard),
      fetchBytes(urls.overlayMetadata),
      fetchBytes(`${urls.manifest.replace(/asset_manifest\.json$/, '')}ctx-jezero-aoi.png`),
    ]);

  // Layer 1: the served manifest must exactly match the pinned accepted
  // digests — same file set, same digests.
  let manifest: AssetManifest;
  try {
    manifest = parseAssetManifest(JSON.parse(new TextDecoder().decode(manifestBytes)));
  } catch (cause) {
    if (cause instanceof AssetVerificationError) throw cause;
    throw new AssetVerificationError(
      `asset_manifest.json is not a usable manifest: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  const issues: string[] = [];
  for (const [filename, expected] of Object.entries(ACCEPTED_TERRAIN_ASSETS)) {
    const served = manifest.files[filename];
    if (served === undefined) {
      issues.push(`accepted file "${filename}" is missing from the served asset manifest`);
    } else if (served !== expected) {
      issues.push(
        `served manifest digest for "${filename}" does not match the accepted reference ` +
          `(${served} != ${expected})`,
      );
    }
  }
  for (const filename of Object.keys(manifest.files)) {
    if (!(filename in ACCEPTED_TERRAIN_ASSETS)) {
      issues.push(`served asset manifest lists unexpected file "${filename}"`);
    }
  }
  if (issues.length > 0) {
    throw new AssetVerificationError(
      `Data package verification failed — refusing to render unverified data:\n  - ${issues.join('\n  - ')}`,
    );
  }

  // Layer 2: every payload's bytes must hash to the accepted digest.
  const payloads: Array<{ label: string; filename: string; bytes: ArrayBuffer }> = [
    { label: 'navigation grid binary', filename: 'navigation_grid.bin', bytes: binBytes },
    { label: 'grid metadata', filename: 'grid_metadata.json', bytes: gridMetadataBytes },
    { label: 'terrain image', filename: 'ctx-jezero-aoi.png', bytes: pngBytes },
    { label: 'terrain image metadata', filename: 'ctx-aoi-meta.json', bytes: metaBytes },
    { label: 'elevation raster', filename: 'elevation.bin', bytes: elevationBytes },
    { label: 'hazard raster', filename: 'hazard.bin', bytes: hazardBytes },
    { label: 'overlay metadata', filename: 'overlay_metadata.json', bytes: overlayBytes },
  ];
  for (const { label, filename, bytes } of payloads) {
    const actual = await sha256Hex(bytes);
    const expected = manifest.files[filename];
    if (actual !== expected) {
      throw new AssetVerificationError(
        `${label} (${filename}) failed verification: served bytes do not match the accepted digest ` +
          `(${actual} != ${expected})`,
      );
    }
  }

  // The verified bytes are the parsed bytes.
  const decodeJson = (bytes: ArrayBuffer): unknown => JSON.parse(new TextDecoder().decode(bytes));
  const metadata = parseGridMetadata(JSON.parse(new TextDecoder().decode(gridMetadataBytes)));
  const decoded = decodeGrid(binBytes);

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

  const meta = validateTerrainImageMeta(decodeJson(metaBytes));
  const overlay = decodeJson(overlayBytes) as OverlayMeta;

  // The terrain image must describe exactly this grid, be grid-aligned with
  // integer pixels per cell, and declare the accepted CTX source.
  if (meta.image !== 'ctx-jezero-aoi.png') {
    throw new Error(`terrain image metadata names an unexpected image "${meta.image}"`);
  }
  if (meta.width !== GRID_WIDTH * meta.pxPerCell || meta.height !== GRID_HEIGHT * meta.pxPerCell) {
    throw new Error(
      `terrain image is ${meta.width}x${meta.height} but the grid needs ` +
        `${GRID_WIDTH * meta.pxPerCell}x${GRID_HEIGHT * meta.pxPerCell} at ${meta.pxPerCell} px/cell`,
    );
  }
  if (meta.source['sha256'] !== ACCEPTED_CTX_SOURCE_SHA256) {
    throw new Error('terrain image metadata declares a CTX source that is not the accepted mosaic');
  }

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
    terrainImage: { bytes: pngBytes, sha256: manifest.files['ctx-jezero-aoi.png'] ?? '', mimeType: 'image/png' },
  };
}

/**
 * Validate the terrain image metadata fail-closed against the grid
 * constants and the accepted CTX source provenance.
 */
export function validateTerrainImageMeta(raw: unknown): TerrainImageMeta {
  function fail(message: string): never {
    throw new Error(`terrain image metadata is invalid: ${message}`);
  }
  if (!isPlainObject(raw)) fail('expected a JSON object');
  const meta = raw as Record<string, unknown>;

  if (meta['schemaVersion'] !== '1.0') {
    fail(`schemaVersion must be "1.0", got ${JSON.stringify(meta['schemaVersion'])}`);
  }
  if (typeof meta['image'] !== 'string' || !meta['image'].endsWith('.png')) {
    fail(`image must be a .png filename, got ${JSON.stringify(meta['image'])}`);
  }
  const width = meta['width'];
  const height = meta['height'];
  if (typeof width !== 'number' || !Number.isInteger(width) || width < 1) fail('width must be a positive integer');
  if (typeof height !== 'number' || !Number.isInteger(height) || height < 1) fail('height must be a positive integer');

  const pxPerCell = meta['pxPerCell'];
  if (typeof pxPerCell !== 'number' || !Number.isInteger(pxPerCell) || pxPerCell < 1) {
    fail(`pxPerCell must be a positive integer, got ${JSON.stringify(pxPerCell)}`);
  }
  const metersPerPx = meta['metersPerPx'];
  if (typeof metersPerPx !== 'number' || !Number.isFinite(metersPerPx) || metersPerPx <= 0) {
    fail('metersPerPx must be a finite number > 0');
  }

  const grid = meta['grid'];
  if (!isPlainObject(grid)) fail('grid must be an object');
  const gridWidth = grid['width'];
  const gridHeight = grid['height'];
  if (gridWidth !== GRID_WIDTH || gridHeight !== GRID_HEIGHT) {
    fail(`grid must be ${GRID_WIDTH}x${GRID_HEIGHT}, got ${JSON.stringify(gridWidth)}x${JSON.stringify(gridHeight)}`);
  }
  if (grid['cellMeters'] !== 20) fail('grid.cellMeters must be 20');
  if (grid['colOffset'] !== 0 || grid['rowOffset'] !== 0) {
    fail('grid offsets must be 0: the image is grid-aligned by construction');
  }
  for (const key of ['colScale', 'rowScale'] as const) {
    const value = grid[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      fail(`grid.${key} must be a finite number > 0`);
    }
  }

  const source = meta['source'];
  if (!isPlainObject(source)) fail('source must be an object');
  const sourceSha256 = source['sha256'];
  if (typeof sourceSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sourceSha256)) {
    fail('source.sha256 must be a 64-char lowercase hex digest');
  }
  if (sourceSha256 !== ACCEPTED_CTX_SOURCE_SHA256) {
    fail('source.sha256 does not match the accepted CTX orthomosaic');
  }

  return raw as unknown as TerrainImageMeta;
}

/**
 * Convert a position inside the terrain image to a grid cell (M1-04),
 * following the M2-03 coordinate contract:
 *
 * - west/north image edges are INCLUSIVE (pixel 0 is cell column/row 0),
 * - east/south image edges are EXCLUSIVE and are REJECTED, never clamped to
 *   the last cell,
 * - internal pixel boundaries belong to the cell east/south of them
 *   (integer division by pxPerCell, which is exact for integer pixel
 *   coordinates — never `pixel * (1/pxPerCell)`, whose rounding error
 *   misplaces boundary clicks by one cell at 3 px/cell).
 *
 * Non-finite or out-of-bounds points return null; callers must not clamp.
 */
export function imagePixelToGrid(
  meta: TerrainImageMeta,
  pixelX: number,
  pixelY: number,
): GridPoint | null {
  if (!Number.isFinite(pixelX) || !Number.isFinite(pixelY)) return null;
  if (pixelX < 0 || pixelY < 0 || pixelX >= meta.width || pixelY >= meta.height) return null;
  const pxPerCell = meta.pxPerCell;
  if (!Number.isInteger(pxPerCell) || pxPerCell < 1) return null;
  if (meta.grid.colOffset !== 0 || meta.grid.rowOffset !== 0) return null;
  const col = Math.floor(pixelX / pxPerCell);
  const row = Math.floor(pixelY / pxPerCell);
  if (col < 0 || row < 0 || col >= meta.grid.width || row >= meta.grid.height) return null;
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
