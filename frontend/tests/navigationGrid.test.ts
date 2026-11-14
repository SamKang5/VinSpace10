/**
 * Unit tests for the grid parser and the navigation grid model:
 * bounds, blocked/unknown cells, invalid data, and row-major indexing.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  NavigationGridValidationError,
  OutOfBoundsError,
  loadMarsNavigationGrid,
  parseNavigationGrid,
} from "../src/navigationGrid/index.ts";
import { makeGrid, makeMetadata } from "./fixtures.ts";

function loadFixture(): ReturnType<typeof loadMarsNavigationGrid> {
  return loadMarsNavigationGrid(makeGrid() as unknown, makeMetadata() as unknown);
}

// ---------------------------------------------------------------------------
// Parser: valid data and dimension validation
// ---------------------------------------------------------------------------

test("parseNavigationGrid accepts a valid grid and preserves arrays", () => {
  const grid = parseNavigationGrid(makeGrid() as unknown);
  assert.equal(grid.schemaVersion, "1.0");
  assert.equal(grid.width, 3);
  assert.equal(grid.height, 3);
  assert.equal(grid.cost.length, 9);
  assert.equal(grid.validDataMask.length, 9);
  assert.equal(grid.blockedMask.length, 9);
  assert.deepEqual([...grid.cost], [1.5, 2.0, 1.25, 1.1, null, 3.0, null, 1.0, 2.5]);
});

test("parseNavigationGrid rejects non-object payloads", () => {
  for (const bad of [null, undefined, "grid", 42, []]) {
    assert.throws(() => parseNavigationGrid(bad), NavigationGridValidationError);
  }
});

test("parseNavigationGrid rejects wrong schemaVersion", () => {
  const raw = makeGrid() as unknown as Record<string, unknown>;
  raw.schemaVersion = "2.0";
  assert.throws(
    () => parseNavigationGrid(raw),
    (error: NavigationGridValidationError) => error.issues.some((i) => i.includes("schemaVersion")),
  );
});

test("parseNavigationGrid rejects non-integer and non-positive dimensions", () => {
  for (const width of [0, -1, 1.5, Number.NaN, "3", null]) {
    const raw = makeGrid() as unknown as Record<string, unknown>;
    raw.width = width;
    assert.throws(
      () => parseNavigationGrid(raw),
      (error: NavigationGridValidationError) => error.issues.some((i) => i.includes("width")),
      `width=${String(width)} must be rejected`,
    );
  }
});

test("parseNavigationGrid rejects arrays shorter than width*height", () => {
  const raw = makeGrid() as unknown as Record<string, unknown>;
  raw.cost = (raw.cost as unknown[]).slice(0, 8);
  assert.throws(
    () => parseNavigationGrid(raw),
    (error: NavigationGridValidationError) =>
      error.issues.some((i) => i.includes("cost") && i.includes("9 elements")),
  );
});

test("parseNavigationGrid rejects arrays longer than width*height", () => {
  const raw = makeGrid() as unknown as Record<string, unknown>;
  raw.blockedMask = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0];
  assert.throws(() => parseNavigationGrid(raw), /blockedMask/);
});

test("parseNavigationGrid rejects unexpected top-level keys", () => {
  const raw = makeGrid() as unknown as Record<string, unknown>;
  raw.routing = "not part of the schema";
  assert.throws(
    () => parseNavigationGrid(raw),
    (error: NavigationGridValidationError) => error.issues.some((i) => i.includes('"routing"')),
  );
});

// ---------------------------------------------------------------------------
// Parser: cost value validation (finite, friction floor)
// ---------------------------------------------------------------------------

test("parseNavigationGrid rejects non-finite costs (NaN/Infinity)", () => {
  for (const badCost of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const raw = makeGrid() as unknown as Record<string, unknown>;
    (raw.cost as unknown[])[3] = badCost;
    assert.throws(
      () => parseNavigationGrid(raw),
      (error: NavigationGridValidationError) =>
        error.issues.some((i) => i.includes("cost[3]") && i.includes("finite")),
      `cost ${badCost} must be rejected`,
    );
  }
});

test("parseNavigationGrid rejects non-number, non-null costs", () => {
  const raw = makeGrid() as unknown as Record<string, unknown>;
  (raw.cost as unknown[])[2] = "1.25";
  assert.throws(() => parseNavigationGrid(raw), /cost\[2\]/);
});

test("parseNavigationGrid rejects costs below the schema-1.0 friction floor", () => {
  const raw = makeGrid() as unknown as Record<string, unknown>;
  (raw.cost as unknown[])[0] = 0.75;
  assert.throws(
    () => parseNavigationGrid(raw),
    (error: NavigationGridValidationError) =>
      error.issues.some((i) => i.includes("friction floor")),
  );
});

test("parseNavigationGrid accepts the friction floor value 1 exactly", () => {
  const raw = makeGrid() as unknown as Record<string, unknown>;
  (raw.cost as unknown[])[0] = 1;
  const grid = parseNavigationGrid(raw);
  assert.equal(grid.cost[0], 1);
});

// ---------------------------------------------------------------------------
// Parser: mask validation
// ---------------------------------------------------------------------------

test("parseNavigationGrid rejects mask values other than 0 and 1", () => {
  for (const [key, badValue] of [
    ["validDataMask", 2],
    ["blockedMask", -1],
  ] as const) {
    const raw = makeGrid() as unknown as Record<string, unknown>;
    (raw[key] as unknown[])[0] = badValue;
    assert.throws(
      () => parseNavigationGrid(raw),
      (error: NavigationGridValidationError) =>
        error.issues.some((i) => i.includes(`${key}[0]`)),
      `${key}=${String(badValue)} must be rejected`,
    );
  }
  for (const badValue of [true, false, 0.5, "1"]) {
    const raw = makeGrid() as unknown as Record<string, unknown>;
    (raw.validDataMask as unknown[])[1] = badValue;
    assert.throws(
      () => parseNavigationGrid(raw),
      (error: NavigationGridValidationError) => error.issues.some((i) => i.includes("validDataMask[1]")),
      `validDataMask=${String(badValue)} must be rejected`,
    );
  }
});

// ---------------------------------------------------------------------------
// Parser: null semantics
// ---------------------------------------------------------------------------

test("parseNavigationGrid rejects a null cost on a supported unblocked cell", () => {
  const raw = makeGrid() as unknown as Record<string, unknown>;
  (raw.cost as unknown[])[0] = null; // row 0, col 0: supported, unblocked
  assert.throws(
    () => parseNavigationGrid(raw),
    (error: NavigationGridValidationError) =>
      error.issues.some((i) => i.includes("cost[0]") && i.includes("supported and unblocked")),
  );
});

test("parseNavigationGrid rejects a finite cost on a blocked cell", () => {
  const raw = makeGrid() as unknown as Record<string, unknown>;
  (raw.cost as unknown[])[4] = 2.0; // row 1, col 1: blockedMask=1
  assert.throws(
    () => parseNavigationGrid(raw),
    (error: NavigationGridValidationError) =>
      error.issues.some((i) => i.includes("cost[4]") && i.includes("blocked")),
  );
});

test("parseNavigationGrid rejects a finite cost on an unknown cell", () => {
  const raw = makeGrid() as unknown as Record<string, unknown>;
  (raw.cost as unknown[])[6] = 1.5; // row 2, col 0: validDataMask=0
  assert.throws(
    () => parseNavigationGrid(raw),
    (error: NavigationGridValidationError) =>
      error.issues.some((i) => i.includes("cost[6]") && i.includes("unknown")),
  );
});

test("parseNavigationGrid rejects a blocked cell that is not supported", () => {
  const raw = makeGrid() as unknown as Record<string, unknown>;
  (raw.validDataMask as unknown[])[4] = 0;
  assert.throws(
    () => parseNavigationGrid(raw),
    (error: NavigationGridValidationError) =>
      error.issues.some((i) => i.includes("blockedMask[4]") && i.includes("data-supported")),
  );
});

test("parseNavigationGrid accepts null costs on unknown and blocked cells", () => {
  const grid = parseNavigationGrid(makeGrid() as unknown);
  assert.equal(grid.cost[4], null); // blocked
  assert.equal(grid.cost[6], null); // unknown
});

test("parseNavigationGrid reports multiple issues with truncation", () => {
  const raw = makeGrid() as unknown as Record<string, unknown>;
  const cost = raw.cost as unknown[];
  for (let i = 0; i < 9; i += 1) {
    if (cost[i] !== null) cost[i] = Number.NaN;
  }
  try {
    parseNavigationGrid(raw);
    assert.fail("expected NavigationGridValidationError");
  } catch (error) {
    assert.ok(error instanceof NavigationGridValidationError);
    assert.equal(error.issues.length <= 10, true);
  }
});

// ---------------------------------------------------------------------------
// Model: bounds and indexing
// ---------------------------------------------------------------------------

test("cellIndex computes row*width+col and rejects out-of-bounds input", () => {
  const model = loadFixture();
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      assert.equal(model.cellIndex(row, col), row * 3 + col);
    }
  }
  assert.equal(model.cellIndex(0, 0), 0);
  assert.equal(model.cellIndex(2, 2), 8);

  for (const [row, col] of [[-1, 0], [0, -1], [3, 0], [0, 3], [1.5, 0], [0, Number.NaN]]) {
    assert.throws(() => model.cellIndex(row as number, col as number), OutOfBoundsError);
  }
});

test("indexToCell is the inverse of cellIndex", () => {
  const model = loadFixture();
  for (let index = 0; index < 9; index += 1) {
    const { row, col } = model.indexToCell(index);
    assert.equal(model.cellIndex(row, col), index);
  }
  for (const index of [-1, 9, 10, 1.5, Number.NaN]) {
    assert.throws(() => model.indexToCell(index as number), OutOfBoundsError);
  }
});

test("isInside covers exactly rows 0..height-1 and cols 0..width-1", () => {
  const model = loadFixture();
  assert.equal(model.isInside(0, 0), true);
  assert.equal(model.isInside(2, 2), true);
  assert.equal(model.isInside(3, 0), false);
  assert.equal(model.isInside(0, 3), false);
  assert.equal(model.isInside(-1, 0), false);
  assert.equal(model.isInside(1.5, 1), false);
});

test("getCell returns derived flags and rejects out-of-bounds cells", () => {
  const model = loadFixture();

  const blockedCell = model.getCell(1, 1);
  assert.deepEqual(blockedCell, {
    row: 1,
    col: 1,
    index: 4,
    cost: null,
    supported: true,
    blocked: true,
    traversable: false,
  });

  const unknownCell = model.getCell(2, 0);
  assert.equal(unknownCell.cost, null);
  assert.equal(unknownCell.supported, false);
  assert.equal(unknownCell.blocked, false);
  assert.equal(unknownCell.traversable, false);

  const normalCell = model.getCell(0, 2);
  assert.equal(normalCell.cost, 1.25);
  assert.equal(normalCell.traversable, true);
  assert.equal(normalCell.blocked, false);

  for (const [row, col] of [[-1, 0], [3, 0], [0, 3], [0, -1]] as const) {
    assert.throws(() => model.getCell(row, col), OutOfBoundsError);
  }
});

test("getCellByIndex matches getCell via indexToCell", () => {
  const model = loadFixture();
  for (let index = 0; index < 9; index += 1) {
    const { row, col } = model.indexToCell(index);
    const byCoords = model.getCell(row, col);
    const byIndex = model.getCellByIndex(index);
    assert.deepEqual(byIndex, byCoords);
    assert.equal(byIndex.index, index);
  }
  assert.throws(() => model.getCellByIndex(9), OutOfBoundsError);
});

// ---------------------------------------------------------------------------
// Model: traversability of blocked/unknown cells
// ---------------------------------------------------------------------------

test("isTraversable is false for blocked cells and true for supported unblocked cells", () => {
  const model = loadFixture();
  assert.equal(model.isTraversable(1, 1), false); // blocked
  assert.equal(model.isTraversable(2, 0), false); // unknown
  assert.equal(model.isTraversable(0, 0), true);
  assert.equal(model.isTraversable(2, 1), true); // cost exactly 1
  assert.equal(model.isTraversable(1, 2), true);
});

test("isTraversable throws for out-of-bounds cells instead of returning false", () => {
  const model = loadFixture();
  assert.throws(() => model.isTraversable(3, 0), OutOfBoundsError);
  assert.throws(() => model.isTraversable(-1, -1), OutOfBoundsError);
});

// ---------------------------------------------------------------------------
// Model: cross-checks between grid and metadata (fail-closed loading)
// ---------------------------------------------------------------------------

test("loading fails when grid and metadata dimensions disagree", () => {
  const metadata = makeMetadata() as unknown as Record<string, unknown>;
  metadata.width = 4;
  assert.throws(() => loadMarsNavigationGrid(makeGrid() as unknown, metadata), /dimensions/);
});

test("loading fails when statistics disagree with the grid arrays", () => {
  const metadata = makeMetadata() as unknown as Record<string, unknown>;
  (metadata.statistics as Record<string, unknown>).blocked = 5;
  assert.throws(() => loadMarsNavigationGrid(makeGrid() as unknown, metadata), /statistics\.blocked/);
});

test("loading fails when the affine does not reproduce the declared bounds", () => {
  const metadata = makeMetadata() as unknown as Record<string, unknown>;
  metadata.bounds = [100, 170, 135, 200]; // east should be 130 for width 3, a=10
  assert.throws(() => loadMarsNavigationGrid(makeGrid() as unknown, metadata), /bounds/);
});

test("loading fails when axis resolution disagrees with the affine", () => {
  const metadata = makeMetadata() as unknown as Record<string, unknown>;
  metadata.resolutionProjectedMeters = [15, 10];
  assert.throws(
    () => loadMarsNavigationGrid(makeGrid() as unknown, metadata),
    /resolutionProjectedMeters\[0\]/,
  );
});
