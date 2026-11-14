// Build the browser assets from the published M2-02 navigation export.
//
// Two jobs:
//   1. Validate the export fail-closed with the team's own M2-02 loader, so a
//      malformed or drifted export fails the build instead of reaching the
//      browser.
//   2. Write the compact binary the app loads (418 KB instead of 1.5 MB), and
//      copy the small grid metadata the app reads at runtime.
//
// Usage: node scripts/build-grid-bin.mjs <grid.json> <out.bin> [metadata.json] [out-meta.json]

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadMarsNavigationGrid } from '../src/lib/navigationGrid/index.ts';

const [SRC, OUT, META_SRC, META_OUT] = process.argv.slice(2);
if (!SRC || !OUT || !META_SRC || !META_OUT) {
  console.error(
    'usage: node scripts/build-grid-bin.mjs <grid.json> <out.bin> <metadata.json> <out-meta.json>',
  );
  process.exit(1);
}

// ---- validate ---------------------------------------------------------------

const grid = JSON.parse(readFileSync(SRC, 'utf8'));
const metadata = JSON.parse(readFileSync(META_SRC, 'utf8'));

// Throws when the grid and the metadata disagree on dimensions, statistics,
// affine or bounds.
const model = loadMarsNavigationGrid(grid, metadata);

const { width, height } = model.grid;
const n = width * height;

const header = Buffer.alloc(12);
header.writeUInt32LE(width, 0);
header.writeUInt32LE(height, 4);
header.writeUInt32LE(1, 8);

const cost = Buffer.alloc(n * 4);
for (let i = 0; i < n; i += 1) {
  const c = model.grid.cost[i];
  cost.writeFloatLE(c === null ? Number.NaN : c, i * 4);
}

const mask = Buffer.alloc(n);
for (let i = 0; i < n; i += 1) mask[i] = model.grid.validDataMask[i];

const blocked = Buffer.alloc(n);
for (let i = 0; i < n; i += 1) blocked[i] = model.grid.blockedMask[i];

const out = Buffer.concat([header, cost, mask, blocked]);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out);

mkdirSync(dirname(META_OUT), { recursive: true });
copyFileSync(META_SRC, META_OUT);

const nulls = model.grid.cost.reduce((a, c) => a + (c === null ? 1 : 0), 0);
console.log(
  `validated ${SRC}: ${width}x${height}, ${nulls} blocked/unknown cells, ` +
    `affine and statistics agree with the metadata`,
);
console.log(
  `wrote ${OUT}: ${(out.length / 1024).toFixed(0)} KB (JSON was ${(readFileSync(SRC).length / 1024).toFixed(0)} KB)`,
);
console.log(`wrote ${META_OUT}`);
