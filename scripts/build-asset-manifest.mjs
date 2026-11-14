// Emit the SHA-256 asset manifest the browser verifies at startup.
//
// Every runtime asset in public/terrain is hashed into
// public/terrain/asset_manifest.json. The browser (src/lib/data.ts) downloads
// each payload once, hashes the exact bytes it parses, and checks them against
// this manifest AND the pinned accepted digests in src/lib/acceptedAssets.ts.
// Replacing both a payload and this manifest therefore still fails: the pinned
// reference is the trust anchor, not the served manifest.
//
// Deterministic: identical inputs produce identical digests, so the pinned
// values in acceptedAssets.ts stay valid across rebuilds on the same toolchain.
//
// Usage: node scripts/build-asset-manifest.mjs <terrain-dir>

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const TERRAIN_DIR = process.argv[2];
if (!TERRAIN_DIR) {
  console.error('usage: node scripts/build-asset-manifest.mjs <terrain-dir>');
  process.exit(1);
}

const RUNTIME_FILES = [
  'navigation_grid.bin',
  'grid_metadata.json',
  'ctx-jezero-aoi.png',
  'ctx-aoi-meta.json',
  'elevation.bin',
  'hazard.bin',
  'overlay_metadata.json',
];

const files = {};
for (const filename of RUNTIME_FILES) {
  const bytes = readFileSync(join(TERRAIN_DIR, filename));
  files[filename] = createHash('sha256').update(bytes).digest('hex');
}

const manifest = {
  schemaVersion: '1.0',
  note: 'SHA-256 digests of the runtime terrain assets; the browser refuses to render unverified bytes.',
  files,
};

writeFileSync(join(TERRAIN_DIR, 'asset_manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${join(TERRAIN_DIR, 'asset_manifest.json')} (${RUNTIME_FILES.length} files hashed)`);
