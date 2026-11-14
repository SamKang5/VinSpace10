import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadAppData } from '../src/lib/data.ts';

const paths = ['navigation_grid.bin', 'grid_metadata.json', 'ctx-aoi-meta.json', 'elevation.bin', 'hazard.bin', 'overlay_metadata.json', 'ctx-jezero-aoi.png'];
const assets = new Map(paths.map((p) => [p, readFileSync(`public/terrain/${p}`)]));

async function loadWith(change?: (path: string, bytes: Buffer) => Buffer) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const name = String(input).split('/').pop()!;
    const source = assets.get(name);
    assert.ok(source, `unexpected request ${name}`);
    const bytes = change ? change(name, Buffer.from(source)) : Buffer.from(source);
    return new Response(bytes);
  };
  try { return await loadAppData(); } finally { globalThis.fetch = original; }
}

test('trusted terrain assets load and produce the published grid', async () => {
  const data = await loadWith();
  assert.equal(data.routing.width, 267);
  assert.equal(data.routing.cost[230 * 267 + 30] > 0, true);
  assert.ok(data.imageBytes.byteLength > 0);
});

test('a same-length modified finite cost is rejected', async () => {
  await assert.rejects(() => loadWith((p,b) => { if (p === 'navigation_grid.bin') b.writeFloatLE(9, 12 + (230 * 267 + 30) * 4); return b; }), /integrity/i);
});

test('swapped finite costs are rejected even with unchanged counts', async () => {
  await assert.rejects(() => loadWith((p,b) => { if (p === 'navigation_grid.bin') { const a=12+12*4, c=12+13*4; const x=b.readFloatLE(a), y=b.readFloatLE(c); assert.ok(Number.isFinite(x) && Number.isFinite(y) && x !== y); b.writeFloatLE(y,a); b.writeFloatLE(x,c); } return b; }), /integrity/i);
});

test('truncated binary is rejected', async () => {
  await assert.rejects(() => loadWith((p,b) => p === 'navigation_grid.bin' ? b.subarray(0,b.length-1) : b), /integrity/i);
});

test('corrupted or replaced metadata and overlay are rejected', async () => {
  for (const file of ['grid_metadata.json','ctx-aoi-meta.json','overlay_metadata.json','elevation.bin','hazard.bin','ctx-jezero-aoi.png']) {
    await assert.rejects(() => loadWith((p,b) => { if (p === file) b[0] ^= 1; return b; }), /integrity/i, file);
  }
});

test('valid but mismatched metadata is rejected', async () => {
  await assert.rejects(() => loadWith((p,b) => {
    if (p !== 'ctx-aoi-meta.json') return b;
    const meta = JSON.parse(b.toString('utf8'));
    meta.grid.colOffset = 1;
    return Buffer.from(JSON.stringify(meta));
  }), /integrity/i);
});
