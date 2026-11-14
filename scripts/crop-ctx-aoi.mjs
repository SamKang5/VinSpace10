// Crop the CTX orthomosaic to the navigation grid AOI and write a web PNG.
//
// The USGS CTX mosaic is an uncompressed 8-bit greyscale TIFF with one strip per
// row, so it can be cropped with plain Node: read the IFD, slice rows, encode a
// PNG with node:zlib.
//
// The output is grid-aligned by construction: PX_PER_CELL image pixels cover
// exactly one navigation cell, so image px -> grid cell is exact with no
// residual offset.
//
// Usage: node scripts/crop-ctx-aoi.mjs <source.tif> <out-dir>

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

const TIF = process.argv[2];
const OUT_DIR = process.argv[3];
if (!TIF || !OUT_DIR) {
  console.error('usage: node scripts/crop-ctx-aoi.mjs <source.tif> <out-dir>');
  process.exit(1);
}

// ---- TIFF reader ------------------------------------------------------------

const buf = readFileSync(TIF);
const little = buf.toString('ascii', 0, 2) === 'II';
const u16 = (o) => (little ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
const u32 = (o) => (little ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
const f64 = (o) => (little ? buf.readDoubleLE(o) : buf.readDoubleBE(o));

const ifdOffset = u32(4);
const entryCount = u16(ifdOffset);
const tags = {};
for (let i = 0; i < entryCount; i += 1) {
  const e = ifdOffset + 2 + i * 12;
  const tag = u16(e);
  const type = u16(e + 2);
  const count = u32(e + 4);
  const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8 }[type] * count;
  const read = (o) => {
    if (type === 3) return u16(o);
    if (type === 4) return u32(o);
    if (type === 12) return f64(o);
    if (type === 2) return buf.toString('ascii', o, o + count);
    return buf.readUInt8(o);
  };
  if (size <= 4) {
    tags[tag] = { type, count, values: [read(e + 8)] };
  } else {
    const off = u32(e + 8);
    const values = [];
    for (let k = 0; k < count; k += 1) {
      values.push(read(off + k * { 1: 1, 2: 1, 3: 2, 4: 4, 12: 8 }[type]));
    }
    tags[tag] = { type, count, values };
  }
}

const width = tags[256].values[0];
const height = tags[257].values[0];
const compression = tags[259].values[0];
const rowsPerStrip = tags[278]?.values[0] ?? height;
const stripOffsets = tags[273].values;
const pixelScale = tags[33550]?.values ?? [];
const tiepoint = tags[33922]?.values ?? [];

if (compression !== 1) throw new Error(`expected uncompressed TIFF, got compression=${compression}`);
if (tags[277].values[0] !== 1) throw new Error('expected 1 sample per pixel');

const [sx, sy] = pixelScale;
const [tieI, tieJ, , tieX, tieY] = tiepoint;
const originX = tieX - tieI * sx; // west edge of mosaic column 0
const originY = tieY + tieJ * sy; // north edge of mosaic row 0

const readRow = (row) => {
  const strip = Math.floor(row / rowsPerStrip);
  const inStrip = row % rowsPerStrip;
  const base = stripOffsets[strip] + inStrip * width;
  return buf.subarray(base, base + width);
};

// ---- AOI from the navigation grid -------------------------------------------
//
// Grid geometry comes from grid_metadata.json: 267 x 267 cells, 20 m each, with
// x = 20*col + 4582523.250853 and y = -20*row + 1095993.140188. The CTX mosaic
// shares the same CRS and 6 m/px sampling, so the AOI is a metre-exact box in
// the mosaic.

const GRID = {
  width: 267,
  height: 267,
  cellMeters: 20,
  westX: 4582523.250853,
  northY: 1095993.140188,
};

const PX_PER_CELL = 3; // image pixels per navigation cell
const outW = GRID.width * PX_PER_CELL;
const outH = GRID.height * PX_PER_CELL;
const metresPerImagePx = GRID.cellMeters / PX_PER_CELL;

// Continuous mosaic pixel coordinates of the AOI origin.
const ctCol0 = (GRID.westX - originX) / sx;
const ctRow0 = (originY - GRID.northY) / sy;

// Nearest source pixel for each output pixel. The step is 1.111 mosaic px per
// output px, so neighbouring output pixels map to distinct source columns and
// the 6 m source resolution is preserved.
const srcCol = new Int32Array(outW);
for (let x = 0; x < outW; x += 1) srcCol[x] = Math.round(ctCol0 + (x * metresPerImagePx) / sx);
const srcRowIdx = new Int32Array(outH);
for (let y = 0; y < outH; y += 1) srcRowIdx[y] = Math.round(ctRow0 + (y * metresPerImagePx) / sy);

console.log(`mosaic       : ${width}x${height} px, ${sx} m/px, origin ${originX}, ${originY}`);
console.log(`AOI in mosaic: col ${ctCol0.toFixed(4)} .. ${(ctCol0 + (outW * metresPerImagePx) / sx).toFixed(4)}`);
console.log(`              row ${ctRow0.toFixed(4)} .. ${(ctRow0 + (outH * metresPerImagePx) / sy).toFixed(4)}`);
console.log(`output       : ${outW}x${outH} px, ${PX_PER_CELL} px per cell, ${metresPerImagePx.toFixed(4)} m/px`);
console.log(`grid mapping : gridCol = imagePx / ${PX_PER_CELL}  (exact)`);

// ---- Colour ramp ------------------------------------------------------------
// CTX mosaics are greyscale; a Mars ochre ramp keeps the relief readable while
// staying a direct remap of the source luminance.

const RAMP = (() => {
  const stops = [
    [0, [18, 12, 10]],
    [48, [72, 40, 28]],
    [96, [124, 74, 44]],
    [144, [166, 104, 58]],
    [192, [198, 143, 92]],
    [255, [232, 200, 156]],
  ];
  const lut = new Uint8Array(256 * 3);
  for (let v = 0; v < 256; v += 1) {
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s += 1) {
      if (v >= stops[s][0] && v <= stops[s + 1][0]) {
        a = stops[s];
        b = stops[s + 1];
        break;
      }
    }
    const t = b[0] === a[0] ? 0 : (v - a[0]) / (b[0] - a[0]);
    for (let c = 0; c < 3; c += 1) {
      lut[v * 3 + c] = Math.round(a[1][c] + (b[1][c] - a[1][c]) * t);
    }
  }
  return lut;
})();

// ---- Sample the AOI ----------------------------------------------------------

const raw = Buffer.alloc(outH * (1 + outW * 4));
let nodata = 0;

for (let py = 0; py < outH; py += 1) {
  const rowBase = py * (1 + outW * 4);
  raw[rowBase] = 0; // PNG filter type: none
  const src = readRow(srcRowIdx[py]);
  const base = rowBase + 1;
  for (let px = 0; px < outW; px += 1) {
    const v = src[srcCol[px]];
    const o = base + px * 4;
    if (v === 0) {
      nodata += 1;
      raw[o] = 0; raw[o + 1] = 0; raw[o + 2] = 0; raw[o + 3] = 0;
    } else {
      raw[o] = RAMP[v * 3];
      raw[o + 1] = RAMP[v * 3 + 1];
      raw[o + 2] = RAMP[v * 3 + 2];
      raw[o + 3] = 255;
    }
  }
}
console.log(`nodata pixels: ${nodata} (${((nodata / (outW * outH)) * 100).toFixed(3)}%)`);

// ---- PNG encoder -------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(bytes) {
  let c = -1;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(outW, 0);
ihdr.writeUInt32BE(outH, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // colour type: RGBA

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(OUT_DIR, { recursive: true });
const outPng = join(OUT_DIR, 'ctx-jezero-aoi.png');
writeFileSync(outPng, png);
console.log(`wrote ${outPng} (${(png.length / 1024).toFixed(0)} KB)`);

// ---- Companion metadata for the viewer --------------------------------------

const meta = {
  schemaVersion: '1.0',
  image: 'ctx-jezero-aoi.png',
  width: outW,
  height: outH,
  pxPerCell: PX_PER_CELL,
  metersPerPx: metresPerImagePx,
  nodataValue: 0,
  colorType: 'RGBA',
  grid: {
    width: GRID.width,
    height: GRID.height,
    cellMeters: GRID.cellMeters,
    // Exact by construction: image px / pxPerCell = grid cell coordinate.
    colScale: 1 / PX_PER_CELL,
    rowScale: 1 / PX_PER_CELL,
    colOffset: 0,
    rowOffset: 0,
  },
  source: {
    file: 'JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif',
    publisher: 'USGS Astrogeology Science Center',
    product: 'Mars 2020 Terrain Relative Navigation Context Camera Orthorectified Image Mosaic',
    url: 'https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0.tif',
    citation: 'doi:10.5066/P9GV1ND3',
    license: 'Public domain (NASA/USGS)',
    sha256: '842b457afee7c2672022b66e3f60be836c6d52e99474015bfd9ced60099b8615',
  },
};
writeFileSync(join(OUT_DIR, 'ctx-aoi-meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
console.log('wrote ctx-aoi-meta.json');
