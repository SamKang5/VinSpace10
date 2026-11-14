// Weighted A* over the M2-02 navigation grid.
//
// Ported from the team's own D08 routing prototype
// (`02_Processed_GIS/D08_AStar_Routing/public/routing.js` in the MARS NAVIGATOR
// data archive) so the app reports the same routes, distances and costs as the
// source pipeline, and so there is one routing engine in the project instead
// of two.
//
// The D07 policy, as documented in Data/navigation/README.md:
//   - a cell is traversable when it is data-supported, its friction is finite
//     and >= 1, and its slope is finite within 0-90 degrees; blocked and
//     unknown cells carry -9999 and are never entered;
//   - diagonal corner cutting is forbidden;
//   - the edge weight is the great-circle distance between cell centres times
//     the mean of the two endpoint frictions (terrain-aware mode only);
//   - the heuristic is the great-circle distance to the goal, which stays
//     admissible because the minimum friction is 1.
//
// RESEARCH/DEMO ONLY: friction and slope thresholds are uncalibrated research
// assumptions. A route here is not a safety or traversability assessment.

import { MARS_RADIUS_M, cellToProjected, greatCircle } from './geo.ts';

/** A grid cell as `[row, col]`. Row 0 is north, column 0 is west. */
export type GridPoint = [row: number, col: number];

/** `shortest` minimises distance; `terrain-aware` minimises friction-weighted distance. */
export type RouteMode = 'shortest' | 'terrain-aware';

export type RouteStatus = 'ok' | 'out_of_bounds' | 'blocked_endpoint' | 'no_path';

/** What the router needs: the three D07 arrays, already decoded. */
export interface RoutingGrid {
  width: number;
  height: number;
  /** Dimensionless per-cell friction. -9999 marks blocked or unknown cells. */
  cost: Float32Array;
  /** Slope in degrees. -9999 marks blocked or unknown cells. */
  slope: Float32Array;
  /** 1 = data supported (image footprint and 3x3 DEM support). Not "safe". */
  mask: Uint8Array;
}

export interface RouteResult {
  status: RouteStatus;
  mode: RouteMode;
  /** Ordered start-to-end cells, including both endpoints. */
  path: GridPoint[];
  /** Sum of the great-circle edge lengths, in metres. */
  distanceMeters: number | null;
  /** Sum of edge length times mean endpoint friction. Friction-weighted metres. */
  modeledCost: number | null;
  /** The value the mode minimises: distance for shortest, modeled cost for terrain-aware. */
  objective: number | null;
  /** Unweighted mean of the visited cells' slopes, in degrees. */
  meanSlopeDeg: number | null;
  /** Highest visited cell slope, in degrees. */
  maxSlopeDeg: number | null;
  /** Number of cells in the path, including both endpoints. */
  cells: number;
  /** Wall-clock search time. Nondeterministic; the route itself is not. */
  computationMs: number;
  warnings: string[];
}

const RESEARCH_WARNING =
  'Research prototype; friction and slope thresholds are uncalibrated. Not a safety assessment.';

/** NoData marker used by the D07 pipeline for blocked and unknown cells. */
export const NODATA = -9999;

/** Eight-neighbour order, fixed so ties break the same way on every run. */
const MOVES: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [0, -1],
  [0, 1],
  [1, 0],
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

/**
 * Binary heap keyed on f = g + h, with stable tie-breaking on h and then on
 * insertion order, so an equal-cost path is always the same path.
 */
class NodeHeap {
  private readonly items: { i: number; g: number; h: number; f: number; seq: number }[] = [];
  private seq = 0;

  get size(): number {
    return this.items.length;
  }

  push(node: { i: number; g: number; h: number; f: number }): void {
    const item = { ...node, seq: this.seq++ };
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.isBefore(a[i], a[parent])) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      i = parent;
    }
  }

  pop(): { i: number; g: number; h: number; f: number } {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < a.length && this.isBefore(a[left], a[smallest])) smallest = left;
        if (right < a.length && this.isBefore(a[right], a[smallest])) smallest = right;
        if (smallest === i) break;
        [a[smallest], a[i]] = [a[i], a[smallest]];
        i = smallest;
      }
    }
    return top;
  }

  private isBefore(
    x: { f: number; h: number; seq: number },
    y: { f: number; h: number; seq: number },
  ): boolean {
    if (x.f !== y.f) return x.f < y.f;
    if (x.h !== y.h) return x.h < y.h;
    return x.seq < y.seq;
  }
}

/** Great-circle distance between two cell centres, in metres. */
export function stepDistance(a: GridPoint, b: GridPoint): number {
  return greatCircle(cellToProjected(a[0], a[1]), cellToProjected(b[0], b[1]));
}

function isTraversable(grid: RoutingGrid, index: number): boolean {
  if (grid.mask[index] !== 1) return false;
  const cost = grid.cost[index];
  if (!Number.isFinite(cost) || cost < 1) return false;
  const slope = grid.slope[index];
  return Number.isFinite(slope) && slope >= 0 && slope <= 90;
}

function emptyResult(status: RouteStatus, mode: RouteMode, startedAt: number): RouteResult {
  return {
    status,
    mode,
    path: [],
    distanceMeters: null,
    modeledCost: null,
    objective: null,
    meanSlopeDeg: null,
    maxSlopeDeg: null,
    cells: 0,
    computationMs: performance.now() - startedAt,
    warnings: [RESEARCH_WARNING],
  };
}

/**
 * A* search over the navigation grid.
 *
 * `start` and `end` are `[row, col]` cells. The result carries the ordered
 * path, the modelled cost, the slope statistics and the research warning, so
 * every consumer works from one response shape.
 */
export function route(
  grid: RoutingGrid,
  start: GridPoint,
  end: GridPoint,
  mode: RouteMode = 'shortest',
): RouteResult {
  const startedAt = performance.now();
  const { width, height } = grid;
  const size = width * height;
  const index = (row: number, col: number) => row * width + col;

  const inside = (p: GridPoint) =>
    Number.isInteger(p[0]) &&
    Number.isInteger(p[1]) &&
    p[0] >= 0 &&
    p[0] < height &&
    p[1] >= 0 &&
    p[1] < width;

  if (!inside(start) || !inside(end)) {
    return emptyResult('out_of_bounds', mode, startedAt);
  }

  const startIndex = index(start[0], start[1]);
  const endIndex = index(end[0], end[1]);
  if (!isTraversable(grid, startIndex) || !isTraversable(grid, endIndex)) {
    return emptyResult('blocked_endpoint', mode, startedAt);
  }

  const distances = new Float64Array(size).fill(Number.POSITIVE_INFINITY);
  const parent = new Int32Array(size).fill(-1);
  const open = new NodeHeap();

  distances[startIndex] = 0;
  const firstHeuristic = stepDistance(start, end);
  open.push({ i: startIndex, g: 0, h: firstHeuristic, f: firstHeuristic });

  let found = false;
  while (open.size > 0) {
    const current = open.pop();
    if (current.g !== distances[current.i]) continue;
    if (current.i === endIndex) {
      found = true;
      break;
    }

    const row = Math.floor(current.i / width);
    const col = current.i % width;

    for (const [dr, dc] of MOVES) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (nextRow < 0 || nextCol < 0 || nextRow >= height || nextCol >= width) continue;

      const nextIndex = index(nextRow, nextCol);
      if (!isTraversable(grid, nextIndex)) continue;
      // No corner cutting: a diagonal needs both orthogonal neighbours open.
      if (dr !== 0 && dc !== 0) {
        if (!isTraversable(grid, index(row, nextCol))) continue;
        if (!isTraversable(grid, index(nextRow, col))) continue;
      }

      const distance = stepDistance([row, col], [nextRow, nextCol]);
      const weight =
        mode === 'terrain-aware' ? (grid.cost[current.i] + grid.cost[nextIndex]) / 2 : 1;
      const nextG = current.g + distance * weight;

      if (nextG < distances[nextIndex]) {
        distances[nextIndex] = nextG;
        parent[nextIndex] = current.i;
        const heuristic = stepDistance([nextRow, nextCol], end);
        open.push({ i: nextIndex, g: nextG, h: heuristic, f: nextG + heuristic });
      }
    }
  }

  if (!found) {
    return emptyResult('no_path', mode, startedAt);
  }

  const indices: number[] = [];
  for (let i = endIndex; i !== -1; i = parent[i]) indices.push(i);
  indices.reverse();

  const path: GridPoint[] = indices.map((i) => [Math.floor(i / width), i % width]);

  let distanceMeters = 0;
  let modeledCost = 0;
  let slopeSum = 0;
  let maxSlope = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < indices.length; i += 1) {
    const k = indices[i];
    slopeSum += grid.slope[k];
    if (grid.slope[k] > maxSlope) maxSlope = grid.slope[k];
    if (i === 0) continue;
    const distance = stepDistance(path[i - 1], path[i]);
    distanceMeters += distance;
    modeledCost += distance * ((grid.cost[indices[i - 1]] + grid.cost[k]) / 2);
  }

  return {
    status: 'ok',
    mode,
    path,
    distanceMeters,
    modeledCost,
    objective: mode === 'terrain-aware' ? modeledCost : distanceMeters,
    meanSlopeDeg: slopeSum / indices.length,
    maxSlopeDeg: maxSlope,
    cells: indices.length,
    computationMs: performance.now() - startedAt,
    warnings: [RESEARCH_WARNING],
  };
}

/**
 * Slope in degrees from the published friction.
 *
 * The D07 policy is `movement_cost = 1 + (slope_degrees / 10)^2`, so the slope
 * array is an exact inversion of the friction array for every traversable
 * cell. Deriving it keeps one source of truth and saves a second binary.
 */
export function slopeFromCost(cost: Float32Array): Float32Array {
  const slope = new Float32Array(cost.length);
  for (let i = 0; i < cost.length; i += 1) {
    const c = cost[i];
    slope[i] = Number.isFinite(c) && c >= 1 ? 10 * Math.sqrt(c - 1) : NODATA;
  }
  return slope;
}

/** Mars 2000 sphere radius, exposed so consumers do not hardcode it. */
export { MARS_RADIUS_M };
