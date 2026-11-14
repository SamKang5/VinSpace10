/**
 * Shared test helpers: load the real served data packages from
 * `public/data/` and a tiny static file server for fetch-path tests.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createServer, type Server } from "node:http";
import { loadMarsNavigationGrid, type NavigationGridModel } from "../src/navigationGrid/index.ts";
import {
  expectImageryMatchesGrid,
  parseImageryMetadata,
  type ImageryMetadata,
} from "../src/app/imagery.ts";

const FRONTEND_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

export const PUBLIC_DIR = join(FRONTEND_DIR, "public");
export const DATA_DIR = join(PUBLIC_DIR, "data");

/** Load the real M2-02 + M2-04 packages from disk, fully validated. */
export function loadRealFixtures(): { model: NavigationGridModel; imagery: ImageryMetadata } {
  const rawGrid: unknown = JSON.parse(readFileSync(join(DATA_DIR, "M2_02", "navigation_grid.json"), "utf8"));
  const rawGridMeta: unknown = JSON.parse(readFileSync(join(DATA_DIR, "M2_02", "grid_metadata.json"), "utf8"));
  const rawImagery: unknown = JSON.parse(readFileSync(join(DATA_DIR, "M2_04", "imagery_metadata.json"), "utf8"));
  const model = loadMarsNavigationGrid(rawGrid, rawGridMeta);
  const imagery = parseImageryMetadata(rawImagery);
  expectImageryMatchesGrid(imagery, model);
  return { model, imagery };
}

/** Read one served data file as a parsed JSON value. */
export function readPublicJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(PUBLIC_DIR, relativePath), "utf8")) as unknown;
}

/**
 * Static JSON file server over PUBLIC_DIR for fetch-path tests. Unknown
 * paths answer 404. `overrides` replaces the body for a relative path
 * (used to simulate corrupted packages).
 */
export function startStaticServer(
  overrides: Readonly<Record<string, string>> = {},
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const relative = url.pathname.replace(/^\//, "");
      const override = overrides[relative];
      if (override !== undefined) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(override);
        return;
      }
      try {
        const body = readFileSync(join(PUBLIC_DIR, relative));
        response.writeHead(200, { "content-type": "application/json" });
        response.end(body);
      } catch {
        response.writeHead(404);
        response.end("not found");
      }
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        throw new Error("server failed to listen");
      }
      resolve({ server, port: address.port });
    });
  });
}

/**
 * Synthetic imagery metadata matching the loader's 3x3 fixture grid
 * (bounds [100,170,130,200], affine [10,0,100,0,-10,200], 1 px per cell).
 * The fixture grid has: blocked cell at (1,1), unknown cell at (2,0).
 */
export function makeImageryFixture(): ImageryMetadata {
  return {
    schemaVersion: "1.0",
    image: "fixture.png",
    mimeType: "image/png",
    width: 3,
    height: 3,
    pixelFormat: "8-bit grayscale + alpha",
    imageOrigin: "top-left; pixel x increases east and pixel y increases south",
    crs: {
      name: "Mars 2000 sphere equirectangular",
      wkt: "PROJCS[fixture]",
      radiusMeters: 3396190,
    },
    affine: {
      order: "a,b,c,d,e,f",
      values: [10, 0, 100, 0, -10, 200],
      maps: "x=a*pixelX+b*pixelY+c; y=d*pixelX+e*pixelY+f",
      coordinates: "continuous pixel-corner coordinates",
    },
    bounds: [100, 170, 130, 200],
    resolutionProjectedMeters: [10, 10],
    navigationGrid: {
      width: 3,
      height: 3,
      pixelsPerCell: [1, 1],
      cellCenterToImage: "pixelX=1*(col+0.5), pixelY=1*(row+0.5)",
      metadataSha256: "b".repeat(64),
    },
    source: {
      description: "fixture",
      d08ImageSha256: "d".repeat(64),
      ctxSourceFilename: "fixture_src.tif",
      ctxSourceSha256: "e".repeat(64),
    },
    routeEndpoints: [
      {
        row: 0,
        col: 0,
        imageCornerCoordinates: [0.5, 0.5],
        projectedCoordinates: [105, 195],
        cost: 1.5,
      },
    ],
    limitations: ["Research/demo only; not operational navigation or a safety product."],
  };
}
