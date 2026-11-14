/**
 * Priority-A regression tests: every runtime asset the app downloads is
 * SHA-256 verified against the served asset manifest AND the pinned accepted
 * digests before the app data is returned.
 *
 * Also guards the pinned accepted reference itself against drift from the
 * built assets (a data refresh must update the pins in the same change).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import {
  AssetVerificationError,
  assetUrls,
  loadAppData,
  sha256Hex,
} from "../src/lib/data.ts";
import { ACCEPTED_TERRAIN_ASSETS } from "../src/lib/acceptedAssets.ts";

const TERRAIN_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "terrain",
);

const RUNTIME_FILES = Object.keys(ACCEPTED_TERRAIN_ASSETS);

function startTerrainServer(
  overrides: Readonly<Record<string, string | null>> = {},
): Promise<{ server: Server; port: number; base: string }> {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const relative = url.pathname.replace(/^\//, "").replace(/^terrain\//, "");
      if (Object.prototype.hasOwnProperty.call(overrides, relative)) {
        const override = overrides[relative];
        if (override === null) {
          response.writeHead(404);
          response.end("not found");
          return;
        }
        response.writeHead(200, { "content-type": "application/octet-stream" });
        response.end(override);
        return;
      }
      try {
        const body = readFileSync(join(TERRAIN_DIR, relative));
        response.writeHead(200, { "content-type": "application/octet-stream" });
        response.end(body);
      } catch {
        response.writeHead(404);
        response.end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("listen failed");
      const port = address.port;
      resolve({ server, port, base: `http://127.0.0.1:${port}` });
    });
  });
}

function urlsFor(base: string) {
  return assetUrls(`${base}/`);
}

test("loadAppData verifies every runtime asset against the manifest and pins", async () => {
  const { server, base } = await startTerrainServer();
  try {
    const data = await loadAppData(undefined, urlsFor(base));
    assert.equal(data.routing.width, 267);
    assert.equal(data.routing.height, 267);
    // The returned terrain bytes hash to the accepted PNG digest.
    assert.equal(await sha256Hex(data.terrainImage.bytes), ACCEPTED_TERRAIN_ASSETS["ctx-jezero-aoi.png"]);
    assert.equal(data.terrainImage.mimeType, "image/png");
    // The verified grid metadata bytes are byte-identical to the accepted package.
    assert.equal(data.metadata.sourceManifestSha256.length, 64);
  } finally {
    server.close();
  }
});

test("a tampered navigation grid binary is rejected", async () => {
  const { server, base } = await startTerrainServer({
    "navigation_grid.bin": readFileSync(join(TERRAIN_DIR, "navigation_grid.bin")).subarray(0, 418_000),
  });
  try {
    await assert.rejects(
      () => loadAppData(undefined, urlsFor(base)),
      (error: unknown) => {
        assert.ok(error instanceof AssetVerificationError, `unexpected: ${String(error)}`);
        assert.match(error.message, /navigation grid binary/);
        assert.match(error.message, /do not match the accepted digest/);
        return true;
      },
    );
  } finally {
    server.close();
  }
});

test("a substituted terrain PNG is rejected", async () => {
  const { server, base } = await startTerrainServer({
    "ctx-jezero-aoi.png": "SUBSTITUTED-BYTES-NOT-THE-VERIFIED-PNG",
  });
  try {
    await assert.rejects(
      () => loadAppData(undefined, urlsFor(base)),
      (error: unknown) => {
        assert.ok(error instanceof AssetVerificationError);
        assert.match(error.message, /terrain image/);
        return true;
      },
    );
  } finally {
    server.close();
  }
});

test("a schema-valid but byte-different grid metadata is rejected", async () => {
  // Whitespace-only change: parses identically, hashes differently.
  const pretty = `${JSON.stringify(JSON.parse(readFileSync(join(TERRAIN_DIR, "grid_metadata.json"), "utf8")), null, 4)}\n`;
  const { server, base } = await startTerrainServer({ "grid_metadata.json": pretty });
  try {
    await assert.rejects(
      () => loadAppData(undefined, urlsFor(base)),
      (error: unknown) => {
        assert.ok(error instanceof AssetVerificationError);
        assert.match(error.message, /grid metadata/);
        return true;
      },
    );
  } finally {
    server.close();
  }
});

test("replacing the payload AND the manifest together is still rejected", async () => {
  const gridBytes = readFileSync(join(TERRAIN_DIR, "navigation_grid.bin"));
  const tampered = Buffer.concat([gridBytes.subarray(0, 100), Buffer.from([0xff]), gridBytes.subarray(101)]);
  const tamperedDigest = createHash("sha256").update(tampered).digest("hex");
  const manifest = {
    schemaVersion: "1.0",
    files: { ...ACCEPTED_TERRAIN_ASSETS, "navigation_grid.bin": tamperedDigest },
  };
  const { server, base } = await startTerrainServer({
    "navigation_grid.bin": tampered.toString("binary"),
    "asset_manifest.json": JSON.stringify(manifest, null, 2),
  });
  try {
    await assert.rejects(
      () => loadAppData(undefined, urlsFor(base)),
      (error: unknown) => {
        assert.ok(error instanceof AssetVerificationError);
        // The pinned accepted reference catches the manifest substitution.
        assert.match(error.message, /does not match the accepted reference/);
        return true;
      },
    );
  } finally {
    server.close();
  }
});

test("a missing or malformed asset manifest is rejected", async () => {
  const missing = await startTerrainServer({ "asset_manifest.json": null });
  try {
    await assert.rejects(() => loadAppData(undefined, urlsFor(missing.base)), AssetVerificationError);
  } finally {
    missing.server.close();
  }
  const malformed = await startTerrainServer({ "asset_manifest.json": "not json" });
  try {
    await assert.rejects(() => loadAppData(undefined, urlsFor(malformed.base)), AssetVerificationError);
  } finally {
    malformed.server.close();
  }
});

test("a network-level failure is rejected with a clear error", async () => {
  await assert.rejects(
    () => loadAppData(undefined, urlsFor("http://127.0.0.1:9")),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /fetch failed|ECONNREFUSED/i);
      return true;
    },
  );
});

test("the pinned accepted digests match the built assets (drift guard)", () => {
  for (const [filename, digest] of Object.entries(ACCEPTED_TERRAIN_ASSETS)) {
    const bytes = readFileSync(join(TERRAIN_DIR, filename));
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      digest,
      `accepted pin drifted from the built asset: ${filename}`,
    );
  }
});
