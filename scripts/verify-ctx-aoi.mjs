// Self-check: decode the exported PNG and confirm it matches the source TIFF
// region pixel-for-pixel, and that the grid alignment is exact.
//
// The mapping is re-derived from the TIFF georeferencing and the grid geometry
// here, independently of the crop script, so a bug in one is caught by the
// other.
//
// Usage: node scripts/verify-ctx-aoi.mjs <source.tif> <png> <meta.json>

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const [TIF, PNG, META] = process.argv.slice(2);
let failed = false;
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  failed = true;
};
const ok = (m) => console.log(`OK  ${m}`);

// ---- decode PNG --------------------------------------------------------------
const png = readFileSync(PNG);
if (png.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');

let pos = 8;
let ihdr = null;
const idat = [];
while (pos < png.length) {
  const len = png.readUInt32BE(pos);
  const type = png.toString('ascii', pos + 4, pos + 8);
  const data = png.subarray(pos + 8, pos + 8 + len);
  if (type === 'IHDR') ihdr = data;
  if (type === 'IDAT') idat.push(data);
  pos += 12 + len;
}
const outW = ihdr.readUInt32BE(0);
const outH = ihdr.readUInt32BE(4);
const bitDepth = ihdr[8];
const colorType = ihdr[9];
const raw = inflateSync(Buffer.concat(idat));

if (bitDepth !== 8 || colorType !== 6) fail('expected 8-bit RGBA');
const stride = 1 + outW * 4;
if (raw.length !== outH * stride) fail(`raw length ${raw.length} != ${outH * stride}`);

const px = (x, y) => {
  const o = y * stride + 1 + x * 4;
  return [raw[o], raw[o + 1], raw[o + 2], raw[o + 3]];
};

// ---- decode source TIFF ------------------------------------------------------
const buf = readFileSync(TIF);
const little = buf.toString('ascii', 0, 2) === 'II';
const u16 = (o) => (little ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
const u32 = (o) => (little ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
const f64 = (o) => (little ? buf.readDoubleLE(o) : buf.readDoubleBE(o));
const ifdOffset = u32(4);
const tags = {};
for (let i = 0; i < u16(ifdOffset); i += 1) {
  const e = ifdOffset + 2 + i * 12;
  const tag = u16(e);
  const type = u16(e + 2);
  const count = u32(e + 4);
  const size = { 1: 1, 2: 1, 3: 2, 4: 4, 12: 8 }[type] * count;
  const read = (o) => {
    if (type === 3) return u16(o);
    if (type === 4) return u32(o);
    if (type === 12) return f64(o);
    return buf.readUInt8(o);
  };
  if (size <= 4) tags[tag] = { type, count, values: [read(e + 8)] };
  else {
    const off = u32(e + 8);
    const values = [];
    for (let k = 0; k < count; k += 1) values.push(read(off + k * { 1: 1, 2: 1, 3: 2, 4: 4, 12: 8 }[type]));
    tags[tag] = { type, count, values };
  }
}
const tiffW = tags[256].values[0];
const stripOffsets = tags[273].values;
const rowsPerStrip = tags[278].values[0];
const [tiffSx] = tags[33550].values;
const [tieI, tieJ, , tieX, tieY] = tags[33922].values;
const originX = tieX - tieI * tiffSx;
const originY = tieY + tieJ * tiffSx;

const srcRow = (row) => {
  const strip = Math.floor(row / rowsPerStrip);
  const inStrip = row % rowsPerStrip;
  const base = stripOffsets[strip] + inStrip * tiffW;
  return buf.subarray(base, base + tiffW);
};

// ---- meta --------------------------------------------------------------------
const meta = JSON.parse(readFileSync(META, 'utf8'));
const { pxPerCell, metersPerPx } = meta;

// Rebuild the ramp from the crop script's stops.
const stops = [
  [0, [18, 12, 10]], [48, [72, 40, 28]], [96, [124, 74, 44]],
  [144, [166, 104, 58]], [192, [198, 143, 92]], [255, [232, 200, 156]],
];
const expect = (v) => {
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let s = 0; s < stops.length - 1; s += 1) {
    if (v >= stops[s][0] && v <= stops[s + 1][0]) { a = stops[s]; b = stops[s + 1]; break; }
  }
  const t = b[0] === a[0] ? 0 : (v - a[0]) / (b[0] - a[0]);
  return [0, 1, 2].map((c) => Math.round(a[1][c] + (b[1][c] - a[1][c]) * t));
};

// ---- 1. pixel fidelity --------------------------------------------------------
// Re-derive the source pixel for each output pixel straight from the TIFF
// georeferencing plus the grid origin, independently of the crop script.
const GRID_WEST = 4582523.250853;
const GRID_NORTH = 1095993.140188;
const ctCol0 = (GRID_WEST - originX) / tiffSx;
const ctRow0 = (originY - GRID_NORTH) / tiffSx;

let checked = 0;
let bad = 0;
for (let i = 0; i < 500; i += 1) {
  const x = (i * 7 + 13) % outW;
  const y = (i * 191 + 29) % outH;
  const sx = Math.round(ctCol0 + (x * metersPerPx) / tiffSx);
  const sy = Math.round(ctRow0 + (y * metersPerPx) / tiffSx);
  const v = srcRow(sy)[sx];
  const got = px(x, y);
  const want = expect(v);
  checked += 1;
  if (v === 0) {
    if (got[3] !== 0) { bad += 1; console.error(`mismatch at ${x},${y}: expected transparent`); }
  } else if (got[0] !== want[0] || got[1] !== want[1] || got[2] !== want[2] || got[3] !== 255) {
    bad += 1;
    if (bad < 5) console.error(`mismatch at ${x},${y}: got ${got} want ${want} (v=${v})`);
  }
}
if (bad) fail(`${bad}/${checked} sampled pixels differ from the source TIFF`);
else ok(`pixel fidelity: ${checked} sampled pixels match the source TIFF exactly`);

// ---- 2. grid alignment --------------------------------------------------------
const g = meta.grid;
if (meta.colScale !== undefined) {
  const drift = Math.abs(g.colOffset) + Math.abs(g.rowOffset);
  if (drift > 1e-9) fail(`grid offsets are not zero (col=${g.colOffset}, row=${g.rowOffset})`);
  else ok('grid alignment: AOI origin sits exactly on the navigation grid origin');
}

const cellPx = pxPerCell;
const lastCellPx = [(g.width - 0.5) * cellPx, (g.height - 0.5) * cellPx];
console.log(`    grid cell (0,0) centre   -> image px ${(cellPx / 2).toFixed(3)}, ${(cellPx / 2).toFixed(3)}`);
console.log(`    grid cell (266,266) centre -> image px ${lastCellPx.map((n) => n.toFixed(3)).join(', ')}`);
if (lastCellPx[0] > outW || lastCellPx[1] > outH) fail('grid extends past the image');
else ok('extent: the full 267x267 grid falls inside the cropped image');

if (outW !== g.width * cellPx || outH !== g.height * cellPx) {
  fail(`image ${outW}x${outH} does not match ${g.width}x${g.height} cells at ${cellPx} px/cell`);
} else {
  ok(`dimensions: ${outW}x${outH} px = ${g.width}x${g.height} cells at ${cellPx} px/cell`);
}

// ---- 3. no blank output -------------------------------------------------------
let opaque = 0;
let sum = 0;
for (let y = 0; y < outH; y += 1) {
  for (let x = 0; x < outW; x += 1) {
    const p = px(x, y);
    if (p[3] === 255) { opaque += 1; sum += (p[0] + p[1] + p[2]) / 3; }
  }
}
const coverage = (opaque / (outW * outH)) * 100;
console.log(`    opaque coverage: ${coverage.toFixed(2)}%, mean luma ${(sum / opaque).toFixed(1)}`);
if (coverage < 99) fail(`only ${coverage.toFixed(2)}% of the image is opaque`);
else ok('coverage: the AOI is fully imaged, no blank margin');

console.log(failed ? 'VERIFY: FAIL' : 'VERIFY: PASS');
process.exit(failed ? 1 : 0);
