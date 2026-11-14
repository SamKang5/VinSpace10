import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitTestRoutes } from '../src/lib/routeHitTest.ts';

test('route picking follows segments, screen-pixel tolerance, and visible route order', () => {
  const shortest = { id: 'shortest' as const, active: true, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
  const terrain = { id: 'terrain-aware' as const, active: false, points: [{ x: 0, y: 20 }, { x: 100, y: 20 }] };
  assert.equal(hitTestRoutes([shortest, terrain], { x: 50, y: 8 }, 9), 'shortest');
  assert.equal(hitTestRoutes([shortest, terrain], { x: 50, y: 11 }, 9), 'terrain-aware');
  assert.equal(hitTestRoutes([shortest], { x: 50, y: 10 }, 9), null);
  assert.equal(hitTestRoutes([shortest], { x: 50, y: 17 }, 18), 'shortest');
  assert.equal(hitTestRoutes([shortest], { x: 110, y: 0 }, 9), null);
  assert.equal(hitTestRoutes([shortest], { x: -8, y: 0 }, 9), 'shortest');
  assert.equal(hitTestRoutes([shortest, { ...terrain, points: shortest.points }], { x: 50, y: 0 }, 9), 'shortest');
  assert.equal(hitTestRoutes([{ ...shortest, active: false }, { ...terrain, active: true, points: shortest.points }], { x: 50, y: 0 }, 9), 'terrain-aware');
  assert.equal(hitTestRoutes([{ ...shortest, points: [{ x: 4, y: 4 }] }], { x: 4, y: 4 }, 9), 'shortest');
  assert.equal(hitTestRoutes([{ ...shortest, points: [] }], { x: 0, y: 0 }, 9), null);
  assert.equal(hitTestRoutes([{ ...shortest, points: [{ x: 0, y: 0 }, { x: 100, y: 100 }] }], { x: 50, y: 50 }, 9), 'shortest');
});
