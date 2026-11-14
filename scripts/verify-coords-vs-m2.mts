// Cross-check M1's coordinate math against the M2 loader's affine contract.
//
// M2's loader (frontend/src/navigationGrid/coordinates.ts) maps a cell to
// projected metres with the corner convention x = a*col + b*row + c,
// y = d*col + e*row + f, and the pixel-centre convention with (col+0.5,
// row+0.5). M1 must agree, or a route drawn on the image would not land on
// the cell the router chose.
//
// Usage: node scripts/verify-coords-vs-m2.mts

import { readFileSync } from 'node:fs';
import { cellToProjected, GRID_ORIGIN_X, GRID_ORIGIN_Y, GRID_WIDTH, GRID_HEIGHT } from '../src/lib/geo.ts';

const metadata = JSON.parse(readFileSync('Data/navigation/grid_metadata.json', 'utf8'));
const [a, b, c, d, e, f] = metadata.affine.values as number[];

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`OK  ${name}`);
  else {
    failures += 1;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// M2's corner convention, transcribed from the loader contract.
function m2CellCorner(row: number, col: number) {
  return { x: a * col + b * row + c, y: d * col + e * row + f };
}
function m2CellCenter(row: number, col: number) {
  const u = col + 0.5;
  const v = row + 0.5;
  return { x: a * u + b * v + c, y: d * u + e * v + f };
}

check('the affine is the one M1 assumes',
  a === 20 && b === 0 && c === GRID_ORIGIN_X && d === 0 && e === -20 && f === GRID_ORIGIN_Y,
  JSON.stringify(metadata.affine.values));

// Cell centre: M1's cellToProjected returns the corner, so the centre is the
// corner plus half a cell to the south.
let maxCorner = 0;
let maxCentre = 0;
for (let r = 0; r < GRID_HEIGHT; r += 1) {
  for (let col = 0; col < GRID_WIDTH; col += 1) {
    const mine = cellToProjected(r, col);
    const corner = m2CellCorner(r, col);
    maxCorner = Math.max(maxCorner, Math.abs(mine.x - corner.x), Math.abs(mine.y - corner.y));

    const mineCentre = { x: mine.x + 10, y: mine.y - 10 };
    const centre = m2CellCenter(r, col);
    maxCentre = Math.max(maxCentre, Math.abs(mineCentre.x - centre.x), Math.abs(mineCentre.y - centre.y));
  }
}
check('every cell corner matches the M2 affine', maxCorner < 1e-6, `max error ${maxCorner}`);
check('every cell centre matches the M2 affine', maxCentre < 1e-6, `max error ${maxCentre}`);

// The grid bounds must match the metadata bounds.
const west = m2CellCorner(0, 0).x;
const north = m2CellCorner(0, 0).y;
const east = m2CellCorner(0, GRID_WIDTH).x;
const south = m2CellCorner(GRID_HEIGHT, 0).y;
const [bx0, by0, bx1, by1] = metadata.bounds as number[];
check('the grid west edge matches the metadata bounds', Math.abs(west - bx0) < 1e-6, `${west} vs ${bx0}`);
check('the grid north edge matches the metadata bounds', Math.abs(north - by1) < 1e-6, `${north} vs ${by1}`);
check('the grid east edge matches the metadata bounds', Math.abs(east - bx1) < 1e-6, `${east} vs ${bx1}`);
check('the grid south edge matches the metadata bounds', Math.abs(south - by0) < 1e-6, `${south} vs ${by0}`);

console.log(failures ? `\nCHECK: ${failures} failure(s)` : '\nCHECK: PASS');
process.exit(failures ? 1 : 0);
