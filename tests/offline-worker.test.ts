import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('pre-cached static assets remain available when the incoming request has a different Vary header', async () => {
  const scope = 'https://example.test/';
  const listeners = new Map<string, (event: any) => void>();
  const response = new Response('cached script', { headers: { Vary: 'Origin' } });
  const cache = { match: async (key: string | Request) => typeof key === 'string' && key === scope + 'assets/app.js' ? response : undefined };
  const context = { self: { registration: { scope }, addEventListener: (type: string, fn: (event: any) => void) => listeners.set(type, fn) }, caches: { open: async () => cache }, REVISION: 'test', ASSETS: ['assets/app.js'], URL, Request, Set, fetch: async () => { throw new Error('offline'); } };
  vm.runInNewContext(readFileSync('scripts/offline-worker.js', 'utf8'), context);
  let result: Promise<Response> | undefined;
  const request = new Request(scope + 'assets/app.js', { headers: { Origin: scope } });
  listeners.get('fetch')!({ request, respondWith: (p: Promise<Response>) => { result = p; } });
  assert.equal(await (await result!).text(), 'cached script');
});
