/**
 * Regression tests for the startup data verification gate (QA Bug 1).
 *
 * The QA finding: a structurally valid but modified `navigation_grid.json`
 * response still rendered with a "SHA-256 integrity PASS" badge, because
 * only the imagery manifest and the grid-metadata cross-link were checked.
 * The gate now hashes the exact bytes it parses and compares them with a
 * pinned accepted package reference AND both served manifests.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  loadVerifiedPackages,
  parseChecksumManifest,
  sha256Hex,
  PackageVerificationError,
} from "../src/app/dataVerification.ts";
import {
  ACCEPTED_IMAGERY_PACKAGE,
  ACCEPTED_NAVIGATION_PACKAGE,
} from "../src/app/acceptedPackages.ts";
import { DATA_DIR, PUBLIC_DIR, startStaticServer } from "./helpers.ts";

const realGrid = () => readFileSync(join(DATA_DIR, "M2_02", "navigation_grid.json"), "utf8");

/**
 * Schema-valid tampering, exactly as the QA report reproduced it: change one
 * supported finite cost to 999 without touching metadata, masks or counts.
 */
function tamperedGrid(): string {
  const grid = JSON.parse(realGrid()) as { cost: Array<number | null> };
  const index = grid.cost.findIndex((c) => c !== null);
  assert.ok(index >= 0, "expected a finite cost to tamper");
  grid.cost[index] = 999;
  return JSON.stringify(grid);
}

/** Replace both the payload and its manifest entry (the cover-up attempt). */
function tamperedGridWithMatchingManifest(): { grid: string; manifest: string } {
  const grid = tamperedGrid();
  const tamperedDigest = createHash("sha256").update(grid).digest("hex");
  const lines = readFileSync(join(DATA_DIR, "M2_02", "checksums.sha256"), "utf8").split(/\r?\n/);
  const rewritten = lines
    .map((line) => (line.startsWith("e7687e27") ? `${tamperedDigest}  navigation_grid.json` : line))
    .join("\n");
  return { grid, manifest: rewritten };
}

const NAV = "data/M2_02";
const IMG = "data/M2_04";

test("loadVerifiedPackages accepts the untouched served packages and verifies all payloads", async () => {
  const { server, port } = await startStaticServer();
  try {
    const result = await loadVerifiedPackages(`http://127.0.0.1:${port}/${NAV}`, `http://127.0.0.1:${port}/${IMG}`);
    assert.equal(result.verification.ok, true);
    assert.equal(result.model.width, 267);
    assert.equal(result.model.height, 267);
    assert.equal(result.imagery.width, 1068);
    // Every manifest entry (8 files) is byte-hashed: all checks pass and
    // every check carries the ACTUAL hashed digest, not a manifest-only
    // comparison.
    assert.equal(result.verification.checks.length, 8);
    const labels = result.verification.checks.map((c) => c.label);
    assert.ok(labels.includes("runtime asset: navigation_grid.json"), "navigation_grid.json must be verified");
    assert.ok(labels.includes("runtime asset: grid_metadata.json"), "grid_metadata.json must be verified");
    assert.ok(labels.includes("runtime asset: mars_terrain.png"), "mars_terrain.png must be verified");
    assert.ok(labels.includes("runtime asset: imagery_metadata.json"), "imagery_metadata.json must be verified");
    for (const check of result.verification.checks) {
      assert.equal(check.ok, true, `${check.label}: ${check.detail}`);
      assert.notEqual(check.actualSha256, null, `${check.label} must be byte-hashed, not manifest-only`);
    }
  } finally {
    server.close();
  }
});

test("the returned terrain image bytes are exactly the verified accepted PNG (QA Fix 1)", async () => {
  const { server, port } = await startStaticServer();
  try {
    const result = await loadVerifiedPackages(`http://127.0.0.1:${port}/${NAV}`, `http://127.0.0.1:${port}/${IMG}`);
    // The gate hands the caller the same byte buffer it hashed. Whatever the
    // app renders derives from THESE bytes — a different response for any
    // subsequent request to the original PNG URL is never requested.
    const digest = await sha256Hex(result.terrainImage.bytes);
    assert.equal(digest, result.terrainImage.sha256);
    assert.equal(
      result.terrainImage.sha256,
      ACCEPTED_IMAGERY_PACKAGE.manifestEntries["mars_terrain.png"],
      "verified PNG bytes must hash to the accepted digest",
    );
    assert.equal(result.terrainImage.mimeType, "image/png");
    assert.equal(result.terrainImage.bytes.byteLength, 531_304);
  } finally {
    server.close();
  }
});

test("a modified but schema-valid navigation cost is rejected (QA Bug 1 regression)", async () => {
  const { server, port } = await startStaticServer({ [`${NAV}/navigation_grid.json`]: tamperedGrid() });
  try {
    await assert.rejects(
      () => loadVerifiedPackages(`http://127.0.0.1:${port}/${NAV}`, `http://127.0.0.1:${port}/${IMG}`),
      (error: unknown) => {
        assert.ok(error instanceof PackageVerificationError, `unexpected error: ${String(error)}`);
        assert.match(error.message, /navigation_grid\.json/);
        assert.match(error.message, /do not match the accepted package digest/);
        // The model must never be produced for tampered bytes.
        return true;
      },
    );
  } finally {
    server.close();
  }
});

test("replacing the payload AND its manifest entry together is still rejected", async () => {
  const { grid, manifest } = tamperedGridWithMatchingManifest();
  const { server, port } = await startStaticServer({
    [`${NAV}/navigation_grid.json`]: grid,
    [`${NAV}/checksums.sha256`]: manifest,
  });
  try {
    await assert.rejects(
      () => loadVerifiedPackages(`http://127.0.0.1:${port}/${NAV}`, `http://127.0.0.1:${port}/${IMG}`),
      (error: unknown) => {
        assert.ok(error instanceof PackageVerificationError);
        // The pinned accepted reference catches the manifest substitution…
        assert.match(error.message, /does not match the accepted reference/);
        // …and the payload mismatch against the pinned digest.
        assert.match(error.message, /navigation_grid\.json/);
        return true;
      },
    );
  } finally {
    server.close();
  }
});

test("a missing navigation manifest is rejected", async () => {
  const { server, port } = await startStaticServer({ [`${NAV}/checksums.sha256`]: null });
  try {
    await assert.rejects(
      () => loadVerifiedPackages(`http://127.0.0.1:${port}/${NAV}`, `http://127.0.0.1:${port}/${IMG}`),
      (error: unknown) => {
        assert.ok(error instanceof PackageVerificationError);
        assert.match(error.message, /checksums\.sha256.*HTTP 404/);
        return true;
      },
    );
  } finally {
    server.close();
  }
});

test("a missing navigation grid payload is rejected", async () => {
  const { server, port } = await startStaticServer({ [`${NAV}/navigation_grid.json`]: null });
  try {
    await assert.rejects(
      () => loadVerifiedPackages(`http://127.0.0.1:${port}/${NAV}`, `http://127.0.0.1:${port}/${IMG}`),
      (error: unknown) => {
        assert.ok(error instanceof PackageVerificationError);
        assert.match(error.message, /navigation_grid\.json.*HTTP 404/);
        return true;
      },
    );
  } finally {
    server.close();
  }
});

test("a malformed navigation manifest is rejected", async () => {
  const { server, port } = await startStaticServer({
    [`${NAV}/checksums.sha256`]: "this is not a checksum manifest\n",
  });
  try {
    await assert.rejects(
      () => loadVerifiedPackages(`http://127.0.0.1:${port}/${NAV}`, `http://127.0.0.1:${port}/${IMG}`),
      (error: unknown) => {
        assert.ok(error instanceof PackageVerificationError);
        assert.match(error.message, /malformed/);
        return true;
      },
    );
  } finally {
    server.close();
  }
});

test("an imagery metadata tamper is rejected via the imagery manifest", async () => {
  const imageryMeta = JSON.parse(
    readFileSync(join(PUBLIC_DIR, IMG, "imagery_metadata.json"), "utf8"),
  ) as Record<string, unknown>;
  (imageryMeta["navigationGrid"] as Record<string, unknown>)["metadataSha256"] = "f".repeat(64);
  const { server, port } = await startStaticServer({
    [`${IMG}/imagery_metadata.json`]: JSON.stringify(imageryMeta),
  });
  try {
    await assert.rejects(
      () => loadVerifiedPackages(`http://127.0.0.1:${port}/${NAV}`, `http://127.0.0.1:${port}/${IMG}`),
      PackageVerificationError,
    );
  } finally {
    server.close();
  }
});

test("a missing imagery PNG is rejected", async () => {
  const { server, port } = await startStaticServer({ [`${IMG}/mars_terrain.png`]: null });
  try {
    await assert.rejects(
      () => loadVerifiedPackages(`http://127.0.0.1:${port}/${NAV}`, `http://127.0.0.1:${port}/${IMG}`),
      (error: unknown) => {
        assert.ok(error instanceof PackageVerificationError);
        assert.match(error.message, /mars_terrain\.png.*HTTP 404/);
        return true;
      },
    );
  } finally {
    server.close();
  }
});

test("a byte-tampered documentation file (README) is rejected, not manifest-only compared", async () => {
  // Before this fix, README/report entries were compared against the served
  // manifest digest only — modified bytes with an unchanged manifest passed.
  const { server, port } = await startStaticServer({
    [`${NAV}/README.md`]: "# M2-02 navigation grid — TAMPERED DOCUMENTATION\n",
  });
  try {
    await assert.rejects(
      () => loadVerifiedPackages(`http://127.0.0.1:${port}/${NAV}`, `http://127.0.0.1:${port}/${IMG}`),
      (error: unknown) => {
        assert.ok(error instanceof PackageVerificationError);
        assert.match(error.message, /README\.md/);
        assert.match(error.message, /do not match the accepted package digest/);
        return true;
      },
    );
  } finally {
    server.close();
  }
});

test("a network-level failure (unreachable origin) is rejected with a clear error", async () => {
  // Port 9 on 127.0.0.1 is a discard port; nothing listens there.
  await assert.rejects(
    () => loadVerifiedPackages("http://127.0.0.1:9/data/M2_02", "http://127.0.0.1:9/data/M2_04"),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /fetch failed|ECONNREFUSED/i);
      return true;
    },
  );
});

test("parseChecksumManifest enforces strict sha256 entries", () => {
  const good = parseChecksumManifest(
    `${"a".repeat(64)}  navigation_grid.json\r\n${"b".repeat(64)}  README.md\n\n`,
    "test",
  );
  assert.equal(good.size, 2);
  assert.equal(good.get("navigation_grid.json"), "a".repeat(64));
  assert.throws(() => parseChecksumManifest("", "empty"), PackageVerificationError);
  assert.throws(() => parseChecksumManifest("zzz  file.json", "badhash"), PackageVerificationError);
  assert.throws(() => parseChecksumManifest(`${"a".repeat(64)}  a.json\n${"b".repeat(64)}  a.json`, "dupe"), /more than once/);
});

test("the pinned accepted digests match the actual served bytes (drift guard)", () => {
  // If the data team refreshes a package, these pins must be updated in the
  // same change; a stale pin fails here instead of silently at runtime.
  for (const [filename, digest] of Object.entries(ACCEPTED_NAVIGATION_PACKAGE.manifestEntries)) {
    const bytes = readFileSync(join(PUBLIC_DIR, NAV, filename));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), digest, `accepted pin drifted: M2_02/${filename}`);
  }
  for (const [filename, digest] of Object.entries(ACCEPTED_IMAGERY_PACKAGE.manifestEntries)) {
    const bytes = readFileSync(join(PUBLIC_DIR, IMG, filename));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), digest, `accepted pin drifted: M2_04/${filename}`);
  }
});
