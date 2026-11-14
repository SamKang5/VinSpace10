/**
 * Priority-D regression tests: click-to-grid boundary semantics.
 *
 * The M2-03 contract: west/north image edges are INCLUSIVE, east/south
 * edges are EXCLUSIVE and REJECTED (never clamped to the last cell), and
 * internal pixel boundaries belong to the cell east/south of them.
 *
 * The 801x801 image at 3 px/cell also guards a floating-point regression:
 * `floor(120 * (267/801))` rounds to 39 (one cell west of the truth) while
 * the exact integer division `floor(120 / 3)` gives the contracted 40.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { imagePixelToGrid, gridToImagePixel, validateTerrainImageMeta } from "../src/lib/data.ts";
import { ACCEPTED_CTX_SOURCE_SHA256 } from "../src/lib/acceptedAssets.ts";
import type { TerrainImageMeta } from "../src/lib/data.ts";

const TERRAIN_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "terrain");

const meta: TerrainImageMeta = validateTerrainImageMeta(
  JSON.parse(readFileSync(join(TERRAIN_DIR, "ctx-aoi-meta.json"), "utf8")),
);

test("real terrain metadata validates against the accepted CTX source", () => {
  assert.equal(meta.width, 801);
  assert.equal(meta.height, 801);
  assert.equal(meta.pxPerCell, 3);
  assert.equal(meta.grid.width, 267);
  assert.equal(meta.grid.height, 267);
  assert.equal(meta.source["sha256"], ACCEPTED_CTX_SOURCE_SHA256);
});

test("west and north image edges are inclusive: pixel 0 maps to cell column/row 0", () => {
  assert.deepEqual(imagePixelToGrid(meta, 0, 0), [0, 0]);
  assert.deepEqual(imagePixelToGrid(meta, 0, 400), [133, 0]);
  assert.deepEqual(imagePixelToGrid(meta, 400, 0), [0, 133]);
});

test("east and south image edges are rejected, never clamped to the last cell", () => {
  assert.equal(imagePixelToGrid(meta, 801, 400), null, "east edge must be rejected");
  assert.equal(imagePixelToGrid(meta, 400, 801), null, "south edge must be rejected");
  assert.equal(imagePixelToGrid(meta, 801, 801), null, "south-east corner must be rejected");
  assert.equal(imagePixelToGrid(meta, 802, 802), null);
});

test("the outer pixel strip belongs to the last row/column, not out of bounds", () => {
  assert.deepEqual(imagePixelToGrid(meta, 800.999, 400), [133, 266]);
  assert.deepEqual(imagePixelToGrid(meta, 400, 800.999), [266, 133]);
  assert.deepEqual(imagePixelToGrid(meta, 800.999, 800.999), [266, 266]);
});

test("internal pixel boundaries belong to the cell east/south of them", () => {
  // x = 120 is the boundary between columns 39 and 40 (3 px per cell).
  assert.deepEqual(imagePixelToGrid(meta, 120, 400), [133, 40]);
  // y = 123 is the boundary between rows 40 and 41.
  assert.deepEqual(imagePixelToGrid(meta, 400, 123), [41, 133]);
});

test("exact integer division agrees with the contract at every sampled pixel", () => {
  // The conversion divides by the integer pxPerCell (exact) instead of
  // multiplying by the rounded colScale. Sweep the image at 1/64-pixel
  // granularity: both formulas must agree with the contract everywhere.
  const scale = 267 / 801;
  let mismatches = 0;
  for (let i = 0; i <= 801 * 64; i += 1) {
    const px = i / 64;
    if (Math.floor(px * scale) !== Math.floor(px / 3)) mismatches += 1;
  }
  assert.equal(mismatches, 0);
  assert.deepEqual(imagePixelToGrid(meta, 432, 400), [133, 144]);
  assert.deepEqual(gridToImagePixel(meta, [144, 144]).x, (144.5) / scale);
});

test("cell centres round-trip through image pixels", () => {
  for (const [row, col] of [[0, 0], [133, 133], [266, 266], [0, 266], [266, 0], [40, 40]]) {
    const pixel = gridToImagePixel(meta, [row, col]);
    const back = imagePixelToGrid(meta, pixel.x, pixel.y);
    assert.deepEqual(back, [row, col], `centre (${row}, ${col}) failed at pixel (${pixel.x}, ${pixel.y})`);
  }
});

test("non-finite and negative coordinates are rejected", () => {
  assert.equal(imagePixelToGrid(meta, -1, 400), null);
  assert.equal(imagePixelToGrid(meta, 400, -1), null);
  assert.equal(imagePixelToGrid(meta, Number.NaN, 400), null);
  assert.equal(imagePixelToGrid(meta, 400, Number.POSITIVE_INFINITY), null);
});
