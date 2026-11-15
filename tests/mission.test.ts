import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMission, CELL_X, CELL_Z, cellPosition, createMission, createSurveys, distance, missionScore,
  movePlayer, positionCell, SCAN_SECONDS, terrainHeight, WALK_SPEED } from '../src/game/missionModel.ts';
import { NODATA, route, type RoutingGrid } from '../src/lib/router.ts';

function grid(): RoutingGrid {
  return { width: 40, height: 40, cost: new Float32Array(1600).fill(1),
    mask: new Uint8Array(1600).fill(1), slope: new Float32Array(1600) };
}

test('local coordinate round trips and triangular height interpolation match the rendered surface', () => {
  for (const cell of [[0, 0], [12, 18], [266, 266]] as [number, number][]) assert.deepEqual(positionCell(cellPosition(cell)), cell);
  const elevation = new Float32Array([0, 10, 20, 50]);
  assert.equal(terrainHeight(elevation, 2, 2, { x: CELL_X / 4, z: CELL_Z / 4 }), 7.5);
  assert.equal(terrainHeight(elevation, 2, 2, { x: CELL_X * .75, z: CELL_Z * .75 }), 32.5);
  assert.equal(terrainHeight(elevation, 2, 2, { x: -10, z: -10 }), 0);
});

test('free movement is independent of guidance, while blocked cells, unknowns and map edges cannot be crossed', () => {
  const g = grid(), from = cellPosition([10, 10]);
  assert.equal(positionCell(movePlayer(g, from, CELL_X * 4, 0))[1], 14);
  g.cost[10 * g.width + 12] = NODATA;
  assert.equal(positionCell(movePlayer(g, from, CELL_X * 10, 0))[1], 11);
  g.cost[10 * g.width + 12] = 1; g.mask[10 * g.width + 12] = 0;
  assert.equal(positionCell(movePlayer(g, from, CELL_X * 10, 0))[1], 11);
  assert.equal(positionCell(movePlayer(g, cellPosition([0, 0]), -100, -100))[0], 0);
  assert.equal(positionCell(movePlayer(g, cellPosition([0, 0]), -100, -100))[1], 0);
  g.cost[10 * g.width + 11] = NODATA; g.cost[11 * g.width + 10] = NODATA;
  assert.deepEqual(positionCell(movePlayer(g, from, CELL_X, CELL_Z)), [10, 10]);
});

test('diagonal walking is normalized; accelerated time uses identical movement and resource accounting', () => {
  const g = grid(), straight = createMission([10, 10]), diagonal = createMission([10, 10]);
  for (let i = 0; i < 100; i++) {
    advanceMission(straight, g, [39, 39], 1000, .1, { x: 1, z: 0 });
    advanceMission(diagonal, g, [39, 39], 1000, .1, { x: 1, z: 1 });
  }
  assert.ok(Math.abs(straight.distance - WALK_SPEED * 10) < 1e-8);
  assert.ok(Math.abs(diagonal.distance - straight.distance) < 1e-8);
  assert.ok(Math.abs(diagonal.energy - straight.energy) < 1e-8);
  assert.ok(Math.abs(straight.oxygen - 99) < 1e-8);
  const previous = { ...straight };
  advanceMission(straight, g, [39, 39], 1000, 0, { x: 1, z: 0 });
  assert.deepEqual(straight, previous);
});

test('difficult terrain increases energy use and risk', () => {
  const g = grid(), walking = createMission([10, 10]);
  advanceMission(walking, g, [39, 39], 1000, .1, { x: 1, z: 0 });
  const rough = createMission([10, 10]); g.cost.fill(2);
  advanceMission(rough, g, [39, 39], 1000, .1, { x: 1, z: 0 });
  assert.ok(rough.energy < walking.energy); assert.ok(rough.risk > 0);
});

test('scans require proximity, consume time and energy, stop movement, and award each site once', () => {
  const g = grid(), mission = createMission([10, 10]);
  const site = { id: 1, name: 'Survey', description: 'Simulated', cell: [10, 10] as [number, number], position: cellPosition([10, 10]) };
  for (let i = 0; i < SCAN_SECONDS * 10 + 1; i++) advanceMission(mission, g, [39, 39], 1000, .1, { x: 1, z: 0 }, site);
  assert.deepEqual(mission.scans, [1]); assert.equal(mission.distance, 0); assert.ok(mission.oxygen < 100); assert.ok(mission.energy < 100);
  for (let i = 0; i < 1000; i++) advanceMission(mission, g, [39, 39], 1000, .1, { x: 0, z: 0 }, site);
  assert.deepEqual(mission.scans, [1]);
  const distant = { ...site, id: 2, position: cellPosition([20, 20]) };
  advanceMission(mission, g, [39, 39], 1000, .1, { x: 0, z: 0 }, distant);
  assert.equal(mission.scanProgress, 0); assert.equal(mission.scans.length, 1);
});

test('arrival succeeds, depletion fails, terminal state is frozen, and restart clears the journey', () => {
  const g = grid(), arrival = createMission([10, 10]);
  advanceMission(arrival, g, [10, 10], 1000, .1, { x: 0, z: 0 });
  assert.equal(arrival.status, 'success');
  const failed = createMission([10, 10]); failed.oxygen = .00001;
  advanceMission(failed, g, [39, 39], 1000, .1, { x: 0, z: 0 });
  assert.equal(failed.status, 'failed'); assert.equal(failed.failure, 'Oxygen reserve depleted');
  const stoppedAt = { ...failed.position }, stoppedTime = failed.elapsed;
  advanceMission(failed, g, [39, 39], 1000, .1, { x: 1, z: 0 });
  assert.deepEqual(failed.position, stoppedAt); assert.equal(failed.elapsed, stoppedTime);
  const emptyEnergy = createMission([10, 10]); emptyEnergy.energy = 0;
  advanceMission(emptyEnergy, g, [39, 39], 1000, .1, { x: 1, z: 0 });
  assert.equal(emptyEnergy.failure, 'Suit energy depleted');
  const fresh = createMission([10, 10]); assert.equal(fresh.energy, 100); assert.equal(fresh.distance, 0); assert.deepEqual(fresh.scans, []);
});

test('simulated survey sites use traversable route cells and are spatially deduplicated', () => {
  const g = grid(), shortest = route(g, [0, 0], [39, 39], 'shortest');
  const sites = createSurveys(g, [shortest, shortest]);
  assert.ok(sites.length > 0);
  for (let i = 0; i < sites.length; i++) for (let j = i + 1; j < sites.length; j++) assert.ok(distance(sites[i].position, sites[j].position) >= 100);
});

test('mission score breakdown reconciles with the total, including the zero-point minimum', () => {
  const mission = createMission([10, 10]);
  Object.assign(mission, { status: 'success', scans: [0, 1, 2], oxygen: 40, energy: 60, distance: 1000, risk: 750 });
  assert.deepEqual(missionScore(mission), {
    arrival: 100, science: 60, efficiency: 15, riskPenalty: 15, floorAdjustment: 0, total: 160,
  });
  Object.assign(mission, { status: 'failed', scans: [], oxygen: 0, energy: 0, risk: 2000 });
  assert.deepEqual(missionScore(mission), {
    arrival: 0, science: 0, efficiency: 0, riskPenalty: 30, floorAdjustment: 30, total: 0,
  });
});
