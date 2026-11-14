/**
 * Routing engine tests (M3-03, M3-04, M3-08).
 *
 * Ported from the team's own D08 prototype test suite
 * (`02_Processed_GIS/D08_AStar_Routing/tests/routing.test.js` and
 * `real_grid.test.js` in the MARS NAVIGATOR data archive) so the app and the
 * source pipeline are held to the same contract:
 *
 *   - M3-03: A* returns the correct path on sample grids.
 *   - M3-04: blocked cells, diagonal corner cuts and unreachable goals are
 *     handled.
 *   - M3-08: the algorithm and its regression cases (blocked, diagonal, same
 *     point, unreachable) are covered.
 *
 * The A* results are checked against an independent Dijkstra oracle that does
 * not call the router, so a bug in one cannot hide the same bug in the other.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  NODATA,
  route,
  slopeFromCost,
  stepDistance,
  type GridPoint,
  type RouteMode,
  type RoutingGrid,
} from '../src/lib/router.ts';
import { decodeGrid } from '../src/lib/data.ts';
import { cellToProjected, greatCircle } from '../src/lib/geo.ts';

/** A synthetic grid with unit friction unless a cost array says otherwise. */
function makeGrid(width: number, height: number, cost?: number[]): RoutingGrid {
  const c = new Float32Array(width * height).fill(1);
  if (cost) {
    for (let i = 0; i < cost.length; i += 1) c[i] = cost[i];
  }
  return {
    width,
    height,
    cost: c,
    slope: slopeFromCost(c),
    mask: new Uint8Array(width * height).fill(1),
  };
}

/**
 * Independent Dijkstra oracle.
 *
 * Deliberately does not call the router's internals: it re-derives the
 * traversability rule and the spherical edge length from scratch, and keeps
 * its own binary heap so it stays fast on the full 71,289 cell grid.
 */
function dijkstra(
  grid: RoutingGrid,
  start: GridPoint,
  end: GridPoint,
  mode: RouteMode,
): number {
  const n = grid.width * grid.height;
  const dist = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const index = (p: GridPoint) => p[0] * grid.width + p[1];
  const valid = (i: number) =>
    grid.mask[i] === 1 &&
    Number.isFinite(grid.cost[i]) &&
    grid.cost[i] >= 1 &&
    Number.isFinite(grid.slope[i]) &&
    grid.slope[i] >= 0 &&
    grid.slope[i] <= 90;

  // A plain binary heap of [distance, cell index].
  const heap: [number, number][] = [];
  const push = (item: [number, number]) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < heap.length && heap[left][0] < heap[smallest][0]) smallest = left;
        if (right < heap.length && heap[right][0] < heap[smallest][0]) smallest = right;
        if (smallest === i) break;
        [heap[smallest], heap[i]] = [heap[i], heap[smallest]];
        i = smallest;
      }
    }
    return top;
  };

  const goal = index(end);
  dist[index(start)] = 0;
  push([0, index(start)]);

  while (heap.length > 0) {
    const [d, u] = pop();
    if (d !== dist[u]) continue;
    if (u === goal) return d;
    const row = Math.floor(u / grid.width);
    const col = u % grid.width;
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        if (dr === 0 && dc === 0) continue;
        const rr = row + dr;
        const cc = col + dc;
        if (rr < 0 || cc < 0 || rr >= grid.height || cc >= grid.width) continue;
        const v = rr * grid.width + cc;
        if (!valid(v)) continue;
        if (dr !== 0 && dc !== 0) {
          if (!valid(row * grid.width + cc) || !valid(rr * grid.width + col)) continue;
        }
        const distance = stepDistance([row, col], [rr, cc]);
        const weight = mode === 'terrain-aware' ? (grid.cost[u] + grid.cost[v]) / 2 : 1;
        const next = d + distance * weight;
        if (next < dist[v]) {
          dist[v] = next;
          push([next, v]);
        }
      }
    }
  }
  return Number.POSITIVE_INFINITY;
}

// ---------------------------------------------------------------------------
// M3-03: A* on sample grids
// ---------------------------------------------------------------------------

test('the same cell gives a one-cell route with no distance', () => {
  const grid = makeGrid(3, 3);
  const result = route(grid, [1, 1], [1, 1], 'shortest');
  assert.equal(result.status, 'ok');
  assert.equal(result.cells, 1);
  assert.equal(result.distanceMeters, 0);
});

test('one orthogonal step measures the great-circle distance', () => {
  const grid = makeGrid(3, 3);
  const result = route(grid, [0, 0], [0, 1], 'shortest');
  assert.equal(result.status, 'ok');
  assert.equal(result.cells, 2);
  assert.ok(Math.abs(result.distanceMeters! - stepDistance([0, 0], [0, 1])) < 1e-9);
});

test('one diagonal step measures the great-circle distance', () => {
  const grid = makeGrid(3, 3);
  const result = route(grid, [0, 0], [1, 1], 'shortest');
  assert.equal(result.status, 'ok');
  assert.equal(result.cells, 2);
  assert.ok(Math.abs(result.distanceMeters! - stepDistance([0, 0], [1, 1])) < 1e-9);
});

test('the A* path is continuous and ends where it was asked to', () => {
  const grid = makeGrid(9, 9);
  const result = route(grid, [0, 0], [8, 8], 'shortest');
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.path[0], [0, 0]);
  assert.deepEqual(result.path[result.path.length - 1], [8, 8]);
  for (let i = 1; i < result.path.length; i += 1) {
    const dr = Math.abs(result.path[i][0] - result.path[i - 1][0]);
    const dc = Math.abs(result.path[i][1] - result.path[i - 1][1]);
    assert.ok(dr + dc === 1 || (dr === 1 && dc === 1), `step ${i} is not adjacent`);
  }
});

test('A* equals an independent Dijkstra on varied seeded grids', () => {
  let seed = 17;
  const rnd = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let k = 0; k < 30; k += 1) {
    const grid = makeGrid(9, 8);
    for (let i = 1; i < grid.cost.length - 1; i += 1) {
      grid.cost[i] = rnd() < 0.18 ? NODATA : 1 + Math.floor(rnd() * 5) / 2;
    }
    grid.slope.set(slopeFromCost(grid.cost));
    for (const mode of ['shortest', 'terrain-aware'] as RouteMode[]) {
      const result = route(grid, [0, 0], [7, 8], mode);
      const expected = dijkstra(grid, [0, 0], [7, 8], mode);
      if (!Number.isFinite(expected)) {
        assert.equal(result.status, 'no_path');
      } else {
        assert.equal(result.status, 'ok');
        assert.ok(
          Math.abs(result.objective! - expected) < 1e-7,
          `${mode}: ${result.objective} != ${expected}`,
        );
      }
    }
  }
});

test('equal-cost routes resolve to the same path every run', () => {
  const grid = makeGrid(5, 5);
  const a = route(grid, [0, 0], [4, 3], 'shortest');
  const b = route(grid, [0, 0], [4, 3], 'shortest');
  assert.deepEqual(a.path, b.path);
});

test('an unknown mode is rejected', () => {
  const grid = makeGrid(3, 3);
  assert.throws(
    () => route(grid, [0, 0], [1, 1], 'bad' as RouteMode),
    /mode must be/,
  );
});

// ---------------------------------------------------------------------------
// M3-04: blocked cells, corner cuts and unreachable goals
// ---------------------------------------------------------------------------

test('out-of-bounds endpoints are rejected', () => {
  const grid = makeGrid(3, 3);
  assert.equal(route(grid, [-1, 0], [1, 1], 'shortest').status, 'out_of_bounds');
  assert.equal(route(grid, [0, 0], [9, 9], 'shortest').status, 'out_of_bounds');
  assert.equal(route(grid, [0.2, 0], [1, 1], 'shortest').status, 'out_of_bounds');
});

test('blocked endpoints are rejected in both modes', () => {
  const grid = makeGrid(2, 2, [1, NODATA, 1, 1]);
  for (const mode of ['shortest', 'terrain-aware'] as RouteMode[]) {
    assert.equal(route(grid, [0, 1], [1, 1], mode).status, 'blocked_endpoint');
  }
});

test('an unsupported cell blocks the endpoint in both modes', () => {
  const grid = makeGrid(2, 2);
  grid.mask[0] = 0;
  for (const mode of ['shortest', 'terrain-aware'] as RouteMode[]) {
    assert.equal(route(grid, [0, 0], [1, 1], mode).status, 'blocked_endpoint');
  }
});

test('a diagonal across a blocked neighbour is refused', () => {
  // The only diagonal from (0,0) to (1,1) is cut by the blocked cell (0,1).
  const grid = makeGrid(3, 3, [1, NODATA, 1, 1, 1, 1, 1, 1, 1]);
  const result = route(grid, [0, 0], [1, 1], 'shortest');
  const cutCorner = result.path.some(
    ([row, col], i) =>
      i > 0 &&
      Math.abs(row - result.path[i - 1][0]) === 1 &&
      Math.abs(col - result.path[i - 1][1]) === 1,
  );
  assert.ok(!cutCorner, JSON.stringify(result.path));
});

test('a fully cut diagonal reports no path', () => {
  const grid = makeGrid(2, 2, [1, NODATA, NODATA, 1]);
  for (const mode of ['shortest', 'terrain-aware'] as RouteMode[]) {
    assert.equal(route(grid, [0, 0], [1, 1], mode).status, 'no_path');
  }
});

test('both modes share the same traversability', () => {
  const grid = makeGrid(3, 1, [1, NODATA, 1]);
  for (const mode of ['shortest', 'terrain-aware'] as RouteMode[]) {
    assert.equal(route(grid, [0, 0], [0, 2], mode).status, 'no_path');
  }
});

test('non-finite data blocks the endpoint in both modes', () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, NODATA, 0]) {
    const grid = makeGrid(2, 1, [1, value]);
    for (const mode of ['shortest', 'terrain-aware'] as RouteMode[]) {
      assert.equal(route(grid, [0, 0], [0, 1], mode).status, 'blocked_endpoint');
    }
  }
});

test('a non-finite slope blocks the endpoint', () => {
  const grid = makeGrid(2, 1);
  grid.slope[1] = Number.NaN;
  assert.equal(route(grid, [0, 0], [0, 1], 'shortest').status, 'blocked_endpoint');
});

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

test('the endpoint friction is averaged once per edge', () => {
  const grid = makeGrid(2, 1, [1, 3]);
  grid.slope.set([2, 6]);
  const result = route(grid, [0, 0], [0, 1], 'terrain-aware');
  const distance = stepDistance([0, 0], [0, 1]);
  assert.ok(Math.abs(result.modeledCost! - distance * 2) < 1e-9);
  assert.equal(result.objective, result.modeledCost);
  assert.ok(Math.abs(result.meanSlopeDeg! - 4) < 1e-9);
  assert.equal(result.maxSlopeDeg, 6);
  assert.equal(result.cells, 2);
});

test('the terrain-aware mode trades distance for lower modelled cost', () => {
  // Two ways around: the short way crosses rough ground, the long way is gentle.
  const grid = makeGrid(3, 3, [1, 9, 1, 1, 1, 1, 1, 1, 1]);
  const shortest = route(grid, [0, 0], [0, 2], 'shortest');
  const aware = route(grid, [0, 0], [0, 2], 'terrain-aware');
  assert.ok(shortest.path.some(([row, col]) => row === 0 && col === 1));
  assert.ok(!aware.path.some(([row, col]) => row === 0 && col === 1));
  assert.ok(aware.modeledCost! < shortest.modeledCost!);
  assert.ok(aware.distanceMeters! > shortest.distanceMeters!);
});

test('the Mars spherical metric uses the real east-west ground scale', () => {
  const east = greatCircle(cellToProjected(0, 0), cellToProjected(0, 1));
  const north = greatCircle(cellToProjected(0, 0), cellToProjected(1, 0));
  assert.ok(east > 18.9 && east < 19.1, String(east));
  assert.ok(Math.abs(north - 20) < 1e-6, String(north));
});

// ---------------------------------------------------------------------------
// The real D07 grid
// ---------------------------------------------------------------------------

test('A* on the real grid equals an independent Dijkstra', () => {
  const bin = readFileSync('public/terrain/navigation_grid.bin');
  const decoded = decodeGrid(
    bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer,
  );
  const grid: RoutingGrid = {
    width: decoded.width,
    height: decoded.height,
    cost: decoded.cost,
    slope: slopeFromCost(decoded.cost),
    mask: decoded.mask,
  };

  const pairs: [GridPoint, GridPoint][] = [
    [[230, 30], [35, 235]],
    [[210, 80], [60, 220]],
  ];
  for (const [start, end] of pairs) {
    for (const mode of ['shortest', 'terrain-aware'] as RouteMode[]) {
      const result = route(grid, start, end, mode);
      assert.equal(result.status, 'ok');
      const expected = dijkstra(grid, start, end, mode);
      assert.ok(
        Math.abs(result.objective! - expected) < 1e-7,
        `${mode} ${start}->${end}: ${result.objective} != ${expected}`,
      );
    }
  }
});

test('the real grid reproduces the D08 example route', () => {
  const bin = readFileSync('public/terrain/navigation_grid.bin');
  const decoded = decodeGrid(
    bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer,
  );
  const grid: RoutingGrid = {
    width: decoded.width,
    height: decoded.height,
    cost: decoded.cost,
    slope: slopeFromCost(decoded.cost),
    mask: decoded.mask,
  };

  const shortest = route(grid, [230, 30], [35, 235], 'shortest');
  const aware = route(grid, [230, 30], [35, 235], 'terrain-aware');
  assert.equal(shortest.cells, 207);
  assert.ok(Math.abs(shortest.modeledCost! - 8113.5) < 1.0);
  assert.equal(aware.cells, 246);
  assert.ok(Math.abs(aware.modeledCost! - 7261.5) < 1.0);
});
