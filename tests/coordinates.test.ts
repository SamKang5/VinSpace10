/**
 * Unit tests for the pixel-centre / corner coordinate conversions defined by
 * the M2-02 README and grid_metadata.json (Mars 2000 equirectangular metres).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SingularAffineError,
  cellCenterToWorld,
  cellCornerToWorld,
  worldToNearestCell,
} from "../src/lib/navigationGrid/index.ts";
import { makeMetadata } from "./fixtures.ts";
import type { GridAffine } from "../src/lib/navigationGrid/types.ts";

const affine: GridAffine = makeMetadata().affine;

test("cellCornerToWorld applies x=a*col+b*row+c, y=d*col+e*row+f", () => {
  // affine [10, 0, 100, 0, -10, 200]
  assert.deepEqual(cellCornerToWorld(affine, 0, 0), { x: 100, y: 200 });
  assert.deepEqual(cellCornerToWorld(affine, 2, 1), { x: 110, y: 180 });
});

test("cellCenterToWorld applies the +0.5 pixel-centre convention", () => {
  // Centre of cell (0,0) is half a pixel inside from the north-west corner.
  assert.deepEqual(cellCenterToWorld(affine, 0, 0), { x: 105, y: 195 });
  assert.deepEqual(cellCenterToWorld(affine, 1, 2), { x: 125, y: 185 });
});

test("cellCenterToWorld matches the README formula symbolically", () => {
  // x = a*(col+0.5) + b*(row+0.5) + c; y = d*(col+0.5) + e*(row+0.5) + f
  const [a, b, c, d, e, f] = affine.values;
  const row = 2;
  const col = 1;
  const expectedX = a * (col + 0.5) + b * (row + 0.5) + c;
  const expectedY = d * (col + 0.5) + e * (row + 0.5) + f;
  assert.equal(cellCenterToWorld(affine, row, col).x, expectedX);
  assert.equal(cellCenterToWorld(affine, row, col).y, expectedY);
});

test("worldToNearestCell inverts cellCenterToWorld exactly on centres", () => {
  for (const [row, col] of [[0, 0], [0, 2], [2, 0], [1, 1], [2, 2]] as const) {
    const { x, y } = cellCenterToWorld(affine, row, col);
    assert.deepEqual(worldToNearestCell(affine, x, y), { row, col });
  }
});

test("worldToNearestCell rounds to the nearest cell centre", () => {
  // Centre of cell (1,1) is (115, 185); a small offset stays on the same cell.
  assert.deepEqual(worldToNearestCell(affine, 115 + 2, 185 - 2), { row: 1, col: 1 });
  // Half-way between centres of columns 1 and 2 (x = 120): tie rounds toward
  // the larger index.
  assert.deepEqual(worldToNearestCell(affine, 120, 185), { row: 1, col: 2 });
});

test("worldToNearestCell throws for singular affine matrices", () => {
  const singular: GridAffine = { ...affine, values: [0, 0, 100, 0, 0, 200] };
  assert.throws(() => worldToNearestCell(singular, 100, 200), SingularAffineError);
});

test("worldToNearestCell boundary rounding: west/north -> index 0, east/south -> width/height", () => {
  // Fixture affine [10,0,100,0,-10,200], bounds [100,170,130,200]. The raw
  // helper performs no bounds checks (that is the model's job); this pins the
  // rounding the model relies on: the west/north edges round down to index 0
  // and the east/south edges round up to width/height, which the model then
  // rejects as out of bounds.
  assert.deepEqual(worldToNearestCell(affine, 100, 200), { row: 0, col: 0 });
  assert.deepEqual(worldToNearestCell(affine, 130, 200), { row: 0, col: 3 });
  assert.deepEqual(worldToNearestCell(affine, 100, 170), { row: 3, col: 0 });
  assert.deepEqual(worldToNearestCell(affine, 130, 170), { row: 3, col: 3 });
  // Outer half-pixel strips stay on the edge cells.
  assert.deepEqual(worldToNearestCell(affine, 120, 195), { row: 0, col: 2 });
});

test("coordinate helpers reject non-finite inputs", () => {
  assert.throws(() => cellCenterToWorld(affine, Number.NaN, 0), RangeError);
  assert.throws(() => cellCornerToWorld(affine, 0, Number.POSITIVE_INFINITY), RangeError);
  assert.throws(() => worldToNearestCell(affine, Number.NaN, 200), RangeError);
});
