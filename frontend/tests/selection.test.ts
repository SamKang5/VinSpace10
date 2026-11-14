/**
 * Click-to-grid selection tests against the REAL served data (M2-02 +
 * M2-04), verifying the M2-03 coordinate contract: reference endpoints,
 * inclusive west/north and exclusive east/south footprint edges, internal
 * edge ownership, blocked/unsupported rejection, and never clamping.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { loadMarsNavigationGrid } from "../src/navigationGrid/index.ts";
import { parseImageryMetadata } from "../src/app/imagery.ts";
import {
  cellCenterImagePoint,
  imageToProjected,
  selectCellAtImagePoint,
  type CellSelection,
} from "../src/app/selection.ts";
import { loadRealFixtures, makeImageryFixture } from "./helpers.ts";
import { makeGrid, makeMetadata } from "./fixtures.ts";

const { model, imagery } = loadRealFixtures();

function expectSelected(selection: CellSelection): asserts selection is Extract<CellSelection, { status: "selected" }> {
  assert.equal(selection.status, "selected", `expected selected, got: ${JSON.stringify(selection)}`);
}

function expectRejected(
  selection: CellSelection,
  reason: "out-of-bounds" | "blocked" | "unsupported" | "invalid-point",
): asserts selection is Extract<CellSelection, { status: "rejected" }> {
  assert.equal(selection.status, "rejected", `expected rejected(${reason}), got: ${JSON.stringify(selection)}`);
  assert.equal(selection.reason, reason);
}

test("reference contract endpoint: image (122, 922) selects [230, 30]", () => {
  const selection = selectCellAtImagePoint(model, imagery, { x: 122, y: 922 });
  expectSelected(selection);
  assert.equal(selection.cell.row, 230);
  assert.equal(selection.cell.col, 30);
  assert.equal(selection.cell.index, 230 * 267 + 30);
  assert.equal(selection.cell.cost, 1.6363859176635742);
  // Declared projected centre from the handoff: (4583133.250853, 1091383.140188).
  assert.ok(Math.abs(selection.projected.x - 4583133.250853) < 1e-6);
  assert.ok(Math.abs(selection.projected.y - 1091383.140188) < 1e-6);
});

test("reference contract endpoint: image (942, 142) selects [35, 235]", () => {
  const selection = selectCellAtImagePoint(model, imagery, { x: 942, y: 142 });
  expectSelected(selection);
  assert.equal(selection.cell.row, 35);
  assert.equal(selection.cell.col, 235);
  assert.equal(selection.cell.index, 35 * 267 + 235);
  assert.equal(selection.cell.cost, 1.1645629405975342);
  assert.ok(Math.abs(selection.projected.x - 4587233.250853) < 1e-6);
  assert.ok(Math.abs(selection.projected.y - 1095283.140188) < 1e-6);
});

test("cell centre image coordinates match the contract formula (4*col+2, 4*row+2)", () => {
  const a = cellCenterImagePoint(imagery, { row: 230, col: 30, index: 61440 });
  assert.deepEqual(a, { x: 122, y: 922 });
  const b = cellCenterImagePoint(imagery, { row: 35, col: 235, index: 9580 });
  assert.deepEqual(b, { x: 942, y: 142 });
});

test("footprint edges: west and north inclusive, east and south exclusive", () => {
  // West edge (image x = 0) maps into col 0; north edge (y = 0) into row 0.
  // The NW corner cell [0, 0] is blocked in the real data, so inclusion is
  // asserted via the blocked rejection carrying the cell identity.
  const nw = selectCellAtImagePoint(model, imagery, { x: 0, y: 0 });
  expectRejected(nw, "blocked");
  assert.equal(nw.cell?.row, 0);
  assert.equal(nw.cell?.col, 0);

  const westEdge = selectCellAtImagePoint(model, imagery, { x: 0, y: 922 });
  assert.equal(westEdge.cell?.col, 0);
  assert.equal(westEdge.cell?.row, 230);

  const northEdge = selectCellAtImagePoint(model, imagery, { x: 122, y: 0 });
  assert.equal(northEdge.cell?.row, 0);
  assert.equal(northEdge.cell?.col, 30);

  // East edge (x = 1068) and south edge (y = 1068) are excluded outright.
  expectRejected(selectCellAtImagePoint(model, imagery, { x: 1068, y: 142 }), "out-of-bounds");
  expectRejected(selectCellAtImagePoint(model, imagery, { x: 122, y: 1068 }), "out-of-bounds");
  expectRejected(selectCellAtImagePoint(model, imagery, { x: 1068, y: 1068 }), "out-of-bounds");
});

test("the outer half-pixel strip belongs to the last row/column, not out of bounds", () => {
  const lastCol = selectCellAtImagePoint(model, imagery, { x: 1067.999, y: 142 });
  assert.equal(lastCol.cell?.col, 266);
  assert.equal(lastCol.cell?.row, 35);

  const lastRow = selectCellAtImagePoint(model, imagery, { x: 122, y: 1067.999 });
  assert.equal(lastRow.cell?.row, 266);
  assert.equal(lastRow.cell?.col, 30);
});

test("internal image boundaries belong to the cell east/south of them", () => {
  // x = 120 is the boundary between cols 29 and 30 (4 px per cell).
  const verticalEdge = selectCellAtImagePoint(model, imagery, { x: 120, y: 922 });
  assert.equal(verticalEdge.cell?.col, 30);
  // y = 920 is the boundary between rows 229 and 230.
  const horizontalEdge = selectCellAtImagePoint(model, imagery, { x: 122, y: 920 });
  assert.equal(horizontalEdge.cell?.row, 230);
});

test("out-of-bounds clicks are rejected, never clamped to the closest cell", () => {
  const eastOutside = selectCellAtImagePoint(model, imagery, { x: 1075, y: -3 });
  expectRejected(eastOutside, "out-of-bounds");
  assert.equal(eastOutside.cell, null);
  assert.ok(eastOutside.detail.includes("never clamped"));

  const westOutside = selectCellAtImagePoint(model, imagery, { x: -0.001, y: 500 });
  expectRejected(westOutside, "out-of-bounds");
  assert.equal(westOutside.cell, null);

  const southOutside = selectCellAtImagePoint(model, imagery, { x: 500, y: 1068.5 });
  expectRejected(southOutside, "out-of-bounds");
  assert.equal(southOutside.cell, null);

  const northOutside = selectCellAtImagePoint(model, imagery, { x: 500, y: -0.001 });
  expectRejected(northOutside, "out-of-bounds");
  assert.equal(northOutside.cell, null);
});

test("non-finite clicks are rejected as invalid points", () => {
  expectRejected(selectCellAtImagePoint(model, imagery, { x: Number.NaN, y: 100 }), "invalid-point");
  expectRejected(selectCellAtImagePoint(model, imagery, { x: 100, y: Number.POSITIVE_INFINITY }), "invalid-point");
});

test("blocked cells are rejected for selection but report their data", () => {
  // Image (2, 2) is the centre of the blocked north-west corner cell [0, 0].
  const selection = selectCellAtImagePoint(model, imagery, { x: 2, y: 2 });
  expectRejected(selection, "blocked");
  assert.equal(selection.cell?.row, 0);
  assert.equal(selection.cell?.col, 0);
  assert.equal(selection.cell?.blocked, true);
  assert.equal(selection.cell?.cost, null);
});

test("unsupported (unknown) cells are rejected and never filled in", () => {
  // Synthetic 3x3 fixture: unknown cell at (2, 0), 1 px per cell, so its
  // centre is the image point (0.5, 2.5).
  const grid = loadMarsNavigationGrid(makeGrid() as unknown, makeMetadata() as unknown);
  const fixtureImagery = makeImageryFixture();
  const selection = selectCellAtImagePoint(grid, fixtureImagery, { x: 0.5, y: 2.5 });
  expectRejected(selection, "unsupported");
  assert.equal(selection.cell?.row, 2);
  assert.equal(selection.cell?.col, 0);
  assert.equal(selection.cell?.supported, false);
  assert.equal(selection.cell?.cost, null);
});

test("the M2-03 floor conversion agrees with the loader's worldToCell", () => {
  // For this north-up axis-aligned export, nearest-centre rounding (with
  // ties toward the larger index) must agree with the contract's floor
  // division at every probed point.
  const probePoints: Array<{ x: number; y: number }> = [
    { x: 122, y: 922 },
    { x: 942, y: 142 },
    { x: 120, y: 920 }, // internal boundaries
    { x: 0.001, y: 0.001 },
    { x: 1067.999, y: 1067.999 },
    { x: 500.377, y: 213.123 },
  ];
  for (let i = 0; i < 200; i += 1) {
    probePoints.push({ x: (i * 937) % 1068, y: (i * 613) % 1068 });
  }
  for (const point of probePoints) {
    const selection = selectCellAtImagePoint(model, imagery, point);
    const projected = imageToProjected(imagery, point);
    if (selection.status === "selected" || selection.reason === "blocked" || selection.reason === "unsupported") {
      const viaWorld = model.worldToCell(projected.x, projected.y);
      assert.equal(
        viaWorld.row === selection.cell?.row && viaWorld.col === selection.cell?.col,
        true,
        `floor/nearest-centre disagreement at image (${point.x}, ${point.y})`,
      );
    } else {
      assert.throws(() => model.worldToCell(projected.x, projected.y), `expected OOB at (${point.x}, ${point.y})`);
    }
  }
});
