// Convert the M2-02 navigation grid JSON into a compact binary the browser can
// parse with a single ArrayBuffer read.
//
// The JSON is 1.5 MB because every one of the 71,289 cells is spelled out in
// decimal. The binary keeps the same three arrays at 6 bytes per cell.
//
// Layout (little endian):
//   header  : u32 width, u32 height, u32 version
//   cost    : f32[width*height]      -- NaN marks blocked or unknown
//   mask    : u8[width*height]       -- 1 = supported, 0 = unknown
//   blocked : u8[width*height]       -- 1 = slope-policy blocked
//
// Usage: node scripts/build-grid-bin.mjs <grid.json> <out.bin>

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [SRC, OUT] = process.argv.slice(2);
if (!SRC || !OUT) {
  console.error('usage: node scripts/build-grid-bin.mjs <grid.json> <out.bin>');
  process.exit(1);
}

const grid = JSON.parse(readFileSync(SRC, 'utf8'));
const { width, height } = grid;
const n = width * height;

if (grid.cost.length !== n || grid.validDataMask.length !== n || grid.blockedMask.length !== n) {
  console.error('grid arrays do not match the declared dimensions');
  process.exit(1);
}

const header = Buffer.alloc(12);
header.writeUInt32LE(width, 0);
header.writeUInt32LE(height, 4);
header.writeUInt32LE(1, 8);

const cost = Buffer.alloc(n * 4);
for (let i = 0; i < n; i += 1) {
  const c = grid.cost[i];
  cost.writeFloatLE(c === null ? Number.NaN : c, i * 4);
}

const mask = Buffer.alloc(n);
for (let i = 0; i < n; i += 1) mask[i] = grid.validDataMask[i];

const blocked = Buffer.alloc(n);
for (let i = 0; i < n; i += 1) blocked[i] = grid.blockedMask[i];

const out = Buffer.concat([header, cost, mask, blocked]);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out);

const nulls = grid.cost.reduce((a, c) => a + (c === null ? 1 : 0), 0);
console.log(
  `wrote ${OUT}: ${width}x${height}, ${nulls} blocked/unknown cells, ` +
    `${(out.length / 1024).toFixed(0)} KB (JSON was ${(readFileSync(SRC).length / 1024).toFixed(0)} KB)`,
);
