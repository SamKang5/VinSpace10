import { CELL_M, GRID_ORIGIN_Y, MARS_RADIUS_M } from '../lib/geo.ts';
import { NODATA, type GridPoint, type RouteResult, type RoutingGrid } from '../lib/router.ts';

// ponytail: local tangent approximation for rendering; published route metrics stay spherical.
export const CELL_X = CELL_M * Math.cos((GRID_ORIGIN_Y - 267 * CELL_M / 2) / MARS_RADIUS_M);
export const CELL_Z = CELL_M;
export const WALK_SPEED = 1.7;
export const SCAN_SECONDS = 45;
export const SCAN_RADIUS = 28;
export const ARRIVAL_RADIUS = 7;
export type Position = { x: number; z: number };
export type Survey = { id: number; name: string; description: string; cell: GridPoint; position: Position };
export type MissionState = {
  position: Position; elapsed: number; distance: number; oxygen: number; energy: number;
  risk: number; scans: number[]; scanProgress: number; status: 'active' | 'success' | 'failed';
  failure: string; trail: Position[];
};

export function cellPosition([row, col]: GridPoint): Position {
  return { x: col * CELL_X, z: row * CELL_Z };
}
export function positionCell(position: Position): GridPoint {
  return [Math.floor(position.z / CELL_Z + 0.5), Math.floor(position.x / CELL_X + 0.5)];
}
export function distance(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
export function traversable(grid: RoutingGrid, [row, col]: GridPoint): boolean {
  if (row < 0 || col < 0 || row >= grid.height || col >= grid.width) return false;
  const i = row * grid.width + col;
  return grid.mask[i] === 1 && Number.isFinite(grid.cost[i]) && grid.cost[i] >= 1 &&
    Number.isFinite(grid.slope[i]) && grid.slope[i] >= 0 && grid.slope[i] <= 90;
}

/** Triangle interpolation matches the terrain's NW-SW-NE / NE-SW-SE mesh. */
export function terrainHeight(elevation: Float32Array, width: number, height: number, position: Position): number {
  const col = Math.max(0, Math.min(width - 1, position.x / CELL_X));
  const row = Math.max(0, Math.min(height - 1, position.z / CELL_Z));
  const c = Math.min(width - 2, Math.floor(col));
  const r = Math.min(height - 2, Math.floor(row));
  const u = col - c, v = row - r;
  const a = elevation[r * width + c], b = elevation[r * width + c + 1];
  const d = elevation[(r + 1) * width + c], e = elevation[(r + 1) * width + c + 1];
  return u + v <= 1 ? a + (b - a) * u + (d - a) * v
    : e + (d - e) * (1 - u) + (b - e) * (1 - v);
}

function canStep(grid: RoutingGrid, from: Position, to: Position): boolean {
  const a = positionCell(from), b = positionCell(to);
  if (!traversable(grid, b)) return false;
  return a[0] === b[0] || a[1] === b[1] ||
    (traversable(grid, [a[0], b[1]]) && traversable(grid, [b[0], a[1]]));
}

/** Substeps prevent tunnelling through an excluded cell at accelerated travel speeds. */
export function movePlayer(grid: RoutingGrid, from: Position, dx: number, dz: number): Position {
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (Math.min(CELL_X, CELL_Z) / 5)));
  let current = { ...from };
  for (let i = 0; i < count; i++) {
    const next = { x: current.x + dx / count, z: current.z + dz / count };
    if (canStep(grid, current, next)) current = next;
    else {
      const horizontal = { x: next.x, z: current.z };
      if (canStep(grid, current, horizontal)) current = horizontal;
      const vertical = { x: current.x, z: next.z };
      if (canStep(grid, current, vertical)) current = vertical;
    }
  }
  return current;
}

export function createMission(start: GridPoint): MissionState {
  const position = cellPosition(start);
  return { position, elapsed: 0, distance: 0, oxygen: 100, energy: 100, risk: 0,
    scans: [], scanProgress: 0, status: 'active', failure: '', trail: [{ ...position }] };
}

export function missionBudget(route: RouteResult): number {
  // Same budget for either route; shortest distance sets the expedition's difficulty.
  return Math.max(600, (route.distanceMeters ?? 0) / WALK_SPEED * 1.85 + SCAN_SECONDS * 3);
}

/** A fixed simulation tick owns movement, resources, scans and arrival. All rates are gameplay assumptions. */
export function advanceMission(state: MissionState, grid: RoutingGrid, destination: GridPoint,
  budget: number, seconds: number, direction: Position, survey?: Survey): void {
  if (state.status !== 'active' || seconds <= 0) return;
  const dt = Math.min(seconds, 0.25);
  const length = Math.hypot(direction.x, direction.z);
  const moving = length > 0 && !survey;
  const next = moving ? movePlayer(grid, state.position,
    direction.x / length * WALK_SPEED * dt, direction.z / length * WALK_SPEED * dt) : state.position;
  const travelled = distance(state.position, next);
  const cell = positionCell(next);
  const cost = grid.cost[cell[0] * grid.width + cell[1]];
  const friction = Number.isFinite(cost) && cost !== NODATA ? cost : 1;
  state.position = next;
  state.elapsed += dt;
  state.distance += travelled;
  state.oxygen = Math.max(0, state.oxygen - dt / budget * 100);
  state.energy = Math.max(0, state.energy - travelled / (budget * WALK_SPEED) * 100 *
    (0.7 + friction * 0.3) - (survey ? dt * 0.012 : 0));
  if (travelled > 0) state.risk += travelled * (friction - 1);
  if (survey && !state.scans.includes(survey.id) && distance(next, survey.position) <= SCAN_RADIUS) {
    state.scanProgress += dt;
    if (state.scanProgress >= SCAN_SECONDS) {
      state.scans.push(survey.id);
      state.scanProgress = 0;
    }
  } else state.scanProgress = 0;
  if (distance(state.position, state.trail[state.trail.length - 1]) >= 12) state.trail.push({ ...state.position });
  if (state.oxygen <= 0 || state.energy <= 0) {
    state.status = 'failed';
    state.failure = state.oxygen <= 0 ? 'Oxygen reserve depleted' : 'Suit energy depleted';
  } else if (distance(next, cellPosition(destination)) <= ARRIVAL_RADIUS) state.status = 'success';
}

export function missionScore(state: MissionState) {
  const efficiency = Math.round((state.oxygen + state.energy) / 200 * 30);
  const riskPenalty = Math.min(30, Math.round(state.risk / Math.max(1, state.distance) * 20));
  return { efficiency, riskPenalty, total: Math.max(0,
    (state.status === 'success' ? 100 : 0) + state.scans.length * 20 + efficiency - riskPenalty) };
}

export function createSurveys(grid: RoutingGrid, routes: RouteResult[]): Survey[] {
  const surveys: Survey[] = [];
  const descriptions = [
    ['Terrain survey', 'Record the slope and elevation of this DEM cell.'],
    ['Surface observation', 'Compare orbital imagery with your position on the terrain.'],
    ['Ridge survey', 'Observe how the surrounding relief affects route planning.'],
  ];
  for (const path of routes.map(r => r.path)) {
    for (const fraction of [0.06, 0.35, 0.68]) {
      const cell = path[Math.min(path.length - 1, Math.floor(path.length * fraction))];
      if (!cell || !traversable(grid, cell)) continue;
      const position = cellPosition(cell);
      if (surveys.some(s => distance(s.position, position) < 100)) continue;
      const [name, description] = descriptions[surveys.length % descriptions.length];
      surveys.push({ id: surveys.length, name, description, cell, position });
    }
  }
  return surveys;
}
