import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { TERRAIN_SHA256 } from '../src/lib/terrain-pins.ts';

for (const [file, expected] of Object.entries(TERRAIN_SHA256)) {
  const actual = createHash('sha256').update(readFileSync(`public/terrain/${file}`)).digest('hex');
  if (actual !== expected) throw new Error(`Terrain integrity check failed for ${file}; review data and pins before updating.`);
}
console.log('Terrain assets match reviewed SHA-256 pins');
