// Weighted A* over the navigation grid, and the route response shape that M1
// consumes.
//
// The policy follows the D07 specification recorded in
// Data/navigation/README.md:
//   - cells with a null cost are excluded (blocked or unknown);
//   - diagonal corner cutting is forbidden;
//   - edge weight = great-circle distance between cell centres times the mean
//     of the two endpoint frictions;
//   - the heuristic is the great-circle distance to the goal times the minimum
//     friction of 1, which keeps it admissible.
//
// The reported `distanceMeters` follows the M5-03 convention instead (20 m per
// orthogonal step, 28.28 m per diagonal), so the numbers on the M1 dashboard
// match the route metrics JSON M5 produces.
//
// shortcut: this implements the A* search itself because M1-05/M3-06/M3-07
// cannot be completed without it. M5's M3-03/M3-04 engine supersedes this at
// merge time; keep the exported signature stable so the swap is a one-file
// change.

import { CELL_M, cellToProjected, greatCircle } from './geo.ts';

export type RouteMode = 'shortest' | 'terrain-aware';

export type GridPoint = [row: number, col: number];

export interface NavigationGrid {
  schemaVersion: string;
  width: number;
  height: number;
  cost: (number | null)[];
  validDataMask: (0 | 1)[];
  blockedMask: (0 | 1)[];
}

export interface RouteMetrics {
  /** Cell-centre-to-cell-centre path length in metres. */
  distanceMeters: number;
  /** Sum of edge weights along the path (dimensionless friction-weighted). */
  cost: number;
  /** Number of cells in the path, including both endpoints. */
  cells: number;
  /** Straight-line great-circle distance between the endpoints. */
  straightLineMeters: number;
  /** distanceMeters / straightLineMeters; 1 for a perfectly straight path. */
  detourRatio: number;
  /** Sum of the per-cell friction values along the path. */
  meanFriction: number;
}

export interface RouteResponse {
  status: 'ok' | 'no-route' | 'invalid-request';
  mode: RouteMode;
  path: GridPoint[];
  metrics: RouteMetrics | null;
  error: string | null;
}

const NEIGHBOURS: { dr: number; dc: number; diagonal: boolean }[] = [
  { dr: -1, dc: 0, diagonal: false },
  { dr: 1, dc: 0, diagonal: false },
  { dr: 0, dc: -1, diagonal: false },
  { dr: 0, dc: 1, diagonal: false },
  { dr: -1, dc: -1, diagonal: true },
  { dr: -1, dc: 1, diagonal: true },
  { dr: 1, dc: -1, diagonal: true },
  { dr: 1, dc: 1, diagonal: true },
];

export function indexOf(grid: NavigationGrid, row: number, col: number): number {
  return row * grid.width + col;
}

export function inBounds(grid: NavigationGrid, row: number, col: number): boolean {
  return row >= 0 && row < grid.height && col >= 0 && col < grid.width;
}

/** A cell is traversable when it has a finite cost. Null covers blocked and unknown. */
export function isTraversable(grid: NavigationGrid, row: number, col: number): boolean {
  if (!inBounds(grid, row, col)) return false;
  return grid.cost[indexOf(grid, row, col)] !== null;
}

/**
 * Edge weight between two adjacent cells.
 *
 * The documented rule is great-circle distance times the mean endpoint
 * friction. The shortest mode keeps the distance only, so it prefers the
 * geometrically shortest line; the terrain-aware mode keeps the friction
 * factor, so it prefers gentle ground even when that is longer.
 */
function edgeWeight(
  grid: NavigationGrid,
  from: GridPoint,
  to: GridPoint,
  mode: RouteMode,
): number {
  const a = cellToProjected(from[0], from[1]);
  const b = cellToProjected(to[0], to[1]);
  const distance = greatCircle(a, b);
  if (mode === 'shortest') return distance;
  const fa = grid.cost[indexOf(grid, from[0], from[1])]!;
  const fb = grid.cost[indexOf(grid, to[0], to[1])]!;
  return distance * ((fa + fb) / 2);
}

/** Heuristic: great-circle distance to the goal, times the minimum friction of 1. */
function heuristic(from: GridPoint, goal: GridPoint): number {
  return greatCircle(cellToProjected(from[0], from[1]), cellToProjected(goal[0], goal[1]));
}

/**
 * A* search.
 *
 * `maxExpansions` bounds the work on a 267x267 grid so a pathological pair
 * cannot hang the browser tab.
 */
export function findPath(
  grid: NavigationGrid,
  start: GridPoint,
  goal: GridPoint,
  mode: RouteMode,
  maxExpansions = 400000,
): RouteResponse {
  const base: RouteResponse = { status: 'ok', mode, path: [], metrics: null, error: null };

  if (!inBounds(grid, start[0], start[1]) || !inBounds(grid, goal[0], goal[1])) {
    return { ...base, status: 'invalid-request', error: 'Start or end point is outside the grid.' };
  }
  if (!isTraversable(grid, start[0], start[1])) {
    return { ...base, status: 'invalid-request', error: 'Start point is blocked or unknown.' };
  }
  if (!isTraversable(grid, goal[0], goal[1])) {
    return { ...base, status: 'invalid-request', error: 'End point is blocked or unknown.' };
  }

  const startIdx = indexOf(grid, start[0], start[1]);
  const goalIdx = indexOf(grid, goal[0], goal[1]);
  if (startIdx === goalIdx) {
    return {
      ...base,
      path: [start],
      metrics: {
        distanceMeters: 0,
        cost: 0,
        cells: 1,
        straightLineMeters: 0,
        detourRatio: 1,
        meanFriction: grid.cost[startIdx]!,
      },
    };
  }

  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  // A binary heap keyed on f = g + h.
  const open: { idx: number; f: number }[] = [];

  const push = (idx: number, f: number) => {
    open.push({ idx, f });
    let i = open.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (open[parent].f <= open[i].f) break;
      [open[parent], open[i]] = [open[i], open[parent]];
      i = parent;
    }
  };

  const pop = () => {
    const top = open[0];
    const last = open.pop()!;
    if (open.length > 0) {
      open[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < open.length && open[l].f < open[smallest].f) smallest = l;
        if (r < open.length && open[r].f < open[smallest].f) smallest = r;
        if (smallest === i) break;
        [open[smallest], open[i]] = [open[i], open[smallest]];
        i = smallest;
      }
    }
    return top;
  };

  gScore.set(startIdx, 0);
  push(startIdx, heuristic(start, goal));

  const closed = new Set<number>();
  let expansions = 0;

  while (open.length > 0) {
    const { idx } = pop();
    if (closed.has(idx)) continue;
    closed.add(idx);
    expansions += 1;
    if (expansions > maxExpansions) {
      return { ...base, status: 'no-route', error: 'Search budget exhausted.' };
    }

    if (idx === goalIdx) {
      const path = rebuildPath(cameFrom, grid, startIdx, goalIdx);
      return { ...base, path, metrics: measure(grid, path) };
    }

    const row = Math.floor(idx / grid.width);
    const col = idx % grid.width;
    const from: GridPoint = [row, col];
    const g = gScore.get(idx)!;

    for (const n of NEIGHBOURS) {
      const nr = row + n.dr;
      const nc = col + n.dc;
      if (!isTraversable(grid, nr, nc)) continue;
      // No corner cutting: a diagonal move needs both orthogonal neighbours open.
      if (n.diagonal) {
        if (!isTraversable(grid, row + n.dr, col)) continue;
        if (!isTraversable(grid, row, col + n.dc)) continue;
      }
      const nIdx = indexOf(grid, nr, nc);
      if (closed.has(nIdx)) continue;

      const tentative = g + edgeWeight(grid, from, [nr, nc], mode);
      const known = gScore.get(nIdx);
      if (known !== undefined && tentative >= known) continue;

      gScore.set(nIdx, tentative);
      cameFrom.set(nIdx, idx);
      push(nIdx, tentative + heuristic([nr, nc], goal));
    }
  }

  return { ...base, status: 'no-route', error: 'No traversable path exists between these points.' };
}

function rebuildPath(
  cameFrom: Map<number, number>,
  grid: NavigationGrid,
  startIdx: number,
  goalIdx: number,
): GridPoint[] {
  const out: GridPoint[] = [];
  let cur = goalIdx;
  while (cur !== startIdx) {
    out.push([Math.floor(cur / grid.width), cur % grid.width]);
    const prev = cameFrom.get(cur);
    if (prev === undefined) break;
    cur = prev;
  }
  out.push([Math.floor(startIdx / grid.width), startIdx % grid.width]);
  out.reverse();
  return out;
}

/** Distance and cost metrics for a path. */
export function measure(grid: NavigationGrid, path: GridPoint[]): RouteMetrics {
  if (path.length === 0) {
    return { distanceMeters: 0, cost: 0, cells: 0, straightLineMeters: 0, detourRatio: 1, meanFriction: 0 };
  }

  let distanceMeters = 0;
  let cost = 0;
  let frictionSum = 0;

  for (let i = 0; i < path.length; i += 1) {
    frictionSum += grid.cost[indexOf(grid, path[i][0], path[i][1])] ?? 0;
    if (i === 0) continue;
    const a = cellToProjected(path[i - 1][0], path[i - 1][1]);
    const b = cellToProjected(path[i][0], path[i][1]);
    const step = greatCircle(a, b);
    // M5-03 convention: 20 m per orthogonal cell, 28.28 m per diagonal.
    const dr = Math.abs(path[i][0] - path[i - 1][0]);
    const dc = Math.abs(path[i][1] - path[i - 1][1]);
    distanceMeters += dr === 0 || dc === 0 ? CELL_M : DIAGONAL_STEP_M;
    const fa = grid.cost[indexOf(grid, path[i - 1][0], path[i - 1][1])]!;
    const fb = grid.cost[indexOf(grid, path[i][0], path[i][1])]!;
    // D07 edge cost: spherical distance times the mean endpoint friction.
    cost += step * ((fa + fb) / 2);
  }

  const first = cellToProjected(path[0][0], path[0][1]);
  const last = cellToProjected(path[path.length - 1][0], path[path.length - 1][1]);
  const straightLineMeters = greatCircle(first, last);

  return {
    distanceMeters,
    cost,
    cells: path.length,
    straightLineMeters,
    detourRatio: straightLineMeters > 0 ? distanceMeters / straightLineMeters : 1,
    meanFriction: frictionSum / path.length,
  };
}

/** Orthogonal step is one cell; diagonal is the hypotenuse of a square cell. */
export const DIAGONAL_STEP_M = CELL_M * Math.SQRT2;
