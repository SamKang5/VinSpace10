// Loader for the M2 navigation grid, and the pixel-to-grid conversion the map
// viewer uses (M1-04).
//
// The grid ships as a compact binary (see scripts/build-grid-bin.mjs) so the app
// downloads 418 KB instead of 1.5 MB and parses it in one read. The CTX
// orthomosaic and the grid are served from the app's own public folder, so the
// viewer works without any network access.

import type { GridPoint, NavigationGrid } from './router.ts';
import { GRID_HEIGHT, GRID_WIDTH } from './geo.ts';

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
  grid: NavigationGrid;
  meta: TerrainImageMeta;
}

/** Where the data lives. Kept in one place so the merge can repoint it. */
export const DATA_URLS = {
  grid: './terrain/navigation_grid.bin',
  meta: './terrain/ctx-aoi-meta.json',
} as const;

/** Decode the binary grid produced by scripts/build-grid-bin.mjs. */
export function decodeGrid(buffer: ArrayBuffer): NavigationGrid {
  const view = new DataView(buffer);
  const width = view.getUint32(0, true);
  const height = view.getUint32(4, true);
  const version = view.getUint32(8, true);
  if (version !== 1) throw new Error(`unsupported grid binary version ${version}`);

  const n = width * height;
  const costOffset = 12;
  const maskOffset = costOffset + n * 4;
  const blockedOffset = maskOffset + n;

  const cost = new Array<number | null>(n);
  for (let i = 0; i < n; i += 1) {
    const v = view.getFloat32(costOffset + i * 4, true);
    cost[i] = Number.isNaN(v) ? null : v;
  }

  const validDataMask = new Array<0 | 1>(n);
  for (let i = 0; i < n; i += 1) validDataMask[i] = view.getUint8(maskOffset + i) as 0 | 1;

  const blockedMask = new Array<0 | 1>(n);
  for (let i = 0; i < n; i += 1) blockedMask[i] = view.getUint8(blockedOffset + i) as 0 | 1;

  return { schemaVersion: '1.0', width, height, cost, validDataMask, blockedMask };
}

export async function loadAppData(signal?: AbortSignal): Promise<AppData> {
  const [gridRes, metaRes] = await Promise.all([
    fetch(DATA_URLS.grid, { signal }),
    fetch(DATA_URLS.meta, { signal }),
  ]);
  if (!gridRes.ok) throw new Error(`navigation grid failed to load (${gridRes.status})`);
  if (!metaRes.ok) throw new Error(`terrain metadata failed to load (${metaRes.status})`);

  const grid = decodeGrid(await gridRes.arrayBuffer());
  const meta = (await metaRes.json()) as TerrainImageMeta;

  if (grid.width !== GRID_WIDTH || grid.height !== GRID_HEIGHT) {
    throw new Error(`unexpected grid size ${grid.width}x${grid.height}`);
  }
  if (grid.cost.length !== grid.width * grid.height) {
    throw new Error('navigation grid arrays do not match the declared size');
  }

  return { grid, meta };
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
