// Self-check for the routing engine and the grid<->pixel mapping.
//
// Run: node --experimental-strip-types scripts/check-routing.mts
// (or via npm run check)

import { readFileSync } from 'node:fs';
import { findPath, measure, indexOf, isTraversable, type NavigationGrid, type GridPoint } from '../src/lib/router.ts';
import { imagePixelToGrid, gridToImagePixel, decodeGrid } from '../src/lib/data.ts';
import { greatCircle, cellToProjected } from '../src/lib/geo.ts';

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
function makeGrid(): NavigationGrid {
  const w = 5;
  const h = 5;
  const cost = new Array<number | null>(w * h).fill(1);
  const validDataMask = new Array<0 | 1>(w * h).fill(1);
  const blockedMask = new Array<0 | 1>(w * h).fill(0);
  // Block the middle cell so every route must detour.
  cost[2 * w + 2] = null;
  blockedMask[2 * w + 2] = 1;
  return { schemaVersion: '1.0', width: w, height: h, cost, validDataMask, blockedMask };
}

const grid = makeGrid();
const idx = (r: number, c: number) => indexOf(grid, r, c);

// ---- 1. blocked cells are excluded ------------------------------------------
{
  const r = findPath(grid, [0, 0], [4, 4], 'shortest');
  check('route avoids the blocked cell', !r.path.some(([rr, cc]) => rr === 2 && cc === 2), JSON.stringify(r.path));
  check('route status is ok', r.status === 'ok', r.error ?? '');
}

// ---- 2. the route is continuous ----------------------------------------------
{
  const r = findPath(grid, [0, 0], [4, 4], 'shortest');
  let continuous = true;
  for (let i = 1; i < r.path.length; i += 1) {
    const dr = Math.abs(r.path[i][0] - r.path[i - 1][0]);
    const dc = Math.abs(r.path[i][1] - r.path[i - 1][1]);
    if (!(dr + dc === 1 || (dr === 1 && dc === 1))) continuous = false;
  }
  check('every step is a single orthogonal or diagonal move', continuous);
  check('path starts and ends where asked',
    r.path[0][0] === 0 && r.path[0][1] === 0 && r.path[r.path.length - 1][0] === 4 && r.path[r.path.length - 1][1] === 4);
}

// ---- 3. invalid requests are rejected ----------------------------------------
{
  const oob = findPath(grid, [0, 0], [9, 9], 'shortest');
  check('out-of-bounds end is rejected', oob.status === 'invalid-request', oob.status);

  const blockedEnd = findPath(grid, [0, 0], [2, 2], 'shortest');
  check('blocked end is rejected', blockedEnd.status === 'invalid-request', blockedEnd.status);

  const same = findPath(grid, [1, 1], [1, 1], 'shortest');
  check('same start and end gives a one-cell path', same.status === 'ok' && same.path.length === 1, JSON.stringify(same.path));
}

// ---- 4. no diagonal corner cutting -------------------------------------------
{
  // A grid where the only diagonal shortcut is cut by a blocked orthogonal cell.
  const w = 3;
  const h = 3;
  const cost = new Array<number | null>(9).fill(1);
  const validDataMask = new Array<0 | 1>(9).fill(1);
  const blockedMask = new Array<0 | 1>(9).fill(0);
  // Block (0,1): the diagonal from (0,0) to (1,1) must not be taken.
  cost[1] = null;
  blockedMask[1] = 1;
  const g2: NavigationGrid = { schemaVersion: '1.0', width: w, height: h, cost, validDataMask, blockedMask };
  const r = findPath(g2, [0, 0], [1, 1], 'shortest');
  const cutCorner = r.path.some(([rr, cc], i) => i > 0 && Math.abs(rr - r.path[i - 1][0]) === 1 && Math.abs(cc - r.path[i - 1][1]) === 1);
  check('a diagonal across a blocked neighbour is refused', !cutCorner, JSON.stringify(r.path));
}

// ---- 5. metrics follow the M5-03 convention ---------------------------------
{
  const straight = findPath(grid, [0, 0], [0, 4], 'shortest');
  const m = straight.metrics!;
  check('four orthogonal steps measure 80 m', Math.abs(m.distanceMeters - 80) < 1e-6, String(m.distanceMeters));
  check('cell count matches the path length', m.cells === straight.path.length);
}

{
  const diag = findPath(grid, [0, 0], [1, 1], 'shortest');
  const m = diag.metrics!;
  const expected = 20 * Math.SQRT2;
  check('one diagonal step measures 28.28 m', Math.abs(m.distanceMeters - expected) < 1e-6, String(m.distanceMeters));
}

// ---- 6. the two modes choose different paths --------------------------------
{
  // Two ways around: the short way crosses rough ground, the long way is gentle.
  const w = 3;
  const h = 3;
  const cost: (number | null)[] = [
    1, 9, 1,
    1, 1, 1,
    1, 1, 1,
  ];
  const g2: NavigationGrid = {
    schemaVersion: '1.0', width: w, height: h, cost,
    validDataMask: [1, 1, 1, 1, 1, 1, 1, 1, 1], blockedMask: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  };
  const shortest = findPath(g2, [0, 0], [0, 2], 'shortest');
  const aware = findPath(g2, [0, 0], [0, 2], 'terrain-aware');

  check('the shortest mode takes the direct two-step line', shortest.path.length === 3, JSON.stringify(shortest.path));
  check('the shortest mode crosses the rough cell', shortest.path.some(([r, c]) => r === 0 && c === 1), JSON.stringify(shortest.path));
  check('the terrain-aware mode avoids the rough cell', !aware.path.some(([r, c]) => r === 0 && c === 1), JSON.stringify(aware.path));
  check('the terrain-aware route has the lower mean friction',
    aware.metrics!.meanFriction < shortest.metrics!.meanFriction,
    `aware=${aware.metrics!.meanFriction.toFixed(2)} shortest=${shortest.metrics!.meanFriction.toFixed(2)}`);
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
  check('one cell is the ground distance for the projected 20 m step',
    Math.abs(d1 - expected) < 0.05, `${d1} vs ${expected}`);
  check('two cells are further than one', d2 > d1, `${d1} vs ${d2}`);
  check('the north-south step stays 20 m', Math.abs(greatCircle(cellToProjected(0, 0), cellToProjected(1, 0)) - 20) < 1e-6);
}

// ---- 8. the real grid decodes and matches the export -------------------------
{
  const { readFileSync } = await import('node:fs');
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
      if (d !== null) nullMismatch += 1;
    } else if (d === null || Math.abs(d - j) > 1e-9) {
      mismatch += 1;
    }
  }
  check('every cost matches the JSON export exactly', mismatch === 0 && nullMismatch === 0, `${mismatch} value, ${nullMismatch} null mismatches`);

  const blockedInJson = json.cost.filter((c: number | null) => c === null).length;
  const blockedInBin = decoded.cost.filter((c) => c === null).length;
  check('blocked and unknown cells survive the round trip', blockedInJson === blockedInBin, `${blockedInJson} vs ${blockedInBin}`);
}

// ---- 9. pixel <-> grid conversion (M1-04) ------------------------------------
{
  const meta = JSON.parse(readFileSyncSyncMeta());
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

function readFileSyncSyncMeta(): string {
  return readFileSync('public/terrain/ctx-aoi-meta.json', 'utf8');
}

console.log(failures ? `\nCHECK: ${failures} failure(s)` : '\nCHECK: PASS');
process.exit(failures ? 1 : 0);
