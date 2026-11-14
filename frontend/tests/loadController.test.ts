/**
 * Deterministic regression tests for the async-race fix (QA: stale
 * successful load overriding a newer failure under React Strict Mode).
 *
 * Every asynchronous effect is driven by controlled deferred promises — no
 * timing-dependent sleeps. The controller is framework-free, so these tests
 * exercise the EXACT state machine the React app uses.
 *
 * Interleaving helper: `await flushMicrotasks()` after resolving a deferred
 * lets the controller progress to its next await (e.g. from "load resolved"
 * to "decode pending"), so tests can resolve each stage in a chosen order.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { VerifiedLoadController } from "../src/app/loadController.ts";
import type { ControllerState, LoadControllerDependencies } from "../src/app/loadController.ts";
import type { VerifiedPackages } from "../src/app/dataVerification.ts";
import type { NavigationGridModel } from "../src/navigationGrid/index.ts";
import type { ImageryMetadata } from "../src/app/imagery.ts";

class Deferred<T> {
  promise: Promise<T>;
  #resolve!: (value: T) => void;
  #reject!: (cause: unknown) => void;
  settled = false;
  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
  }
  resolve(value: T): void {
    this.settled = true;
    this.#resolve(value);
  }
  reject(cause: unknown): void {
    this.settled = true;
    this.#reject(cause);
  }
}

/** Drain pending microtasks deterministically (no timers). */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    await Promise.resolve();
  }
}

const HEX64 = "f".repeat(64);

/** Synthetic verified result; `marker` distinguishes results in ready state. */
function fakePackages(marker: number): VerifiedPackages {
  return {
    model: { width: marker, height: marker } as unknown as NavigationGridModel,
    imagery: { width: 100 + marker, height: 100 + marker } as unknown as ImageryMetadata,
    verification: {
      ok: true,
      checks: [
        {
          label: `fake packages marker ${marker}`,
          expectedSha256: HEX64,
          actualSha256: HEX64,
          ok: true,
          detail: "fake",
        },
      ],
    },
    terrainImage: { bytes: new ArrayBuffer(8), sha256: HEX64, mimeType: "image/png" },
  };
}

interface Harness {
  readonly controller: VerifiedLoadController;
  readonly states: ControllerState[];
  readonly created: string[];
  readonly revoked: string[];
  readonly signals: AbortSignal[];
  readonly loadDeferreds: Deferred<VerifiedPackages>[];
  readonly decodeDeferreds: Deferred<void>[];
  readonly urlCounter: () => number;
}

function createHarness(): Harness {
  const states: ControllerState[] = [];
  const created: string[] = [];
  const revoked: string[] = [];
  const signals: AbortSignal[] = [];
  const loadDeferreds: Deferred<VerifiedPackages>[] = [];
  const decodeDeferreds: Deferred<void>[] = [];
  let urlCounter = 0;

  const deps: LoadControllerDependencies = {
    loadPackages: (signal) => {
      signals.push(signal);
      const deferred = new Deferred<VerifiedPackages>();
      loadDeferreds.push(deferred);
      return deferred.promise;
    },
    createImageUrl: (terrainImage) => {
      urlCounter += 1;
      const url = `mock://terrain-${urlCounter}`;
      created.push(url);
      return url;
    },
    decodeImage: async () => {
      const deferred = new Deferred<void>();
      decodeDeferreds.push(deferred);
      await deferred.promise;
    },
    revokeUrl: (url) => revoked.push(url),
    onStateChange: (state) => states.push(state),
  };
  return { controller: new VerifiedLoadController(deps), states, created, revoked, signals, loadDeferreds, decodeDeferreds, urlCounter: () => urlCounter };
}

function lastState(states: ControllerState[]): ControllerState {
  const last = states[states.length - 1];
  assert.ok(last, "controller must have emitted at least one state");
  return last;
}

test("older SUCCESS, newer FAILURE: the newer error remains visible (QA race)", async () => {
  const h = createHarness();
  h.controller.start(); // load A
  h.controller.start(); // load B (e.g. Retry) — invalidates A
  assert.equal(h.signals.length, 2);
  assert.equal(h.signals[0]?.aborted, true, "superseded load must be aborted");

  // Newer load B fails.
  h.loadDeferreds[1]?.reject(new Error("HTTP 500"));
  await flushMicrotasks();
  assert.equal(lastState(h.states).status, "error");
  assert.match((lastState(h.states) as { message: string }).message, /HTTP 500/);

  // Older load A now succeeds — it must NOT overwrite the error.
  h.loadDeferreds[0]?.resolve(fakePackages(1));
  await flushMicrotasks();
  const finalState = lastState(h.states);
  assert.equal(finalState.status, "error", "stale success must not replace the newer error");
  if (finalState.status === "error") {
    assert.match(finalState.message, /HTTP 500/);
    assert.equal(finalState.generation, 2);
  }
  // The stale success never created or leaked a Blob URL.
  assert.equal(h.created.length, 0);
  assert.equal(h.revoked.length, 0);
});

test("older FAILURE, newer SUCCESS: the newer map remains visible", async () => {
  const h = createHarness();
  h.controller.start(); // A
  h.controller.start(); // B

  // B succeeds (load resolves, then its decode completes).
  h.loadDeferreds[1]?.resolve(fakePackages(2));
  await flushMicrotasks();
  h.decodeDeferreds[0]?.resolve();
  await flushMicrotasks();
  assert.equal(lastState(h.states).status, "ready");

  // Older load A now fails — must not overwrite the newer success.
  h.loadDeferreds[0]?.reject(new Error("older failure"));
  await flushMicrotasks();
  const finalState = lastState(h.states);
  assert.equal(finalState.status, "ready", "stale failure must not replace the newer map");
  if (finalState.status === "ready") {
    assert.equal(finalState.generation, 2);
    assert.equal((finalState.model as unknown as { width: number }).width, 2);
  }
  assert.equal(h.revoked.includes(h.created[0] ?? ""), false, "active URL stays alive");
});

test("two successful loads completing out of order: the newest result wins", async () => {
  const h = createHarness();
  h.controller.start(); // A
  h.controller.start(); // B

  // B completes first.
  h.loadDeferreds[1]?.resolve(fakePackages(2));
  await flushMicrotasks();
  h.decodeDeferreds[0]?.resolve(); // B's decode (first decode call)
  await flushMicrotasks();
  assert.equal(lastState(h.states).status, "ready");

  // A completes later — superseded, ignored entirely.
  h.loadDeferreds[0]?.resolve(fakePackages(1));
  await flushMicrotasks();
  h.decodeDeferreds[1]?.resolve(); // A's decode (second decode call)
  await flushMicrotasks();

  const finalState = lastState(h.states);
  assert.equal(finalState.status, "ready");
  if (finalState.status === "ready") {
    assert.equal(finalState.generation, 2, "newest generation stays committed");
    assert.equal(
      (finalState.model as unknown as { width: number }).width,
      2,
      "older result must not replace the newest",
    );
    assert.equal(
      finalState.verification.checks[0]?.label,
      "fake packages marker 2",
      "integrity panel shows the newest verification",
    );
  }
  // A's stale URL was never created; B's URL stays alive.
  assert.equal(h.created.length, 1);
  assert.equal(h.revoked.length, 0);
});

test("retry while a previous load is pending invalidates it", async () => {
  const h = createHarness();
  h.controller.start(); // A pending
  h.controller.start(); // retry

  h.loadDeferreds[1]?.resolve(fakePackages(2));
  await flushMicrotasks();
  h.decodeDeferreds[0]?.resolve(); // the retry's decode
  await flushMicrotasks();
  const finalState = lastState(h.states);
  assert.equal(finalState.status, "ready");
  if (finalState.status === "ready") {
    assert.equal(finalState.generation, 2);
  }
  assert.equal(h.created.length, 1);
});

test("React Strict Mode setup → cleanup → setup: attempt 1 is invalidated", async () => {
  const h = createHarness();
  h.controller.start(); // setup 1
  h.controller.dispose(); // cleanup 1
  h.controller.start(); // setup 2
  assert.equal(h.signals[0]?.aborted, true, "cleanup aborts attempt 1");

  // Attempt 1 resolves late: ignored.
  h.loadDeferreds[0]?.resolve(fakePackages(1));
  await flushMicrotasks();
  assert.equal(lastState(h.states).status, "loading");

  // Attempt 2 succeeds: the map renders.
  h.loadDeferreds[1]?.resolve(fakePackages(2));
  await flushMicrotasks();
  h.decodeDeferreds[0]?.resolve(); // attempt 2's decode (first decode call)
  await flushMicrotasks();
  const finalState = lastState(h.states);
  assert.equal(finalState.status, "ready");
  if (finalState.status === "ready") {
    assert.equal(finalState.generation >= 3, true);
    assert.equal(typeof finalState.terrainUrl, "string");
  }
});

test("unmount while loading: later resolution leaks no state or Blob URL", async () => {
  const h = createHarness();
  h.controller.start();
  h.controller.dispose();
  h.loadDeferreds[0]?.resolve(fakePackages(1));
  await h.decodeDeferreds[0]?.promise;
  await flushMicrotasks();
  assert.equal(lastState(h.states).status, "loading", "no state after dispose");
  assert.equal(h.created.length, 0, "stale attempt must not create a Blob URL");
});

test("unmount after successful Blob creation revokes the URL exactly once", async () => {
  const h = createHarness();
  h.controller.start();
  h.loadDeferreds[0]?.resolve(fakePackages(1));
  await flushMicrotasks();
  h.decodeDeferreds[0]?.resolve();
  await flushMicrotasks();
  assert.equal(lastState(h.states).status, "ready");
  assert.equal(h.created.length, 1);
  assert.equal(h.revoked.length, 0, "nothing to revoke while displayed");

  h.controller.dispose(); // unmount
  assert.deepEqual(h.revoked, [h.created[0]], "the active URL is revoked on unmount");

  // A late decode failure after dispose changes nothing.
  h.controller.handleImageDecodeError();
  await flushMicrotasks();
  assert.equal(lastState(h.states).status, "ready", "disposed controller cannot emit state");
});

test("decode of a superseded request is ignored and creates no Blob URL", async () => {
  const h = createHarness();
  h.controller.start(); // A
  h.loadDeferreds[0]?.resolve(fakePackages(1));
  await flushMicrotasks(); // A reaches its decode await

  // B supersedes while A's decode is pending.
  h.controller.start();
  assert.equal(h.signals[0]?.aborted, true);

  // A's decode resolves late: must not create a URL or emit ready.
  h.decodeDeferreds[0]?.resolve();
  await flushMicrotasks();
  assert.equal(h.created.length, 0, "superseded attempt must not create a Blob URL");
  assert.equal(lastState(h.states).status, "loading");

  // B completes normally.
  h.loadDeferreds[1]?.resolve(fakePackages(2));
  await flushMicrotasks();
  h.decodeDeferreds[1]?.resolve(); // B's decode
  await flushMicrotasks();
  assert.equal(lastState(h.states).status, "ready");
  if (lastState(h.states).status === "ready") {
    assert.equal(lastState(h.states).generation, 2);
  }
});

test("no premature Blob revocation: the displayed URL survives unrelated state changes", async () => {
  const h = createHarness();
  h.controller.start();
  h.loadDeferreds[0]?.resolve(fakePackages(1));
  await flushMicrotasks();
  h.decodeDeferreds[0]?.resolve();
  await flushMicrotasks();
  assert.equal(lastState(h.states).status, "ready");
  const url = h.created[0] ?? "";
  assert.equal(h.revoked.includes(url), false, "displayed URL is not revoked while in use");
});

test("decode failure on the CURRENT generation fails closed with the decode message", async () => {
  const h = createHarness();
  h.controller.start();
  h.loadDeferreds[0]?.resolve(fakePackages(1));
  await flushMicrotasks();
  h.decodeDeferreds[0]?.reject(new Error("verified PNG decode failed: bad bitmap"));
  await flushMicrotasks();
  const finalState = lastState(h.states);
  assert.equal(finalState.status, "error");
  if (finalState.status === "error") {
    assert.match(finalState.message, /decode/i);
  }
});
