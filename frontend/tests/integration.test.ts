/**
 * Integration tests against the real M2-02 export copied into
 * `public/data/M2_02/` (the assets the M1 frontend will actually serve).
 *
 * Verifies the copied files still match the export checksums (after
 * line-ending normalization, so a CRLF checkout does not cause a false
 * drift), then exercises the full load path, indexing, bounds, blocked-cell
 * semantics and coordinate conversion on the real 267x267 grid.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  OutOfBoundsError,
  cellCenterToWorld,
  fetchMarsNavigationGrid,
  loadMarsNavigationGrid,
  parseGridMetadata,
} from "../src/navigationGrid/index.ts";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data", "M2_02");
const GRID_PATH = join(DATA_DIR, "navigation_grid.json");
const METADATA_PATH = join(DATA_DIR, "grid_metadata.json");
const CHECKSUMS_PATH = join(DATA_DIR, "checksums.sha256");

const rawGridText = readFileSync(GRID_PATH, "utf8");
const rawMetadataText = readFileSync(METADATA_PATH, "utf8");
const rawGrid: unknown = JSON.parse(rawGridText);
const rawMetadata: unknown = JSON.parse(rawMetadataText);
const model = loadMarsNavigationGrid(rawGrid, rawMetadata);

/** sha256 of a file after LF-normalizing line endings (JSON-safe drift check). */
function normalizedSha256(path: string): string {
  const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
  return createHash("sha256").update(text).digest("hex");
}

test("copied data assets match every entry of the M2-02 checksum manifest", () => {
  // The served directory mirrors the complete export package: every file the
  // manifest lists must exist here and hash-match. A missing file fails the
  // test instead of being silently skipped.
  const manifest: Array<[string, string]> = [];
  for (const line of readFileSync(CHECKSUMS_PATH, "utf8").split(/\r?\n/)) {
    const match = /^([0-9a-f]{64})\s+(\S+)$/.exec(line.trim());
    if (match) {
      manifest.push([match[2] as string, match[1] as string]);
    }
  }
  assert.equal(manifest.length >= 4, true, "checksums.sha256 lost entries");
  for (const [filename, digest] of manifest) {
    const path = join(DATA_DIR, filename);
    assert.equal(existsSync(path), true, `${filename} is listed in checksums.sha256 but missing from the served copy`);
    assert.equal(
      normalizedSha256(path),
      digest,
      `${filename} drifted from the export checksum`,
    );
  }
  assert.equal(
    manifest.some(([f]) => f === "navigation_grid.json") &&
      manifest.some(([f]) => f === "grid_metadata.json"),
    true,
  );
});

test("real grid parses with the documented dimensions and layout", () => {
  assert.equal(model.width, 267);
  assert.equal(model.height, 267);
  assert.equal(model.grid.cost.length, 267 * 267);
  assert.equal(model.metadata.layout, "row-major");
  assert.equal(model.metadata.crs.name, "Mars 2000 sphere equirectangular");
  assert.equal(model.metadata.crs.radiusMeters, 3396190);
});

test("recomputed counts match the metadata statistics exactly", () => {
  // These are the M2-01/M2-02 evidence numbers; a regression here means the
  // arrays or masks were corrupted.
  assert.equal(model.metadata.statistics.total, 71289);
  assert.equal(model.metadata.statistics.supported, 71289);
  assert.equal(model.metadata.statistics.unknown, 0);
  assert.equal(model.metadata.statistics.blocked, 2907);
  assert.equal(model.metadata.statistics.finiteCost, 68382);

  let blocked = 0;
  let unknown = 0;
  let traversable = 0;
  let minCost = Number.POSITIVE_INFINITY;
  let maxCost = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < model.grid.cost.length; index += 1) {
    const cell = model.getCellByIndex(index);
    if (cell.blocked) blocked += 1;
    if (!cell.supported) unknown += 1;
    if (cell.traversable) {
      traversable += 1;
      assert.equal(cell.cost === null, false);
      const cost = cell.cost as number;
      assert.equal(Number.isFinite(cost), true);
      assert.equal(cost >= 1, true);
      minCost = Math.min(minCost, cost);
      maxCost = Math.max(maxCost, cost);
    } else {
      assert.equal(cell.cost, null);
    }
  }
  assert.equal(blocked, 2907);
  assert.equal(unknown, 0);
  assert.equal(traversable, 68382);
  assert.equal(minCost >= 1, true);
  assert.equal(maxCost > minCost, true);
});

test("blocked and unknown cells are never traversable; supported unblocked cells are", () => {
  let foundBlocked = false;
  let foundTraversable = false;
  for (let index = 0; index < model.grid.cost.length; index += 1) {
    const cell = model.getCellByIndex(index);
    if (cell.blocked) {
      foundBlocked = true;
      assert.equal(model.isTraversable(cell.row, cell.col), false);
      assert.equal(cell.cost, null);
    } else if (cell.supported) {
      foundTraversable = true;
      assert.equal(model.isTraversable(cell.row, cell.col), true);
    }
  }
  assert.equal(foundBlocked, true);
  assert.equal(foundTraversable, true);
});

test("spot checks: first cell is blocked, first supported unblocked cell is (0,12)", () => {
  const first = model.getCell(0, 0);
  assert.equal(first.blocked, true);
  assert.equal(first.supported, true);
  assert.equal(first.traversable, false);
  assert.equal(first.cost, null);

  const cell = model.getCell(0, 12);
  assert.equal(cell.traversable, true);
  assert.equal(cell.index, 12);
  assert.equal(cell.cost, 3.15333890914917); // exact float32->JSON round trip
});

test("row-major indexing: i = row * 267 + col holds across the grid", () => {
  const width = 267;
  const sampleIndices: number[] = [0, 1, 12, 266, 267, 1000, 35644, 71287, 71288];
  for (let index = 0; index < width * width; index += 997) {
    sampleIndices.push(index);
  }
  for (const index of sampleIndices) {
    const { row, col } = model.indexToCell(index);
    assert.equal(row * width + col, index, `index ${index} is not row-major`);
    assert.equal(model.cellIndex(row, col), index);
    assert.equal(model.getCellByIndex(index).index, index);
  }
});

test("out-of-bounds access throws for rows, columns, indices and non-integers", () => {
  for (const [row, col] of [[267, 0], [0, 267], [-1, 0], [0, -1], [300, 300]] as const) {
    assert.throws(() => model.getCell(row, col), OutOfBoundsError, `getCell(${row},${col})`);
    assert.throws(() => model.isTraversable(row, col), OutOfBoundsError, `isTraversable(${row},${col})`);
    assert.throws(() => model.cellIndex(row, col), OutOfBoundsError, `cellIndex(${row},${col})`);
    assert.equal(model.isInside(row, col), false);
  }
  assert.throws(() => model.getCellByIndex(71289), OutOfBoundsError);
  assert.throws(() => model.getCell(1.5, 0), OutOfBoundsError);
});

test("pixel-centre conversion matches the README affine formula on the real metadata", () => {
  const [a, b, c, d, e, f] = model.metadata.affine.values;
  const centre = model.cellCenter(0, 0);
  assert.equal(centre.x, a * 0.5 + b * 0.5 + c);
  assert.equal(centre.y, d * 0.5 + e * 0.5 + f);

  // Half-pixel inset from every edge of the declared bounds.
  const [west, south, east, north] = model.metadata.bounds;
  const last = model.cellCenter(266, 266);
  assert.equal(centre.x > west, true);
  assert.equal(centre.y < north, true);
  assert.equal(last.x < east, true);
  assert.equal(last.y > south, true);
  assert.equal(cellCenterToWorld(model.metadata.affine, 0, 0).x, centre.x);
});

test("worldToCell round trips exactly on real pixel centres", () => {
  const sampleIndices: number[] = [0, 12, 266, 35644, 71288];
  for (let index = 0; index < 71289; index += 4321) {
    sampleIndices.push(index);
  }
  for (const index of sampleIndices) {
    const { row, col } = model.indexToCell(index);
    const { x, y } = model.cellCenter(row, col);
    assert.deepEqual(model.worldToCell(x, y), { row, col }, `round trip failed at index ${index}`);
  }
});

test("worldToCell throws for points projecting outside the grid", () => {
  const [west, south, east, north] = model.metadata.bounds;
  assert.throws(() => model.worldToCell(west - 100, north - 100), OutOfBoundsError);
  assert.throws(() => model.worldToCell(east + 100, south + 100), OutOfBoundsError);
});

test("worldToCell footprint boundaries: west/north edges included, east/south excluded", () => {
  const [west, south, east, north] = model.metadata.bounds;
  // West and north edges map to the first row/col: the corner point (west,
  // north) selects cell (0, 0). Verified exact because bounds west/north are
  // bit-identical to the affine c/f for this export.
  assert.deepEqual(model.worldToCell(west, north), { row: 0, col: 0 });
  assert.deepEqual(model.worldToCell(west, north - 10), { row: 0, col: 0 });
  assert.deepEqual(model.worldToCell(west + 10, north), { row: 0, col: 0 });

  // East and south edges are excluded: they project to col/row == width/height.
  assert.throws(() => model.worldToCell(east, north), OutOfBoundsError);
  assert.throws(() => model.worldToCell(west, south), OutOfBoundsError);
  assert.throws(() => model.worldToCell(east, south), OutOfBoundsError);
  assert.throws(() => model.worldToCell(east, north - 10), OutOfBoundsError);
  assert.throws(() => model.worldToCell(west + 10, south), OutOfBoundsError);
});

test("worldToCell is strict just outside the footprint and inclusive just inside", () => {
  const [west, south, east, north] = model.metadata.bounds;
  const eps = 1e-3;
  const insideCorner = model.worldToCell(west + eps, north - eps);
  assert.equal(model.isInside(insideCorner.row, insideCorner.col), true);
  assert.throws(() => model.worldToCell(west - eps, north - eps), OutOfBoundsError);
  assert.throws(() => model.worldToCell(west + eps, north + eps), OutOfBoundsError);
  // The outer half-pixel strip belongs to the edge cells, not out of bounds.
  assert.deepEqual(model.worldToCell(east - 10, north - 10), { row: 0, col: 266 });
  assert.deepEqual(model.worldToCell(west + 10, south + 10), { row: 266, col: 0 });
  assert.deepEqual(model.worldToCell(east - 10, south + 10), { row: 266, col: 266 });
});

test("worldToCell may select a blocked cell: consumers must gate on isTraversable", () => {
  // Cell selection is geographic, not a routing decision. The NW corner cell
  // is blocked (hazard class 3), so an endpoint derived from it must be
  // rejected by checking isTraversable — this is the fail-closed pattern the
  // future router (M2-03) is required to enforce.
  const nw = model.worldToCell(model.metadata.bounds[0], model.metadata.bounds[3]);
  const cell = model.getCell(nw.row, nw.col);
  assert.equal(cell.blocked, true);
  assert.equal(cell.cost, null);
  assert.equal(model.isTraversable(nw.row, nw.col), false);

  // Contrast: an interior selected cell can be a valid endpoint.
  const centre = model.cellCenter(0, 12);
  const selected = model.worldToCell(centre.x, centre.y);
  assert.equal(model.isTraversable(selected.row, selected.col), true);
});

test("metadata keeps the research limitations and friction policy", () => {
  const parsed = parseGridMetadata(rawMetadata);
  assert.equal(parsed.limitations.length > 0, true);
  const movementPolicy = parsed.sourcePolicy["movement_cost"] ?? "";
  assert.equal(movementPolicy.includes("friction"), true);
  assert.equal(movementPolicy.includes("not speed/time/energy"), true);
});

// ---------------------------------------------------------------------------
// Browser-path loader: fetch over HTTP
// ---------------------------------------------------------------------------

function startStaticServer(root: string): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const filePath = join(root, url.pathname);
      try {
        const body = readFileSync(filePath);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(body);
      } catch {
        response.writeHead(404);
        response.end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

test("fetchMarsNavigationGrid loads the real data over HTTP", async () => {
  const server = await startStaticServer(join(dirname(fileURLToPath(import.meta.url)), "..", "public"));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}/data/M2_02`;
    const fetched = await fetchMarsNavigationGrid(baseUrl);
    assert.equal(fetched.width, 267);
    assert.equal(fetched.height, 267);
    assert.equal(fetched.isTraversable(0, 12), true);
    assert.equal(fetched.isTraversable(0, 0), false);
    assert.equal(fetched.getCell(0, 12).cost, 3.15333890914917);
  } finally {
    server.close();
  }
});

test("fetchMarsNavigationGrid reports HTTP failures clearly", async () => {
  const server = await startStaticServer(join(dirname(fileURLToPath(import.meta.url)), "..", "public"));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const baseUrl = `http://127.0.0.1:${address.port}/data/M2_02_does_not_exist`;
    await assert.rejects(
      () => fetchMarsNavigationGrid(baseUrl),
      /HTTP 404/,
    );
  } finally {
    server.close();
  }
});
