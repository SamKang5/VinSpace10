/**
 * Imagery metadata validation tests: parse/validate the real
 * imagery_metadata.json, cross-check it against the verified grid, verify
 * the served package over HTTP against checksums.sha256 (including a
 * corrupted-payload simulation), and validate the contract route endpoints.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { expectImageryMatchesGrid, parseImageryMetadata, ImageryValidationError } from "../src/app/imagery.ts";
import { loadMarsNavigationGrid } from "../src/navigationGrid/index.ts";
import { DATA_DIR, loadRealFixtures, makeImageryFixture, readPublicJson } from "./helpers.ts";
import { makeGrid, makeMetadata } from "./fixtures.ts";

const { model, imagery } = loadRealFixtures();

test("real imagery metadata parses with the contracted geometry", () => {
  assert.equal(imagery.width, 1068);
  assert.equal(imagery.height, 1068);
  assert.equal(imagery.mimeType, "image/png");
  assert.deepEqual([...imagery.navigationGrid.pixelsPerCell], [4, 4]);
  assert.equal(imagery.navigationGrid.width, 267);
  assert.equal(imagery.navigationGrid.height, 267);
  assert.deepEqual([...imagery.bounds], [...model.metadata.bounds]);
  assert.equal(imagery.image, "mars_terrain.png");
  assert.equal(imagery.affine.values[0], 5); // a: 5 m per image pixel
  assert.equal(imagery.affine.values[1], 0); // b: no rotation
  assert.equal(imagery.affine.values[3], 0); // d
  assert.equal(imagery.affine.values[4], -5); // e: rows increase southward
});

test("imagery metadata cross-links the exact served grid metadata bytes", () => {
  const declared = imagery.navigationGrid.metadataSha256;
  const gridMetadataBytes = readFileSync(join(DATA_DIR, "M2_02", "grid_metadata.json"));
  assert.equal(createHash("sha256").update(gridMetadataBytes).digest("hex"), declared);
});

test("route endpoints in the metadata match the grid and the handoff contract", () => {
  assert.equal(imagery.routeEndpoints.length, 2);
  const start = imagery.routeEndpoints[0];
  const goal = imagery.routeEndpoints[1];
  assert.ok(start, "missing start endpoint");
  assert.ok(goal, "missing goal endpoint");
  assert.equal(start.row, 230);
  assert.equal(start.col, 30);
  assert.deepEqual([...start.imageCornerCoordinates], [122, 922]);
  assert.equal(start.cost, 1.6363859176635742);
  assert.equal(goal.row, 35);
  assert.equal(goal.col, 235);
  assert.deepEqual([...goal.imageCornerCoordinates], [942, 142]);
  assert.equal(goal.cost, 1.1645629405975342);
  // The loader model agrees on traversability and cost for both.
  assert.equal(model.getCell(start.row, start.col).cost, start.cost);
  assert.equal(model.getCell(goal.row, goal.col).cost, goal.cost);
  assert.equal(model.isTraversable(start.row, start.col), true);
  assert.equal(model.isTraversable(goal.row, goal.col), true);
});

test("parseImageryMetadata rejects corrupted metadata", () => {
  const raw = readPublicJson("data/M2_04/imagery_metadata.json") as Record<string, unknown>;

  const mutate = (mutator: (draft: Record<string, unknown>) => void): unknown => {
    const draft = structuredClone(raw) as Record<string, unknown>;
    mutator(draft);
    return draft;
  };

  const cases: ReadonlyArray<readonly [string, unknown]> = [
    ["width 0", mutate((d) => void (d["width"] = 0))],
    ["bad mimeType", mutate((d) => void (d["mimeType"] = "image/webp"))],
    ["non-finite affine", mutate((d) => void ((d["affine"] as Record<string, unknown>)["values"] = [5, 0, 1, 0, -5, Number.NaN]))],
    ["bounds order", mutate((d) => void (d["bounds"] = [1, 2, 0, 3]))],
    ["bad hex digest", mutate((d) => void ((d["navigationGrid"] as Record<string, unknown>)["metadataSha256"] = "nope"))],
    ["negative endpoint row", mutate((d) => void (((d["routeEndpoints"] as unknown[])[0] as Record<string, unknown>)["row"] = -1))],
    ["low endpoint cost", mutate((d) => void (((d["routeEndpoints"] as unknown[])[0] as Record<string, unknown>)["cost"] = 0.5))],
    ["unknown key", mutate((d) => void (d["routing"] = "schema drift"))],
    ["wrong schemaVersion", mutate((d) => void (d["schemaVersion"] = "2.0"))],
  ];
  for (const [label, corrupted] of cases) {
    assert.throws(() => parseImageryMetadata(corrupted), ImageryValidationError, `expected rejection: ${label}`);
  }
});

test("expectImageryMatchesGrid accepts the consistent fixture pair and rejects tampering", () => {
  const fixtureModel = loadMarsNavigationGrid(makeGrid() as unknown, makeMetadata() as unknown);
  const fixtureImagery = makeImageryFixture();
  expectImageryMatchesGrid(fixtureImagery, fixtureModel); // consistent: no throw

  const endpoint = fixtureImagery.routeEndpoints[0];
  assert.ok(endpoint, "fixture must declare an endpoint");
  const tamperedCost: typeof fixtureImagery = {
    ...fixtureImagery,
    routeEndpoints: [{ ...endpoint, cost: 2.5 }],
  };
  assert.throws(() => expectImageryMatchesGrid(tamperedCost, fixtureModel), ImageryValidationError);

  const tamperedBounds: typeof fixtureImagery = { ...fixtureImagery, bounds: [100, 170, 130, 199] };
  assert.throws(() => expectImageryMatchesGrid(tamperedBounds, fixtureModel), ImageryValidationError);
});

// Package-level checksum verification scenarios (tampered payloads, manifest
// replacement, missing/malformed manifests, network failures) live in
// dataVerification.test.ts, covering the startup gate the app actually uses.
