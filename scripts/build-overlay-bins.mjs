// Build the browser assets for the terrain overlay layers (M2-06).
//
// Two jobs:
//   1. Copy the D07 elevation and hazard rasters into public/terrain so the
//      app can show a real elevation tint and the authoritative slope classes.
//   2. Write the small overlay metadata the app reads at runtime: the grid
//      bounds, the elevation range the legend scales to, and the class
//      boundaries.
//
// The check is fail-closed: the rasters must match the grid the app routes
// on, and the hazard classes must agree with the grid's blocked set, so a
// drifted overlay fails the build instead of reaching the browser.
//
// Usage: node scripts/build-overlay-bins.mjs <grid.json> <overlay-dir> <out-dir>

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const [GRID_JSON, OVERLAY_DIR, OUT_DIR] = process.argv.slice(2);
if (!GRID_JSON || !OVERLAY_DIR || !OUT_DIR) {
  console.error(
    'usage: node scripts/build-overlay-bins.mjs <grid.json> <overlay-dir> <out-dir>',
  );
  process.exit(1);
}

// ---- load -------------------------------------------------------------------

const grid = JSON.parse(readFileSync(GRID_JSON, 'utf8'));
const { width, height } = grid;
const n = width * height;

const elevation = readFileSync(join(OVERLAY_DIR, 'elevation.bin'));
const hazard = readFileSync(join(OVERLAY_DIR, 'hazard.bin'));

if (elevation.length !== n * 4) {
  console.error(
    `elevation.bin is ${elevation.length} bytes, expected ${n * 4} for ${width}x${height} Float32`,
  );
  process.exit(1);
}
if (hazard.length !== n) {
  console.error(
    `hazard.bin is ${hazard.length} bytes, expected ${n} for ${width}x${height} Uint8`,
  );
  process.exit(1);
}

// ---- validate against the navigation grid -----------------------------------

const elevationValues = new Float32Array(
  elevation.buffer.slice(elevation.byteOffset, elevation.byteOffset + elevation.byteLength),
);

let elevationMin = Infinity;
let elevationMax = -Infinity;
for (let i = 0; i < n; i += 1) {
  const v = elevationValues[i];
  if (!Number.isFinite(v)) continue;
  if (v < elevationMin) elevationMin = v;
  if (v > elevationMax) elevationMax = v;
}
if (!Number.isFinite(elevationMin) || !Number.isFinite(elevationMax)) {
  console.error('elevation.bin holds no finite values');
  process.exit(1);
}

// The hazard raster carries the D07 slope classes. Class 3 is the blocked set,
// so it must match the grid's blocked mask exactly.
const classCounts = [0, 0, 0, 0];
let blockedMismatch = 0;
for (let i = 0; i < n; i += 1) {
  const cls = hazard[i];
  if (cls > 3) continue; // 255 is unknown; the grid has no unknown cells.
  classCounts[cls] += 1;
  const blockedInGrid = grid.blockedMask[i] === 1;
  if (blockedInGrid !== (cls === 3)) blockedMismatch += 1;
}
if (blockedMismatch > 0) {
  console.error(
    `hazard classes disagree with the grid's blocked mask on ${blockedMismatch} cells`,
  );
  process.exit(1);
}

const metadata = {
  schemaVersion: '1.0',
  width,
  height,
  layout: 'row-major',
  bounds: [4582523.250853, 1090653.140188, 4587863.250853, 1095993.140188],
  geotransform: [4582523.250853, 20, 0, 1095993.140188, 0, -20],
  arrays: 'row-major north to south; Float32 little-endian elevation; uint8 hazard class',
  elevation: {
    min: elevationMin,
    max: elevationMax,
    unit: 'metre',
    datum: 'Mars 2000 sphere',
  },
  hazard: {
    edges: [5, 10, 15],
    counts: classCounts,
  },
  sources: {
    elevation: 'D07_Navigation_Pipeline/web/elevation.bin',
    hazard: 'D07_Navigation_Pipeline/web/hazard.bin',
    note: 'Illustrative research slope classes, not a safety rating.',
  },
};

// ---- write ------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
copyFileSync(join(OVERLAY_DIR, 'elevation.bin'), join(OUT_DIR, 'elevation.bin'));
copyFileSync(join(OVERLAY_DIR, 'hazard.bin'), join(OUT_DIR, 'hazard.bin'));
writeFileSync(join(OUT_DIR, 'overlay_metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);

console.log(
  `wrote ${join(OUT_DIR, 'elevation.bin')} and ${join(OUT_DIR, 'hazard.bin')}: ` +
    `${width}x${height}, elevation ${elevationMin.toFixed(1)}..${elevationMax.toFixed(1)} m, ` +
    `classes ${classCounts.join('/')}`,
);
console.log(`wrote ${join(OUT_DIR, 'overlay_metadata.json')}`);
