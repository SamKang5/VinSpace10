// Self-check for the routing engine, the grid<->pixel mapping and the slope
// overlay classification.
//
// Run: node --experimental-strip-types scripts/check-routing.mts
// (or via npm run check)

import { readFileSync } from 'node:fs';
import {
  NODATA,
  route,
  slopeFromCost,
  stepDistance,
  type GridPoint,
  type RoutingGrid,
} from '../src/lib/router.ts';
import { imagePixelToGrid, gridToImagePixel, decodeGrid } from '../src/lib/data.ts';
import { greatCircle, cellToProjected } from '../src/lib/geo.ts';
import { slopeClassOf } from '../src/lib/overlay.ts';

let failures = 0;
function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`OK  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ---- a small synthetic grid -------------------------------------------------
// 5x5, one blocked cell, so the rules can be checked by hand.
function makeGrid(): RoutingGrid {
  const w = 5;
  const h = 5;
  const cost = new Float32Array(w * h).fill(1);
  const mask = new Uint8Array(w * h).fill(1);
  // Block the middle cell so every route must detour.
  cost[2 * w + 2] = NODATA;
  mask[2 * w + 2] = 1;
  return {
    width: w,
    height: h,
    cost,
    slope: slopeFromCost(cost),
    mask,
  };
}

const grid = makeGrid();

// ---- 1. blocked cells are excluded ------------------------------------------
{
  const r = route(grid, [0, 0], [4, 4], 'shortest');
  check('route avoids the blocked cell', !r.path.some(([rr, cc]) => rr === 2 && cc === 2), JSON.stringify(r.path));
  check('route status is ok', r.status === 'ok', r.status);
}

// ---- 2. the route is continuous ----------------------------------------------
{
  const r = route(grid, [0, 0], [4, 4], 'shortest');
  let continuous = true;
  for (let i = 1; i < r.path.length; i += 1) {
    const dr = Math.abs(r.path[i][0] - r.path[i - 1][0]);
    const dc = Math.abs(r.path[i][1] - r.path[i - 1][1]);
    if (!(dr + dc === 1 || (dr === 1 && dc === 1))) continuous = false;
  }
  check('every step is a single orthogonal or diagonal move', continuous);
  check(
    'path starts and ends where asked',
    r.path[0][0] === 0 &&
      r.path[0][1] === 0 &&
      r.path[r.path.length - 1][0] === 4 &&
      r.path[r.path.length - 1][1] === 4,
  );
}

// ---- 3. invalid requests are rejected ----------------------------------------
{
  const oob = route(grid, [0, 0], [9, 9], 'shortest');
  check('out-of-bounds end is rejected', oob.status === 'out_of_bounds', oob.status);

  const blockedEnd = route(grid, [0, 0], [2, 2], 'shortest');
  check('blocked end is rejected', blockedEnd.status === 'blocked_endpoint', blockedEnd.status);

  const same = route(grid, [1, 1], [1, 1], 'shortest');
  check('same start and end gives a one-cell path', same.status === 'ok' && same.path.length === 1, JSON.stringify(same.path));
}

// ---- 4. no diagonal corner cutting -------------------------------------------
{
  // A grid where the only diagonal shortcut is cut by a blocked orthogonal cell.
  const w = 3;
  const h = 3;
  const cost = new Float32Array(9).fill(1);
  const mask = new Uint8Array(9).fill(1);
  // Block (0,1): the diagonal from (0,0) to (1,1) must not be taken.
  cost[1] = NODATA;
  const g2: RoutingGrid = { width: w, height: h, cost, slope: slopeFromCost(cost), mask };
  const r = route(g2, [0, 0], [1, 1], 'shortest');
  const cutCorner = r.path.some(
    ([rr, cc], i) =>
      i > 0 &&
      Math.abs(rr - r.path[i - 1][0]) === 1 &&
      Math.abs(cc - r.path[i - 1][1]) === 1,
  );
  check('a diagonal across a blocked neighbour is refused', !cutCorner, JSON.stringify(r.path));
}

// ---- 5. metrics follow the D07 convention ------------------------------------
{
  const straight = route(grid, [0, 0], [0, 4], 'shortest');
  const expected = 4 * stepDistance([0, 0], [0, 1]);
  check('four orthogonal steps measure the great-circle distance', Math.abs(straight.distanceMeters! - expected) < 1e-6, String(straight.distanceMeters));
  check('cell count matches the path length', straight.cells === straight.path.length);
  check('the slope statistics are reported', straight.meanSlopeDeg !== null && straight.maxSlopeDeg !== null);
  check('the research warning is attached', straight.warnings.length > 0);
}

{
  const diag = route(grid, [0, 0], [1, 1], 'shortest');
  const expected = stepDistance([0, 0], [1, 1]);
  check('one diagonal step measures the great-circle distance', Math.abs(diag.distanceMeters! - expected) < 1e-6, String(diag.distanceMeters));
}

// ---- 6. the two modes choose different paths --------------------------------
{
  // Two ways around: the short way crosses rough ground, the long way is gentle.
  const w = 3;
  const h = 3;
  const cost = new Float32Array([1, 9, 1, 1, 1, 1, 1, 1, 1]);
  const g2: RoutingGrid = {
    width: w,
    height: h,
    cost,
    slope: slopeFromCost(cost),
    mask: new Uint8Array(9).fill(1),
  };
  const shortest = route(g2, [0, 0], [0, 2], 'shortest');
  const aware = route(g2, [0, 0], [0, 2], 'terrain-aware');

  check('the shortest mode takes the direct two-step line', shortest.path.length === 3, JSON.stringify(shortest.path));
  check('the shortest mode crosses the rough cell', shortest.path.some(([r, c]) => r === 0 && c === 1), JSON.stringify(shortest.path));
  check('the terrain-aware mode avoids the rough cell', !aware.path.some(([r, c]) => r === 0 && c === 1), JSON.stringify(aware.path));
  check('the terrain-aware route has the lower modelled cost', aware.modeledCost! < shortest.modeledCost!, `aware=${aware.modeledCost} shortest=${shortest.modeledCost}`);
  check('the terrain-aware route is longer on the ground', aware.distanceMeters! > shortest.distanceMeters!);
}

// ---- 7. great-circle distance is monotone and sane ---------------------------
{
  const a = cellToProjected(0, 0);
  const b = cellToProjected(0, 1);
  const c = cellToProjected(0, 2);
  const d1 = greatCircle(a, b);
  const d2 = greatCircle(a, c);
  // 20 m is the projected spacing; on the ground at Jezero's latitude the
  // east-west step is 20 * cos(lat), which is what the spherical metric gives.
  const expected = 20 * Math.cos((18.44 * Math.PI) / 180);
  check('one cell is the ground distance for the projected 20 m step', Math.abs(d1 - expected) < 0.05, `${d1} vs ${expected}`);
  check('two cells are further than one', d2 > d1, `${d1} vs ${d2}`);
  check('the north-south step stays 20 m', Math.abs(greatCircle(cellToProjected(0, 0), cellToProjected(1, 0)) - 20) < 1e-6);
}

// ---- 8. the real grid decodes and matches the export -------------------------
{
  const json = JSON.parse(readFileSync('Data/navigation/navigation_grid.json', 'utf8'));
  const bin = readFileSync('public/terrain/navigation_grid.bin');
  const decoded = decodeGrid(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer);

  check('decoded width matches', decoded.width === json.width, `${decoded.width} vs ${json.width}`);
  check('decoded height matches', decoded.height === json.height, `${decoded.height} vs ${json.height}`);

  let mismatch = 0;
  let nullMismatch = 0;
  for (let i = 0; i < json.cost.length; i += 1) {
    const j = json.cost[i];
    const d = decoded.cost[i];
    if (j === null) {
      if (d !== NODATA) nullMismatch += 1;
    } else if (d === null || Math.abs(d - j) > 1e-9) {
      mismatch += 1;
    }
  }
  check('every cost matches the JSON export exactly', mismatch === 0 && nullMismatch === 0, `${mismatch} value, ${nullMismatch} null mismatches`);

  const blockedInJson = json.cost.filter((c: number | null) => c === null).length;
  const blockedInBin = Array.from(decoded.cost).filter((c) => c === NODATA).length;
  check('blocked and unknown cells survive the round trip', blockedInJson === blockedInBin, `${blockedInJson} vs ${blockedInBin}`);
}

// ---- 9. pixel <-> grid conversion (M1-04) ------------------------------------
{
  const meta = JSON.parse(readFileSync('public/terrain/ctx-aoi-meta.json', 'utf8'));
  // Cell (0,0) centre is image px (1.5, 1.5) at 3 px per cell.
  const centre = gridToImagePixel(meta, [0, 0]);
  check('cell (0,0) centre maps to px 1.5', Math.abs(centre.x - 1.5) < 1e-9 && Math.abs(centre.y - 1.5) < 1e-9, JSON.stringify(centre));

  const back = imagePixelToGrid(meta, centre.x, centre.y);
  check('pixel centre converts back to its own cell', back![0] === 0 && back![1] === 0, JSON.stringify(back));

  // Every cell centre must round-trip.
  let bad = 0;
  for (let r = 0; r < meta.grid.height; r += 1) {
    for (let c = 0; c < meta.grid.width; c += 1) {
      const p = gridToImagePixel(meta, [r, c]);
      const g = imagePixelToGrid(meta, p.x, p.y);
      if (!g || g[0] !== r || g[1] !== c) bad += 1;
    }
  }
  check('all 71,289 cell centres round-trip through image pixels', bad === 0, `${bad} failures`);

  check('a point outside the image returns null', imagePixelToGrid(meta, -5, -5) === null);
}

// ---- 10. the real grid routes the D08 example pair identically --------------
{
  // The D08 prototype reports 207 cells / 8113.5 cost for the shortest mode
  // and 246 cells / 7261.5 for the terrain-aware mode on this pair. The port
  // must agree, so the app and the source pipeline never disagree.
  const bin = readFileSync('public/terrain/navigation_grid.bin');
  const decoded = decodeGrid(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer);
  const real: RoutingGrid = {
    width: decoded.width,
    height: decoded.height,
    cost: decoded.cost,
    slope: slopeFromCost(decoded.cost),
    mask: decoded.mask,
  };

  const shortest = route(real, [230, 30], [35, 235], 'shortest');
  const aware = route(real, [230, 30], [35, 235], 'terrain-aware');

  check('the shortest route matches the D08 cell count', shortest.cells === 207, String(shortest.cells));
  check('the shortest route matches the D08 cost', Math.abs(shortest.modeledCost! - 8113.5) < 1.0, String(shortest.modeledCost));
  check('the terrain-aware route matches the D08 cell count', aware.cells === 246, String(aware.cells));
  check('the terrain-aware route matches the D08 cost', Math.abs(aware.modeledCost! - 7261.5) < 1.0, String(aware.modeledCost));
}

// ---- 11. slope classes follow the D07 thresholds -----------------------------
{
  check('below 5 degrees is class 0', slopeClassOf(0) === 0);
  check('5 to 10 degrees is class 1', slopeClassOf(5) === 1 && slopeClassOf(9.99) === 1);
  check('10 to 15 degrees is class 2', slopeClassOf(10) === 2 && slopeClassOf(14.99) === 2);
  check('15 degrees and above is class 3', slopeClassOf(15) === 3 && slopeClassOf(27) === 3);
  check('an unknown slope is class 3', slopeClassOf(Number.NaN) === 3);
}

console.log(failures ? `\nCHECK: ${failures} failure(s)` : '\nCHECK: PASS');
process.exit(failures ? 1 : 0);
